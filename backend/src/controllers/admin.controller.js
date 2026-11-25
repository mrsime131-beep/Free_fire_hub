const { asyncHandler } = require('../middlewares/error.middleware');
const adminService = require('../services/admin.service');
const paymentService = require('../services/payment.service');
const auditService = require('../services/audit.service');

/**
 * ১. অ্যাডমিন ড্যাশবোর্ড অ্যানালিটিক্স ও সামারি মেট্রিক্স
 * Endpoint: GET /api/admin/dashboard/metrics
 */
const getDashboardMetricsHandler = asyncHandler(async (req, res) => {
  const metrics = await adminService.getDashboardMetrics();

  return res.status(200).json({
    success: true,
    message: 'অ্যাডমিন ড্যাশবোর্ড মেট্রিক্স সফলভাবে লোড হয়েছে।',
    data: metrics,
    metrics,
  });
});

/**
 * ২. অ্যাডমিন অর্ডার লিস্ট, সার্চ ও ফিল্টারিং
 * Endpoint: GET /api/admin/orders
 */
const getAdminOrdersHandler = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    search = null,
    orderStatus = null,
    paymentStatus = null,
    deliveryStatus = null,
    paymentMethod = null,
    dateFrom = null,
    dateTo = null,
  } = req.query;

  const result = await adminService.getAdminOrdersList({
    page,
    limit,
    search,
    orderStatus,
    paymentStatus,
    deliveryStatus,
    paymentMethod,
    dateFrom,
    dateTo,
  });

  return res.status(200).json({
    success: true,
    data: {
      orders: result.orders,
      pagination: result.pagination,
    },
    orders: result.orders,
    pagination: result.pagination,
  });
});

/**
 * ৩. নির্দিষ্ট অর্ডারের ৩৬০-ডিগ্রি অ্যাডমিন ভিউ (পেমেন্ট, ডেলিভারি অ্যাটেম্পট, হিস্ট্রি ও অডিট লগসহ)
 * Endpoint: GET /api/admin/orders/:orderId
 */
const getAdminOrderDetailsHandler = asyncHandler(async (req, res) => {
  const orderIdentifier = req.orderIdentifier || req.params.orderId;

  const result = await adminService.getAdminOrderDetails(orderIdentifier);

  return res.status(200).json({
    success: true,
    data: result,
    order: result.order,
    timeline: result.timeline,
    auditLogs: result.auditLogs,
  });
});

/**
 * ৪. অ্যাডমিন কর্তৃক পেমেন্ট ভেরিফিকেশন (VERIFIED) অথবা রিজেকশন (REJECTED)
 * পেমেন্ট VERIFIED হলে স্বয়ংক্রিয়ভাবে ডায়মন্ড ডেলিভারি ইঞ্জিন চালু হবে।
 * Endpoint: POST /api/admin/orders/:orderId/verify-payment
 */
const verifyOrderPaymentHandler = asyncHandler(async (req, res) => {
  const orderIdentifier = req.orderIdentifier || req.params.orderId;
  const { status, reason, autoTriggerDelivery } = req.validatedPaymentReview;

  const result = await paymentService.verifyOrRejectPayment({
    orderIdentifier,
    decisionStatus: status,
    reason,
    autoTriggerDelivery,
    adminUser: req.user,
    req,
  });

  const isApproved = result.decision === 'VERIFIED';
  const deliverySucceeded = result.deliveryOutcome?.success === true;

  let responseMessage = '';
  if (!isApproved) {
    responseMessage = `পেমেন্টটি রিজেক্ট (REJECTED) করা হয়েছে। কারণ: ${reason}`;
  } else if (deliverySucceeded) {
    responseMessage = `পেমেন্ট ভেরিফাই সম্পন্ন হয়েছে এবং স্বয়ংক্রিয় ডায়মন্ড ডেলিভারি সফল হয়েছে! (Ref: ${result.deliveryOutcome.deliveryReference})`;
  } else if (result.deliveryTriggered) {
    responseMessage =
      'পেমেন্ট ভেরিফাই সম্পন্ন হয়েছে এবং অর্ডারটি অটোমেটিক ডেলিভারি প্রসেসিং কিউতে পাঠানো হয়েছে।';
  } else {
    responseMessage = 'পেমেন্ট সফলভাবে ভেরিফাই (VERIFIED) করা হয়েছে।';
  }

  return res.status(200).json({
    success: true,
    message: responseMessage,
    data: result,
    order: result.order,
    payment: result.payment,
    deliveryOutcome: result.deliveryOutcome || null,
    timeline: result.timeline,
  });
});

/**
 * ৫. অ্যাডমিন কর্তৃক নিয়ম মেনে অর্ডার/পেমেন্ট/ডেলিভারি স্ট্যাটাস আপডেট
 * Endpoint: PATCH /api/admin/orders/:orderId/status
 */
const updateOrderStatusHandler = asyncHandler(async (req, res) => {
  const orderIdentifier = req.orderIdentifier || req.params.orderId;
  const { orderStatus, paymentStatus, deliveryStatus, reason } =
    req.validatedStatusUpdate;

  const result = await adminService.updateOrderStatusByAdmin({
    orderIdentifier,
    orderStatus,
    paymentStatus,
    deliveryStatus,
    reason,
    adminUser: req.user,
    req,
  });

  return res.status(200).json({
    success: true,
    message: result.changed
      ? `অর্ডার (${result.order.orderNumber})-এর স্ট্যাটাস সফলভাবে আপডেট করা হয়েছে।`
      : 'অর্ডারের স্ট্যাটাসে কোনো পরিবর্তন করা হয়নি।',
    data: result,
    order: result.order,
    timeline: result.timeline,
  });
});

/**
 * ৬. অ্যাডমিন কর্তৃক ব্যর্থ ডেলিভারি ম্যানুয়াল রিট্রাই অনুমোদন ও এক্সিকিউট করা
 * Endpoint: POST /api/admin/orders/:orderId/retry-delivery
 */
const retryOrderDeliveryHandler = asyncHandler(async (req, res) => {
  const orderIdentifier = req.orderIdentifier || req.params.orderId;
  const reason = req.body?.reason
    ? String(req.body.reason).trim().slice(0, 300)
    : 'Manual delivery retry triggered by Admin';
  const executeImmediately = req.body?.executeImmediately !== false;

  const result = await adminService.triggerAdminManualRetry({
    orderIdentifier,
    reason,
    executeImmediately,
    adminUser: req.user,
    req,
  });

  const isDelivered = result.deliveryOutcome?.success === true;

  return res.status(200).json({
    success: true,
    message: isDelivered
      ? `ম্যানুয়াল রিট্রাই সফল হয়েছে! ডায়মন্ড ডেলিভারি সম্পন্ন (Ref: ${result.deliveryOutcome.deliveryReference})।`
      : 'ম্যানুয়াল ডেলিভারি রিট্রাই অনুমোদিত হয়েছে এবং প্রসেস করা হয়েছে।',
    data: result,
    order: result.order,
    deliveryOutcome: result.deliveryOutcome,
    timeline: result.timeline,
  });
});

/**
 * ৭. অ্যাডমিন কর্তৃক অর্ডার বাতিল (Cancel) করা
 * Endpoint: POST /api/admin/orders/:orderId/cancel
 */
const cancelOrderHandler = asyncHandler(async (req, res) => {
  const orderIdentifier = req.orderIdentifier || req.params.orderId;
  const reason = req.body?.reason
    ? String(req.body.reason).trim().slice(0, 300)
    : 'Cancelled by Admin';

  const result = await adminService.cancelOrderByAdmin({
    orderIdentifier,
    reason,
    adminUser: req.user,
    req,
  });

  return res.status(200).json({
    success: true,
    message: result.alreadyCancelled
      ? 'এই অর্ডারটি ইতিমধ্যে বাতিল (CANCELLED) অবস্থায় রয়েছে।'
      : `অর্ডার (${result.order.orderNumber}) সফলভাবে বাতিল করা হয়েছে।`,
    data: result,
    order: result.order,
    timeline: result.timeline,
  });
});

/**
 * ৮. অ্যাডমিন কর্তৃক ভেরিফাইড পেমেন্টের অর্ডার রিফান্ড (Refund) করা
 * Endpoint: POST /api/admin/orders/:orderId/refund
 */
const refundOrderHandler = asyncHandler(async (req, res) => {
  const orderIdentifier = req.orderIdentifier || req.params.orderId;
  const reason = req.body?.reason
    ? String(req.body.reason).trim().slice(0, 300)
    : 'Refunded by Admin due to delivery failure';
  const refundReference = req.body?.refundReference
    ? String(req.body.refundReference).trim().slice(0, 100)
    : null;

  const result = await adminService.refundOrderByAdmin({
    orderIdentifier,
    reason,
    refundReference,
    adminUser: req.user,
    req,
  });

  return res.status(200).json({
    success: true,
    message: result.alreadyRefunded
      ? 'এই অর্ডারটি ইতিমধ্যে রিফান্ড (REFUNDED) করা হয়েছে।'
      : `অর্ডার (${result.order.orderNumber})-এর রিফান্ড সফলভাবে সম্পন্ন হয়েছে।`,
    data: result,
    order: result.order,
    timeline: result.timeline,
  });
});

/**
 * ৯. অ্যাডমিন অডিট লগ (Audit Trail) তালিকা দেখার কন্ট্রোলার
 * Endpoint: GET /api/admin/audit-logs
 */
const getAuditLogsHandler = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 30,
    action = null,
    actorEmail = null,
    orderId = null,
  } = req.query;

  const result = await auditService.getAdminAuditLogs({
    page,
    limit,
    action,
    actorEmail,
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
  getDashboardMetricsHandler,
  getAdminOrdersHandler,
  getAdminOrderDetailsHandler,
  verifyOrderPaymentHandler,
  updateOrderStatusHandler,
  retryOrderDeliveryHandler,
  cancelOrderHandler,
  refundOrderHandler,
  getAuditLogsHandler,
};
