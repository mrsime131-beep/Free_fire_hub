import { Router } from "express";
import {
  validateCouponCode,
  getAllCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
} from "../controllers/coupon.controller.js";
import {
  optionalAuth,
  requireAdmin,
} from "../middlewares/auth.middleware.js";

const router = Router();

/**
 * @route   GET /api/coupons/validate?code=WELCOME10&subtotal=170
 * @desc    Query Parameter পাঠিয়ে চেকআউট পেজে কুপন কোড ও ডিসকাউন্ট লাইভ যাচাই করা
 * @access  Public / Optional Auth
 */
router.get("/validate", optionalAuth, validateCouponCode);

/**
 * @route   POST /api/coupons/validate
 * @desc    JSON Body ({ "code": "WELCOME10", "subtotal": 170 }) পাঠিয়ে কুপন কোড যাচাই করা
 * @access  Public / Optional Auth
 */
router.post("/validate", optionalAuth, validateCouponCode);

/**
 * @route   GET /api/coupons
 * @desc    অ্যাডমিন প্যানেলের জন্য সব কুপনের তালিকা ও ব্যবহারের পরিসংখ্যান দেখা
 * @access  Private (Admin Only)
 */
router.get("/", requireAdmin, getAllCoupons);

/**
 * @route   POST /api/coupons
 * @desc    নতুন ডিসকাউন্ট কুপন তৈরি করা
 * @access  Private (Admin Only)
 */
router.post("/", requireAdmin, createCoupon);

/**
 * @route   PATCH /api/coupons/:id
 * @desc    কুপনের মেয়াদ, ডিসকাউন্ট ভ্যালু বা Active/Inactive স্ট্যাটাস আপডেট করা (ID অথবা Code দিয়ে)
 * @access  Private (Admin Only)
 */
router.patch("/:id", requireAdmin, updateCoupon);

/**
 * @route   DELETE /api/coupons/:id
 * @desc    কুপন ডিলিট করা (ID অথবা Code দিয়ে)
 * @access  Private (Admin Only)
 */
router.delete("/:id", requireAdmin, deleteCoupon);

export default router;
