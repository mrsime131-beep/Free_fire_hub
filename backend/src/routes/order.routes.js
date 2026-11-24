import { Router } from "express";
import {
  createOrder,
  getOrderDetails,
  getMyOrders,
  getAllOrders,
  updateOrderStatus,
} from "../controllers/order.controller.js";
import {
  optionalAuth,
  requireAuth,
  requireAdmin,
} from "../middlewares/auth.middleware.js";
import { orderAndPaymentLimiter } from "../middlewares/rateLimiter.middleware.js";
import { idempotencyProtection } from "../middlewares/idempotency.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  createOrderSchema,
  orderNumberParamSchema,
  listOrdersQuerySchema,
  updateOrderStatusSchema,
} from "../validators/order.validator.js";

const router = Router();

/**
 * @route   POST /api/orders
 * @desc    নতুন ডায়মন্ড বা মেম্বারশিপ অর্ডার তৈরি করা (Guest এবং Logged-in ইউজার উভয়ের জন্য)
 *          Rate Limiting, Idempotency (ডাবল-ক্লিক সুরক্ষা) এবং Zod Validation যুক্ত
 * @access  Public / Optional Auth
 */
router.post(
  "/",
  orderAndPaymentLimiter,
  optionalAuth,
  idempotencyProtection({ required: false }),
  validate({ body: createOrderSchema }),
  createOrder
);

/**
 * @route   GET /api/orders/my-orders
 * @desc    লগইন করা ইউজারের নিজস্ব সকল অর্ডারের হিস্ট্রি ও পেজিনেশন
 *          (সতর্কতা: এই রাউটটি অবশ্যই /:orderNumber-এর ওপরে থাকতে হবে)
 * @access  Private (Logged-in Customer/Admin)
 */
router.get(
  "/my-orders",
  requireAuth,
  validate({ query: listOrdersQuerySchema }),
  getMyOrders
);

/**
 * @route   GET /api/orders/track/:orderNumber
 * @desc    Order Number (যেমন: FFH-20261124-000001) দিয়ে অর্ডারের লাইভ স্ট্যাটাস ও ডেলিভারি ট্র্যাক করা
 * @access  Public / Optional Auth
 */
router.get(
  "/track/:orderNumber",
  optionalAuth,
  validate({ params: orderNumberParamSchema }),
  getOrderDetails
);

/**
 * @route   GET /api/orders
 * @desc    অ্যাডমিন প্যানেলের জন্য সব অর্ডারের তালিকা, সার্চ এবং স্ট্যাটাস ফিল্টারিং
 * @access  Private (Admin Only)
 */
router.get(
  "/",
  requireAdmin,
  validate({ query: listOrdersQuerySchema }),
  getAllOrders
);

/**
 * @route   GET /api/orders/:orderNumber
 * @desc    নির্দিষ্ট Order Number বা UUID দিয়ে অর্ডারের বিস্তারিত তথ্য দেখা
 * @access  Public / Optional Auth
 */
router.get(
  "/:orderNumber",
  optionalAuth,
  validate({ params: orderNumberParamSchema }),
  getOrderDetails
);

/**
 * @route   PATCH /api/orders/:orderNumber/status
 * @desc    অ্যাডমিনের মাধ্যমে যেকোনো অর্ডারের স্ট্যাটাস ও নোট আপডেট করা
 * @access  Private (Admin Only)
 */
router.patch(
  "/:orderNumber/status",
  requireAdmin,
  validate({
    params: orderNumberParamSchema,
    body: updateOrderStatusSchema,
  }),
  updateOrderStatus
);

export default router;
