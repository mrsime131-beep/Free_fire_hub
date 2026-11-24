import { Router } from "express";
import {
  triggerOrRetryDelivery,
  getDeliveryStatus,
  getAllDeliveries,
} from "../controllers/delivery.controller.js";
import {
  optionalAuth,
  requireAdmin,
} from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { orderNumberParamSchema } from "../validators/order.validator.js";

const router = Router();

/**
 * @route   GET /api/deliveries
 * @desc    অ্যাডমিন প্যানেলের জন্য সকল ডায়মন্ড ডেলিভারি লগ, স্ট্যাটাস ফিল্টারিং এবং পেজিনেশন
 * @access  Private (Admin Only)
 */
router.get("/", requireAdmin, getAllDeliveries);

/**
 * @route   GET /api/deliveries/:orderNumber
 * @desc    নির্দিষ্ট Order Number (যেমন: FFH-20261124-000001) বা Order UUID দিয়ে ডেলিভারি স্ট্যাটাস ট্র্যাক করা
 * @access  Public / Optional Auth
 */
router.get(
  "/:orderNumber",
  optionalAuth,
  validate({ params: orderNumberParamSchema }),
  getDeliveryStatus
);

/**
 * @route   POST /api/deliveries/:orderNumber/trigger
 * @desc    পেমেন্ট VERIFIED থাকা কোনো অর্ডারের ডায়মন্ড ডেলিভারি ম্যানুয়ালি ট্রিগার করা
 * @access  Private (Admin Only)
 */
router.post(
  "/:orderNumber/trigger",
  requireAdmin,
  validate({ params: orderNumberParamSchema }),
  triggerOrRetryDelivery
);

/**
 * @route   POST /api/deliveries/:orderNumber/retry
 * @desc    পূর্বে FAILED হওয়া কোনো ডায়মন্ড ডেলিভারি ওয়ান-ক্লিকে পুনরায় চেষ্টা (Retry) করা
 * @access  Private (Admin Only)
 */
router.post(
  "/:orderNumber/retry",
  requireAdmin,
  validate({ params: orderNumberParamSchema }),
  triggerOrRetryDelivery
);

export default router;
