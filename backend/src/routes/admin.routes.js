const express = require('express');
const router = express.Router();

const {
  authenticate,
  requireAdmin,
} = require('../middlewares/auth.middleware');
const {
  validateOrderIdParam,
  validateAdminPaymentVerification,
  validateAdminStatusUpdate,
} = require('../middlewares/validate.middleware');

const {
  getDashboardMetricsHandler,
  getAdminOrdersHandler,
  getAdminOrderDetailsHandler,
  verifyOrderPaymentHandler,
  updateOrderStatusHandler,
  retryOrderDeliveryHandler,
  cancelOrderHandler,
  refundOrderHandler,
  getAuditLogsHandler,
} = require('../controllers/admin.controller');

// এই রাউটারের প্রতিটি এন্ডপয়েন্টের জন্য JWT লগইন এবং ADMIN/SUPER_ADMIN রোল বাধ্যতামূলক
router.use(authenticate, requireAdmin);

/**
 * ১. অ্যাডমিন ড্যাশবোর্ড অ্যানালিটিক্স ও সামারি মেট্রিক্স
 * GET /api/admin/dashboard/metrics
 * GET /api/admin/metrics
 */
router.get('/dashboard/metrics', getDashboardMetricsHandler);
router.get('/metrics', getDashboardMetricsHandler);

/**
 * ২. অ্যাডমিন অডিট লগ (Audit Trail) তালিকা
 * GET /api/admin/audit-logs
 */
router.get('/audit-logs', getAuditLogsHandler);

/**
 * ৩. অ্যাডমিন অর্ডার লিস্ট, সার্চ এবং ফিল্টারিং
 * GET /api/admin/orders
 */
router.get('/orders', getAdminOrdersHandler);

/**
 * ৪. নির্দিষ্ট অর্ডারের ৩৬০-ডিগ্রি অ্যাডমিন ভিউ (পেমেন্ট, ডেলিভারি অ্যাটেম্পট, হিস্ট্রি ও অডিট লগসহ)
 * GET /api/admin/orders/:orderId
 */
router.get(
  '/orders/:orderId',
  validateOrderIdParam,
  getAdminOrderDetailsHandler
);

/**
 * ৫. অ্যাডমিন কর্তৃক ম্যানুয়াল পেমেন্ট ভেরিফিকেশন (VERIFIED) অথবা রিজেকশন (REJECTED)
 * পেমেন্ট VERIFIED হলে স্বয়ংক্রিয়ভাবে ডায়মন্ড ডেলিভারি ইঞ্জিন চালু হবে।
 * POST /api/admin/orders/:orderId/verify-payment
 * PATCH /api/admin/orders/:orderId/verify-payment
 */
router.post(
  '/orders/:orderId/verify-payment',
  validateOrderIdParam,
  validateAdminPaymentVerification,
  verifyOrderPaymentHandler
);

router.patch(
  '/orders/:orderId/verify-payment',
  validateOrderIdParam,
  validateAdminPaymentVerification,
  verifyOrderPaymentHandler
);

/**
 * ৬. অ্যাডমিন কর্তৃক নিয়ম মেনে অর্ডার/পেমেন্ট/ডেলিভারি স্ট্যাটাস আপডেট
 * PATCH /api/admin/orders/:orderId/status
 * PUT /api/admin/orders/:orderId/status
 */
router.patch(
  '/orders/:orderId/status',
  validateOrderIdParam,
  validateAdminStatusUpdate,
  updateOrderStatusHandler
);

router.put(
  '/orders/:orderId/status',
  validateOrderIdParam,
  validateAdminStatusUpdate,
  updateOrderStatusHandler
);

/**
 * ৭. ব্যর্থ ডেলিভারির জন্য অ্যাডমিন কর্তৃক ম্যানুয়াল রিট্রাই অনুমোদন ও তাৎক্ষণিক ডেলিভারি এক্সিকিউশন
 * POST /api/admin/orders/:orderId/retry-delivery
 */
router.post(
  '/orders/:orderId/retry-delivery',
  validateOrderIdParam,
  retryOrderDeliveryHandler
);

/**
 * ৮. অ্যাডমিন কর্তৃক অর্ডার বাতিল (Cancel) করা
 * POST /api/admin/orders/:orderId/cancel
 */
router.post(
  '/orders/:orderId/cancel',
  validateOrderIdParam,
  cancelOrderHandler
);

/**
 * ৯. অ্যাডমিন কর্তৃক ভেরিফাইড পেমেন্টের অর্ডার রিফান্ড (Refund) করা
 * POST /api/admin/orders/:orderId/refund
 */
router.post(
  '/orders/:orderId/refund',
  validateOrderIdParam,
  refundOrderHandler
);

module.exports = router;
