const prisma = require('../../config/prisma');
const env = require('../../config/env');
const { AppError } = require('../../middlewares/error.middleware');
const {
  ORDER_STATUS,
  PAYMENT_STATUS,
  DELIVERY_STATUS,
  buildStatusHistoryPayload,
} = require('../../utils/stateMachine');
const { notifyDeliveryFailed } = require('../notification.service');
const { logAdminOrderAction } = require('../audit.service');

/**
 * ১. এক্সপোনেনশিয়াল ব্যাকঅফ (Exponential Backoff) পদ্ধতিতে পরবর্তী রিট্রাইয়ের সময় নির্ধারণ করা
 * উদাহরণ: ১ম ব্যর্থতায় ৩০ সেকেন্ড, ২য় ব্যর্থতায় ৬০ সেকেন্ড, ৩য় ব্যর্থতায় ১২০ সেকেন্ড বিরতি।
 */
const calculateNextRetryTime = (
  attemptCount,
  baseDelayMs = env.RETRY_BASE_DELAY_MS || 30000
) => {
  const safeAttempt = Math.max(1, Number(attemptCount) || 1);
  const multiplier = Math.pow(2, safeAttempt - 1);
  const delayMs = Math.min(baseDelayMs * multiplier, 30 * 60 * 1000); // সর্বোচ্চ ৩০ মিনিট ক্যাপিং
  return new Date(Date.now() + delayMs);
};

/**
 * ২. সাপ্লায়ার এররটি স্বয়ংক্রিয় রিট্রাইয়ের যোগ্য কি না তা যাচাই করা
 */
const isEligibleForAutoRetry = (adapterResult, currentAttemptCount, maxRetries) => {
  if (currentAttemptCount >= maxRetries) {
    return false;
  }

  // যদি সাপ্লায়ার কনফিগারেশন মিসিং বা স্থায়ী ক্লায়েন্ট এরর (400/401/403/422) হয়, তবে অটো-রিট্রাই না করে অ্যাডমিন রিভিউয়ের জন্য FAILED করা হবে
  const nonRetryableErrorCodes = [
    'LIVE_SUPPLIER_NOT_CONFIGURED',
    'LIVE_SUPPLIER_ENDPOINT_MISSING',
    'LIVE_SUPPLIER_CREDENTIALS_MISSING',
    'INVALID_DELIVERY_ORDER_DATA',
  ];

  if (
    adapterResult?.errorCode &&
    nonRetryableErrorCodes.includes(adapterResult.errorCode)
  ) {
    return false;
  }

  return (
    adapterResult?.status === 'RETRY_PENDING' ||
    adapterResult?.isTimeout === true ||
    adapterResult?.httpStatus >= 500
  );
};

/**
 * ৩. ডেলিভারি ব্যর্থ হলে রিট্রাই শিডিউল অথবা স্থায়ী FAILED স্ট্যাটাস সেট করার কোর ফাংশন
 * (Part 7: Failed Order কখনোই স্বয়ংক্রিয়ভাবে Completed করা যাবে না এবং কাস্টমারকে সঠিক স্ট্যাটাস দেখাতে হবে)
 */
const handleDeliveryFailure = async ({
  order,
  delivery,
  adapterResult,
  currentAttemptCount,
  triggeredBy = 'SYSTEM',
}) => {
  const maxRetries = Number(delivery?.maxRetries ?? env.MAX_DELIVERY_RETRIES ?? 3);
  const canAutoRetry = isEligibleForAutoRetry(
    adapterResult,
    currentAttemptCount,
    maxRetries
  );

  const errorCode =
    adapterResult?.errorCode || 'DELIVERY_EXECUTION_FAILED';
  const errorMessage =
    adapterResult?.errorMessage ||
    'সাপ্লায়ার সার্ভারে ডায়মন্ড ডেলিভারি সম্পন্ন করা যায়নি।';

  const nextRetryAt = canAutoRetry
    ? calculateNextRetryTime(currentAttemptCount)
    : null;

  const targetDeliveryStatus = canAutoRetry
    ? DELIVERY_STATUS.RETRY_PENDING
    : DELIVERY_STATUS.FAILED;

  // পেমেন্ট ভেরিফাইড থাকলেও ডেলিভারি ফেইল হলে অর্ডার স্ট্যাটাস কখনোই COMPLETED হবে না
  const targetOrderStatus = canAutoRetry
    ? ORDER_STATUS.DELIVERY_PENDING
    : ORDER_STATUS.FAILED;

  const updatedResult = await prisma.$transaction(async (tx) => {
    const updatedDelivery = await tx.delivery.update({
      where: { id: delivery.id },
      data: {
        status: targetDeliveryStatus,
        attemptCount: currentAttemptCount,
        nextRetryAt,
        lastErrorCode: String(errorCode).slice(0, 100),
        lastErrorMessage: String(errorMessage).slice(0, 500),
        lockedAt: null,
        lockedBy: null,
      },
    });

    const updatedOrder = await tx.order.update({
      where: { id: order.id },
      data: {
        orderStatus: targetOrderStatus,
        deliveryStatus: targetDeliveryStatus,
      },
    });

    await tx.orderStatusHistory.create({
      data: buildStatusHistoryPayload({
        orderId: order.id,
        previousOrderStatus: order.orderStatus,
        newOrderStatus: targetOrderStatus,
        previousPaymentStatus: order.paymentStatus,
        newPaymentStatus: order.paymentStatus,
        previousDeliveryStatus: order.deliveryStatus,
        newDeliveryStatus: targetDeliveryStatus,
        changedBy: triggeredBy,
        reason: canAutoRetry
          ? `ডেলিভারি ব্যর্থ হয়েছে (চেষ্টা ${currentAttemptCount}/${maxRetries})। পরবর্তী রিট্রাই শিডিউল করা হয়েছে। কারণ: ${errorMessage}`
          : `ডেলিভারি স্থায়ীভাবে ব্যর্থ হয়েছে (চেষ্টা ${currentAttemptCount}/${maxRetries})। কারণ: ${errorMessage}`,
        metadata: {
          attemptCount: currentAttemptCount,
          maxRetries,
          errorCode,
          nextRetryAt: nextRetryAt ? nextRetryAt.toISOString() : null,
        },
      }),
    });

    return {
      order: updatedOrder,
      delivery: updatedDelivery,
      willRetry: canAutoRetry,
      nextRetryAt,
    };
  });

  // কাস্টমার এবং অ্যাডমিনকে সঠিক স্ট্যাটাস নোটিফিকেশন পাঠানো
  await notifyDeliveryFailed(
    updatedResult.order,
    errorMessage,
    updatedResult.willRetry
  );

  return updatedResult;
};

/**
 * ৪. রিট্রাই কিউ (Retry Queue) থেকে যেসব অর্ডারের রিট্রাই করার সময় হয়েছে সেগুলো বের করা
 */
const getDueRetryDeliveries = async (limit = 10) => {
  const now = new Date();
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 10));

  return prisma.delivery.findMany({
    where: {
      status: DELIVERY_STATUS.RETRY_PENDING,
      nextRetryAt: {
        lte: now,
      },
      lockedAt: null,
      order: {
        paymentStatus: PAYMENT_STATUS.VERIFIED,
        orderStatus: {
          notIn: [
            ORDER_STATUS.COMPLETED,
            ORDER_STATUS.CANCELLED,
            ORDER_STATUS.REFUNDED,
          ],
        },
      },
    },
    include: {
      order: true,
      supplier: true,
    },
    orderBy: {
      nextRetryAt: 'asc',
    },
    take: safeLimit,
  });
};

/**
 * ৫. অ্যাডমিন কর্তৃক ম্যানুয়াল রিট্রাই অনুমোদন (Part 7 & Part 10: Manual Retry Approval)
 * সর্বোচ্চ রিট্রাই সীমা শেষ হয়ে যাওয়ার পরও অ্যাডমিন যাচাই করে পুনরায় ডেলিভারির অনুমতি দিতে পারবেন।
 */
const approveManualRetry = async ({
  orderIdentifier,
  adminUser,
  reason = 'Manual retry approved by Admin',
  req = null,
}) => {
  const order = await prisma.order.findFirst({
    where: {
      OR: [{ id: orderIdentifier }, { orderNumber: orderIdentifier }],
    },
    include: {
      delivery: true,
    },
  });

  if (!order) {
    throw new AppError(
      'রিট্রাই করার জন্য অর্ডারটি খুঁজে পাওয়া যায়নি।',
      404,
      'ORDER_NOT_FOUND'
    );
  }

  // নিরাপত্তা চেক ১: পেমেন্ট ভেরিফাইড না হলে ডেলিভারি রিট্রাই করা যাবে না
  if (order.paymentStatus !== PAYMENT_STATUS.VERIFIED) {
    throw new AppError(
      `পেমেন্ট ভেরিফাইড (VERIFIED) না হওয়া পর্যন্ত ডেলিভারি রিট্রাই করা যাবে না। বর্তমান পেমেন্ট স্ট্যাটাস: ${order.paymentStatus}`,
      400,
      'RETRY_UNVERIFIED_PAYMENT_BLOCKED'
    );
  }

  // নিরাপত্তা চেক ২: ইতিমধ্যে ডেলিভারি সম্পন্ন হলে ডুপ্লিকেট রিট্রাই সম্পূর্ণ নিষিদ্ধ
  if (
    order.orderStatus === ORDER_STATUS.COMPLETED ||
    order.deliveryStatus === DELIVERY_STATUS.COMPLETED ||
    order.delivery?.status === DELIVERY_STATUS.COMPLETED ||
    order.delivery?.deliveryReference
  ) {
    throw new AppError(
      'এই অর্ডারের ডায়মন্ড ডেলিভারি ইতিমধ্যে সম্পন্ন হয়েছে। ডুপ্লিকেট ডেলিভারি প্রতিরোধের জন্য পুনরায় রিট্রাই ব্লক করা হয়েছে।',
      409,
      'DUPLICATE_DELIVERY_RETRY_BLOCKED'
    );
  }

  if (
    order.orderStatus === ORDER_STATUS.CANCELLED ||
    order.orderStatus === ORDER_STATUS.REFUNDED
  ) {
    throw new AppError(
      `বাতিল বা রিফান্ডকৃত (${order.orderStatus}) অর্ডারে ডেলিভারি রিট্রাই করা যাবে না।`,
      400,
      'RETRY_TERMINATED_ORDER_BLOCKED'
    );
  }

  const currentAttempts = Number(order.delivery?.attemptCount || 0);
  const currentMaxRetries = Number(
    order.delivery?.maxRetries || env.MAX_DELIVERY_RETRIES || 3
  );
  const updatedMaxRetries =
    currentAttempts >= currentMaxRetries
      ? currentAttempts + 1
      : currentMaxRetries;

  const previousState = {
    orderStatus: order.orderStatus,
    paymentStatus: order.paymentStatus,
    deliveryStatus: order.deliveryStatus,
    attemptCount: currentAttempts,
    maxRetries: currentMaxRetries,
  };

  const result = await prisma.$transaction(async (tx) => {
    const updatedDelivery = await tx.delivery.upsert({
      where: { orderId: order.id },
      update: {
        status: DELIVERY_STATUS.QUEUED,
        maxRetries: updatedMaxRetries,
        nextRetryAt: new Date(),
        lockedAt: null,
        lockedBy: null,
      },
      create: {
        orderId: order.id,
        status: DELIVERY_STATUS.QUEUED,
        deliveryMode: env.DELIVERY_MODE,
        attemptCount: 0,
        maxRetries: updatedMaxRetries,
        nextRetryAt: new Date(),
      },
    });

    const updatedOrder = await tx.order.update({
      where: { id: order.id },
      data: {
        orderStatus: ORDER_STATUS.DELIVERY_PENDING,
        deliveryStatus: DELIVERY_STATUS.QUEUED,
      },
    });

    await tx.orderStatusHistory.create({
      data: buildStatusHistoryPayload({
        orderId: order.id,
        previousOrderStatus: order.orderStatus,
        newOrderStatus: ORDER_STATUS.DELIVERY_PENDING,
        previousPaymentStatus: order.paymentStatus,
        newPaymentStatus: order.paymentStatus,
        previousDeliveryStatus: order.deliveryStatus,
        newDeliveryStatus: DELIVERY_STATUS.QUEUED,
        changedBy: adminUser?.email || 'ADMIN',
        reason,
        metadata: {
          manualRetryApproved: true,
          previousAttempts: currentAttempts,
          newMaxRetries: updatedMaxRetries,
        },
      }),
    });

    await logAdminOrderAction(
      {
        adminUser,
        action: 'MANUAL_DELIVERY_RETRY_APPROVED',
        order,
        previousState,
        newState: {
          orderStatus: updatedOrder.orderStatus,
          deliveryStatus: updatedOrder.deliveryStatus,
          maxRetries: updatedMaxRetries,
        },
        reason,
        req,
      },
      tx
    );

    return {
      order: updatedOrder,
      delivery: updatedDelivery,
    };
  });

  return result;
};

/**
 * ৬. নির্দিষ্ট অর্ডারের সম্পূর্ণ রিট্রাই ইতিহাস (Retry History & Supplier Error Logs) দেখার ফাংশন
 */
const getOrderRetryHistory = async (orderIdentifier) => {
  const order = await prisma.order.findFirst({
    where: {
      OR: [{ id: orderIdentifier }, { orderNumber: orderIdentifier }],
    },
    include: {
      delivery: {
        include: {
          supplier: {
            select: {
              id: true,
              code: true,
              name: true,
              adapterType: true,
            },
          },
          attempts: {
            orderBy: {
              attemptNumber: 'asc',
            },
          },
        },
      },
    },
  });

  if (!order) {
    throw new AppError(
      'অর্ডারটি খুঁজে পাওয়া যায়নি।',
      404,
      'ORDER_NOT_FOUND'
    );
  }

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    orderStatus: order.orderStatus,
    paymentStatus: order.paymentStatus,
    deliveryStatus: order.deliveryStatus,
    retrySummary: {
      attemptCount: order.delivery?.attemptCount || 0,
      maxRetries: order.delivery?.maxRetries || env.MAX_DELIVERY_RETRIES || 3,
      nextRetryAt: order.delivery?.nextRetryAt || null,
      lastErrorCode: order.delivery?.lastErrorCode || null,
      lastErrorMessage: order.delivery?.lastErrorMessage || null,
    },
    attempts: order.delivery?.attempts || [],
  };
};

module.exports = {
  calculateNextRetryTime,
  isEligibleForAutoRetry,
  handleDeliveryFailure,
  getDueRetryDeliveries,
  approveManualRetry,
  getOrderRetryHistory,
};
