const prisma = require('../config/prisma');
const env = require('../config/env');
const { processRetryQueue } = require('../services/delivery/delivery.engine');
const { DELIVERY_STATUS } = require('../utils/stateMachine');

let retryTimer = null;
let cleanupTimer = null;
let isCycleRunning = false;

// ৩ মিনিটের বেশি সময় ধরে PROCESSING লকে আটকে থাকা ডেলিভারির টাইমআউট সীমা
const STALE_LOCK_THRESHOLD_MS = 3 * 60 * 1000;

/**
 * ১. সার্ভার রিস্টার্ট বা নেটওয়ার্ক ক্র্যাশের কারণে আটকে থাকা (Stale Lock) ডেলিভারি রিলিজ করা
 */
const releaseStaleDeliveryLocks = async () => {
  try {
    const staleThreshold = new Date(Date.now() - STALE_LOCK_THRESHOLD_MS);

    const released = await prisma.delivery.updateMany({
      where: {
        status: DELIVERY_STATUS.PROCESSING,
        lockedAt: {
          lt: staleThreshold,
        },
      },
      data: {
        status: DELIVERY_STATUS.RETRY_PENDING,
        lockedAt: null,
        lockedBy: null,
        nextRetryAt: new Date(),
        lastErrorMessage:
          'Previous delivery lock expired due to process timeout. Re-queued for safe verification and retry.',
      },
    });

    if (released.count > 0) {
      console.log(
        `🔓 [RetryWorker] Released ${released.count} stale delivery lock(s) for safe retry.`
      );
    }

    return released.count;
  } catch (error) {
    console.error('⚠️ [RetryWorker] Stale lock cleanup warning:', error.message);
    return 0;
  }
};

/**
 * ২. মেয়াদোত্তীর্ণ (২৪ ঘণ্টা পার হওয়া) Idempotency Record পরিষ্কার করা
 * যাতে Neon PostgreSQL ডাটাবেসের স্টোরেজ অযথা পূর্ণ না হয়।
 */
const cleanupExpiredIdempotencyRecords = async () => {
  try {
    const now = new Date();
    const deleted = await prisma.idempotencyRecord.deleteMany({
      where: {
        expiresAt: {
          lt: now,
        },
      },
    });

    if (deleted.count > 0) {
      console.log(
        `🧹 [RetryWorker] Cleaned up ${deleted.count} expired idempotency record(s).`
      );
    }

    return deleted.count;
  } catch (error) {
    console.error(
      '⚠️ [RetryWorker] Idempotency cleanup warning:',
      error.message
    );
    return 0;
  }
};

/**
 * ৩. রিট্রাই কিউয়ের একটি একক সাইকেল রান করা (ওভারল্যাপ বা ডাবল রান প্রতিরোধসহ)
 */
const runRetryWorkerCycle = async () => {
  if (isCycleRunning) {
    return { skipped: true, reason: 'Previous cycle still running' };
  }

  isCycleRunning = true;

  try {
    await releaseStaleDeliveryLocks();

    const batchResult = await processRetryQueue(10);

    if (batchResult.processedCount > 0) {
      console.log(
        `⚡ [RetryWorker] Processed ${batchResult.processedCount} queued delivery retry order(s).`
      );
    }

    return {
      skipped: false,
      processedCount: batchResult.processedCount,
      results: batchResult.results,
    };
  } catch (error) {
    console.error('❌ [RetryWorker] Cycle execution error:', error.message);
    return {
      skipped: false,
      error: error.message,
    };
  } finally {
    isCycleRunning = false;
  }
};

/**
 * ৪. সার্ভার স্টার্টআপের সময় ব্যাকগ্রাউন্ড রিট্রাই ওয়ার্কার চালু করা
 */
const startRetryWorker = (options = {}) => {
  const retryIntervalMs =
    Number(options.retryIntervalMs) ||
    Number(env.RETRY_BASE_DELAY_MS) ||
    30000; // ডিফল্ট ৩০ সেকেন্ড
  const cleanupIntervalMs =
    Number(options.cleanupIntervalMs) || 30 * 60 * 1000; // প্রতি ৩০ মিনিটে ডাটাবেস ক্লিনআপ

  if (retryTimer) {
    return;
  }

  console.log(
    `🚀 [RetryWorker] Background delivery retry engine started (Interval: ${Math.round(
      retryIntervalMs / 1000
    )}s, Mode: ${env.DELIVERY_MODE})`
  );

  // প্রথমবার সার্ভার চালুর ১০ সেকেন্ড পর একটি প্রারম্ভিক চেক চালানো
  const initialTimer = setTimeout(() => {
    runRetryWorkerCycle().catch(() => {});
    cleanupExpiredIdempotencyRecords().catch(() => {});
  }, 10000);

  if (initialTimer.unref) {
    initialTimer.unref();
  }

  retryTimer = setInterval(() => {
    runRetryWorkerCycle().catch(() => {});
  }, retryIntervalMs);

  cleanupTimer = setInterval(() => {
    cleanupExpiredIdempotencyRecords().catch(() => {});
  }, cleanupIntervalMs);

  if (retryTimer.unref) {
    retryTimer.unref();
  }
  if (cleanupTimer.unref) {
    cleanupTimer.unref();
  }
};

/**
 * ৫. সার্ভার শাটডাউনের সময় নিরাপদে ওয়ার্কার বন্ধ করা
 */
const stopRetryWorker = () => {
  if (retryTimer) {
    clearInterval(retryTimer);
    retryTimer = null;
  }
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
  console.log('🛑 [RetryWorker] Background retry worker stopped.');
};

module.exports = {
  releaseStaleDeliveryLocks,
  cleanupExpiredIdempotencyRecords,
  runRetryWorkerCycle,
  startRetryWorker,
  stopRetryWorker,
};
