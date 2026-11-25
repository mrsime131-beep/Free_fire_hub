const { asyncHandler } = require('../middlewares/error.middleware');
const deliveryEngine = require('../services/delivery/delivery.engine');
const retryManager = require('../services/delivery/retry.manager');
const env = require('../config/env');

/**
 * ১. নির্দিষ্ট অর্ডারের ডেলিভারি স্ট্যাটাস ও অ্যাটেম্পট বিবরণ দেখার কন্ট্রোলার
 * Endpoint: GET /api/delivery/:orderId
 */
const getDeliveryDetailsHandler = asyncHandler(async (req, res) => {
  const orderIdentifier = req.orderIdentifier || req.params.orderId;

  const details = await deliveryEngine.getDeliveryDetailsByOrder(
    orderIdentifier
  );

  return res.status(200).json({
    success: true,
    deliveryMode: details.delivery?.deliveryMode || env.DELIVERY_MODE,
    data: details,
    delivery: details.delivery,
  });
});

/**
 * ২. ভেরিফাইড পেমেন্টের অর্ডারের জন্য অটোমেটিক ডেলিভারি ইঞ্জিন ট্রিগার করার কন্ট্রোলার
 * Endpoint: POST /api/delivery/:orderId/process
 */
const processOrderDeliveryHandler = asyncHandler(async (req, res) => {
  const orderIdentifier = req.orderIdentifier || req.params.orderId;
  const triggeredBy = req.user?.email || 'ADMIN_TRIGGER';

  const result = await deliveryEngine.processOrderDelivery(orderIdentifier, {
    triggeredBy,
  });

  if (result.alreadyCompleted) {
    return res.status(200).json({
      success: true,
      alreadyCompleted: true,
      message: `এই অর্ডারের ডায়মন্ড ডেলিভারি ইতিমধ্যে সম্পন্ন হয়েছে (Ref: ${result.deliveryReference})।`,
      data: result,
      order: result.order,
      delivery: result.delivery,
    });
  }

  const statusCode = result.success ? 200 : 202;
  const message = result.success
    ? `ডায়মন্ড ডেলিভারি সফলভাবে সম্পন্ন হয়েছে! (Ref: ${result.deliveryReference})`
    : result.willRetry
    ? `ডেলিভারি সাময়িকভাবে বিঘ্নিত হয়েছে। অর্ডারটি স্বয়ংক্রিয় রিট্রাই কিউতে যুক্ত করা হয়েছে। কারণ: ${result.errorMessage}`
    : `ডেলিভারি ব্যর্থ হয়েছে। কারণ: ${result.errorMessage}`;

  return res.status(statusCode).json({
    success: result.success,
    willRetry: Boolean(result.willRetry),
    deliveryMode: result.deliveryMode || env.DELIVERY_MODE,
    isRealDelivery: Boolean(result.isRealDelivery),
    message,
    data: result,
    order: result.order,
    delivery: result.delivery,
  });
});

/**
 * ৩. নির্দিষ্ট অর্ডারের রিট্রাই সামারি ও সাপ্লায়ার এরর হিস্ট্রি দেখার কন্ট্রোলার
 * Endpoint: GET /api/delivery/:orderId/retries
 */
const getOrderRetryHistoryHandler = asyncHandler(async (req, res) => {
  const orderIdentifier = req.orderIdentifier || req.params.orderId;

  const history = await retryManager.getOrderRetryHistory(orderIdentifier);

  return res.status(200).json({
    success: true,
    data: history,
    retrySummary: history.retrySummary,
    attempts: history.attempts,
  });
});

/**
 * ৪. ব্যর্থ ডেলিভারির জন্য অ্যাডমিন কর্তৃক ম্যানুয়াল রিট্রাই অনুমোদন ও এক্সিকিউট করা
 * Endpoint: POST /api/delivery/:orderId/retry
 */
const manualRetryDeliveryHandler = asyncHandler(async (req, res) => {
  const orderIdentifier = req.orderIdentifier || req.params.orderId;
  const reason = req.body?.reason
    ? String(req.body.reason).trim().slice(0, 300)
    : 'Manual retry approved and triggered by Admin';
  const executeImmediately = req.body?.executeImmediately !== false;

  const approval = await retryManager.approveManualRetry({
    orderIdentifier,
    adminUser: req.user,
    reason,
    req,
  });

  let executionOutcome = null;
  if (executeImmediately) {
    executionOutcome = await deliveryEngine.processOrderDelivery(
      approval.order.id,
      {
        triggeredBy: req.user?.email || 'ADMIN_MANUAL_RETRY',
      }
    );
  }

  const isSuccess = executionOutcome?.success === true;

  return res.status(200).json({
    success: true,
    message: isSuccess
      ? `ম্যানুয়াল রিট্রাই সফল হয়েছে! ডায়মন্ড ডেলিভারি সম্পন্ন (Ref: ${executionOutcome.deliveryReference})।`
      : 'ম্যানুয়াল রিট্রাই অনুমোদিত হয়েছে এবং ডেলিভারি প্রসেস করা হয়েছে।',
    data: {
      approval,
      executionOutcome,
    },
    order: executionOutcome?.order || approval.order,
    delivery: executionOutcome?.delivery || approval.delivery,
  });
});

/**
 * ৫. রিট্রাই কিউতে অপেক্ষমাণ অর্ডারগুলো ব্যাচ আকারে প্রসেস করার কন্ট্রোলার
 * Endpoint: POST /api/delivery/retry-queue/process
 */
const processRetryQueueHandler = asyncHandler(async (req, res) => {
  const limit = Number(req.body?.limit || req.query?.limit || 10);

  const result = await deliveryEngine.processRetryQueue(limit);

  return res.status(200).json({
    success: true,
    message: `রিট্রাই কিউ থেকে ${result.processedCount}টি অর্ডার প্রসেস করা হয়েছে।`,
    data: result,
    processedCount: result.processedCount,
    results: result.results,
  });
});

/**
 * ৬. অ্যাডমিনের জন্য সব সাপ্লায়ার ডেলিভারি অ্যাটেম্পট লগ দেখার কন্ট্রোলার
 * Endpoint: GET /api/delivery/logs
 */
const getDeliveryLogsHandler = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 25,
    status = null,
    deliveryMode = null,
    orderId = null,
  } = req.query;

  const result = await deliveryEngine.getDeliveryLogs({
    page,
    limit,
    status,
    deliveryMode,
    orderId,
  });

  return res.status(200).json({
    success: true,
    data: result,
    logs: result.logs,
    pagination: result.pagination,
  });
});

module.exports = {
  getDeliveryDetailsHandler,
  processOrderDeliveryHandler,
  getOrderRetryHistoryHandler,
  manualRetryDeliveryHandler,
  processRetryQueueHandler,
  getDeliveryLogsHandler,
};
