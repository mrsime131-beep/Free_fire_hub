const express = require('express');
const router = express.Router();

const { optionalAuth } = require('../middlewares/auth.middleware');
const { idempotencyProtection } = require('../middlewares/idempotency.middleware');
const {
  orderCreationLimiter,
  paymentSubmissionLimiter,
  trackingRateLimiter,
} = require('../middlewares/rateLimiter.middleware');
const {
  validateOrderCreation,
  validatePaymentSubmission,
  validateOrderIdParam,
} = require('../middlewares/validate.middleware');

const {
  getPaymentInstructionsHandler,
  createOrderHandler,
  submitOrderPaymentHandler,
  trackOrderPublicHandler,
  getOrderDetailsHandler,
  getMyOrdersHandler,
} = require('../controllers/order.controller');

/**
 * ১. ম্যানুয়াল পেমেন্ট নির্দেশনা (bKash, Nagad, Rocket নাম্বার ও নিয়মাবলি)
 * GET /api/orders/payment-instructions
 */
router.get('/payment-instructions', getPaymentInstructionsHandler);

/**
 * ২. কাস্টমার বা গেস্টের নিজস্ব অর্ডার হিস্ট্রি লিস্ট
 * GET /api/orders/my-orders
 * GET /api/orders
 */
router.get('/my-orders', optionalAuth, getMyOrdersHandler);
router.get('/', optionalAuth, getMyOrdersHandler);

/**
 * ৩. পাবলিক লাইভ অর্ডার ট্র্যাকিং (মাস্কড Player UID ও ৫-ধাপের টাইমলাইনসহ)
 * GET /api/orders/track/:orderId
 */
router.get(
  '/track/:orderId',
  trackingRateLimiter,
  validateOrderIdParam,
  trackOrderPublicHandler
);

/**
 * ৪. নতুন স্মার্ট অর্ডার তৈরি (রেট লিমিট, ইনপুট ভ্যালিডেশন ও ডুপ্লিকেট অর্ডার ইডেমপোটেন্সি সুরক্ষাসহ)
 * POST /api/orders
 */
router.post(
  '/',
  optionalAuth,
  orderCreationLimiter,
  validateOrderCreation,
  idempotencyProtection(),
  createOrderHandler
);

/**
 * ৫. অর্ডারের বিপরীতে ম্যানুয়াল পেমেন্ট (TrxID ও Sender Number) সাবমিশন
 * POST /api/orders/:orderId/payment
 */
router.post(
  '/:orderId/payment',
  optionalAuth,
  paymentSubmissionLimiter,
  validateOrderIdParam,
  validatePaymentSubmission,
  idempotencyProtection(),
  submitOrderPaymentHandler
);

/**
 * ৬. নির্দিষ্ট অর্ডারের বিস্তারিত তথ্য (মালিক বা অ্যাডমিনের জন্য পূর্ণ ভিউ, অন্যদের জন্য মাস্কড ভিউ)
 * GET /api/orders/:orderId
 */
router.get(
  '/:orderId',
  optionalAuth,
  validateOrderIdParam,
  getOrderDetailsHandler
);

module.exports = router;
