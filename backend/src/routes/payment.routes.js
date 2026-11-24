import { Router } from "express";
import {
  submitPayment,
  verifyPayment,
  getPaymentDetails,
  getAllPayments,
} from "../controllers/payment.controller.js";
import {
  optionalAuth,
  requireAdmin,
} from "../middlewares/auth.middleware.js";
import { orderAndPaymentLimiter } from "../middlewares/rateLimiter.middleware.js";
import { idempotencyProtection } from "../middlewares/idempotency.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  submitPaymentSchema,
  verifyPaymentSchema,
  paymentOrderParamSchema,
  listPaymentsQuerySchema,
} from "../validators/payment.validator.js";

const router = Router();

/**
 * @route   POST /api/payments/submit
 * @desc    Request Body-তে orderNumber, senderNumber এবং transactionReference (TrxID) পাঠিয়ে পেমেন্ট জমা দেওয়া
 * @access  Public / Optional Auth (Rate Limited & Idempotency Protected)
 */
router.post(
  "/submit",
  orderAndPaymentLimiter,
  optionalAuth,
  idempotencyProtection({ required: false }),
  validate({ body: submitPaymentSchema }),
  submitPayment
);

/**
 * @route   POST /api/payments/:orderNumber/submit
 * @desc    URL Parameter-এ Order Number রেখে বিকাশ/নগদ/রকেট পেমেন্ট তথ্য (Sender Number ও TrxID) জমা দেওয়া
 * @access  Public / Optional Auth (Rate Limited & Idempotency Protected)
 */
router.post(
  "/:orderNumber/submit",
  orderAndPaymentLimiter,
  optionalAuth,
  idempotencyProtection({ required: false }),
  validate({
    params: paymentOrderParamSchema,
    body: submitPaymentSchema,
  }),
  submitPayment
);

/**
 * @route   GET /api/payments
 * @desc    অ্যাডমিন প্যানেলের জন্য সকল পেমেন্টের তালিকা, মেথড/স্ট্যাটাস ফিল্টারিং এবং TrxID সার্চ
 * @access  Private (Admin Only)
 */
router.get(
  "/",
  requireAdmin,
  validate({ query: listPaymentsQuerySchema }),
  getAllPayments
);

/**
 * @route   GET /api/payments/:orderNumber
 * @desc    নির্দিষ্ট অর্ডার নম্বর বা পেমেন্ট আইডি দিয়ে পেমেন্টের বর্তমান স্ট্যাটাস দেখা
 * @access  Public / Optional Auth
 */
router.get(
  "/:orderNumber",
  optionalAuth,
  validate({ params: paymentOrderParamSchema }),
  getPaymentDetails
);

/**
 * @route   PATCH /api/payments/:orderNumber/verify
 * @desc    অ্যাডমিনের মাধ্যমে পেমেন্ট VERIFIED, REJECTED অথবা REFUNDED করা
 *          (VERIFIED করার সাথে সাথে স্বয়ংক্রিয়ভাবে ডায়মন্ড ডেলিভারি ট্রিগার হবে)
 * @access  Private (Admin Only)
 */
router.patch(
  "/:orderNumber/verify",
  requireAdmin,
  validate({
    params: paymentOrderParamSchema,
    body: verifyPaymentSchema,
  }),
  verifyPayment
);

export default router;
