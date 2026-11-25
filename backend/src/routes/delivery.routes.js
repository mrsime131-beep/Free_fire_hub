const express = require('express');
const router = express.Router();

const {
  authenticate,
  requireAdmin,
} = require('../middlewares/auth.middleware');
const { validateOrderIdParam } = require('../middlewares/validate.middleware');

const {
  getDeliveryDetailsHandler,
  processOrderDeliveryHandler,
  getOrderRetryHistoryHandler,
  manualRetryDeliveryHandler,
  processRetryQueueHandler,
  getDeliveryLogsHandler,
} = require('../controllers/delivery.controller');

// ডেলিভারি ইঞ্জিন ও সাপ্লায়ার লগ নিয়ন্ত্রণের প্রতিটি রাউটে অ্যাডমিন অথেনটিকেশন বাধ্যতামূলক
router.use(authenticate, requireAdmin);

/**
 * ১. সব সাপ্লায়ার ডেলিভারি অ্যাটেম্পট লগ দেখা (ফিল্টার ও পেজিনেশনসহ)
 * GET /api/delivery/logs
 * (নোট: ডাইনামিক /:orderId রাউটের উপরে রাখা হয়েছে যেন Express 'logs'-কে orderId মনে না করে)
 */
router.get('/logs', getDeliveryLogsHandler);

/**
 * ২. রিট্রাই কিউতে অপেক্ষমাণ (RETRY_PENDING) অর্ডারগুলো ব্যাচ আকারে প্রসেস করা
 * POST /api/delivery/retry-queue/process
 */
router.post('/retry-queue/process', processRetryQueueHandler);

/**
 * ৩. নির্দিষ্ট অর্ডারের ডেলিভারি স্ট্যাটাস ও সাপ্লায়ার অ্যাটেম্পট বিবরণ দেখা
 * GET /api/delivery/:orderId
 */
router.get(
  '/:orderId',
  validateOrderIdParam,
  getDeliveryDetailsHandler
);

/**
 * ৪. ভেরিফাইড পেমেন্টের অর্ডারের জন্য অটোমেটিক ডেলিভারি ইঞ্জিন ট্রিগার করা
 * POST /api/delivery/:orderId/process
 */
router.post(
  '/:orderId/process',
  validateOrderIdParam,
  processOrderDeliveryHandler
);

/**
 * ৫. নির্দিষ্ট অর্ডারের রিট্রাই সামারি ও সাপ্লায়ার এরর হিস্ট্রি দেখা
 * GET /api/delivery/:orderId/retries
 */
router.get(
  '/:orderId/retries',
  validateOrderIdParam,
  getOrderRetryHistoryHandler
);

/**
 * ৬. ব্যর্থ ডেলিভারির জন্য অ্যাডমিন কর্তৃক ম্যানুয়াল রিট্রাই অনুমোদন ও এক্সিকিউট করা
 * POST /api/delivery/:orderId/retry
 */
router.post(
  '/:orderId/retry',
  validateOrderIdParam,
  manualRetryDeliveryHandler
);

module.exports = router;
