import { Router } from "express";
import {
  registerUser,
  loginUser,
  getCurrentUserProfile,
  updateUserProfile,
  changeUserPassword,
} from "../controllers/auth.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { authLimiter } from "../middlewares/rateLimiter.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  registerSchema,
  loginSchema,
  updateProfileSchema,
  changePasswordSchema,
} from "../validators/auth.validator.js";

const router = Router();

/**
 * @route   POST /api/auth/register
 * @desc    নতুন কাস্টমার অ্যাকাউন্ট তৈরি এবং অটো-লগইন JWT টোকেন প্রদান
 * @access  Public (Brute-Force Rate Limited: ১৫ মিনিটে সর্বোচ্চ ১০ বার)
 */
router.post(
  "/register",
  authLimiter,
  validate({ body: registerSchema }),
  registerUser
);

/**
 * @route   POST /api/auth/login
 * @desc    কাস্টমার এবং অ্যাডমিন লগইন এন্ডপয়েন্ট
 * @access  Public (Brute-Force Rate Limited: ১৫ মিনিটে সর্বোচ্চ ১০ বার)
 */
router.post(
  "/login",
  authLimiter,
  validate({ body: loginSchema }),
  loginUser
);

/**
 * @route   GET /api/auth/me
 * @desc    বর্তমান লগইন করা ইউজার বা অ্যাডমিনের প্রোফাইল ও ওয়ালেট/পয়েন্ট তথ্য দেখা
 * @access  Private (Logged-in Customer/Admin)
 */
router.get("/me", requireAuth, getCurrentUserProfile);

/**
 * @route   PATCH /api/auth/profile
 * @desc    লগইন করা ইউজারের নাম, মোবাইল নম্বর এবং ডিফল্ট Free Fire UID আপডেট করা
 * @access  Private (Logged-in Customer/Admin)
 */
router.patch(
  "/profile",
  requireAuth,
  validate({ body: updateProfileSchema }),
  updateUserProfile
);

/**
 * @route   PATCH /api/auth/change-password
 * @desc    বর্তমান পাসওয়ার্ড যাচাই করে নতুন পাসওয়ার্ড সেট করা
 * @access  Private (Logged-in Customer/Admin)
 */
router.patch(
  "/change-password",
  requireAuth,
  validate({ body: changePasswordSchema }),
  changeUserPassword
);

export default router;
