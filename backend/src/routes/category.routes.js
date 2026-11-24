import { Router } from "express";
import {
  getCategories,
  getCategoryByIdOrSlug,
  createCategory,
  updateCategory,
  deleteCategory,
} from "../controllers/category.controller.js";
import { optionalAuth, requireAdmin } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  productParamSchema,
  createCategorySchema,
  updateCategorySchema,
} from "../validators/product.validator.js";

const router = Router();

/**
 * @route   GET /api/categories
 * @desc    সকল সক্রিয় ক্যাটাগরির তালিকা (Regular, Membership, Special) রিটার্ন করে
 * @access  Public (Admin টোকেন থাকলে ?includeInactive=true দিয়ে নিষ্ক্রিয় ক্যাটাগরিও দেখা যাবে)
 */
router.get("/", optionalAuth, getCategories);

/**
 * @route   GET /api/categories/:id
 * @desc    নির্দিষ্ট ক্যাটাগরি (UUID অথবা Slug) এবং তার অধীনের প্রোডাক্টগুলো রিটার্ন করে
 * @access  Public
 */
router.get(
  "/:id",
  optionalAuth,
  validate({ params: productParamSchema }),
  getCategoryByIdOrSlug
);

/**
 * @route   POST /api/categories
 * @desc    নতুন প্রোডাক্ট ক্যাটাগরি তৈরি করা
 * @access  Private (Admin Only)
 */
router.post(
  "/",
  requireAdmin,
  validate({ body: createCategorySchema }),
  createCategory
);

/**
 * @route   PATCH /api/categories/:id
 * @desc    বিদ্যমান ক্যাটাগরির তথ্য, ডিসপ্লে অর্ডার বা স্ট্যাটাস আপডেট করা
 * @access  Private (Admin Only)
 */
router.patch(
  "/:id",
  requireAdmin,
  validate({ params: productParamSchema, body: updateCategorySchema }),
  updateCategory
);

/**
 * @route   DELETE /api/categories/:id
 * @desc    ক্যাটাগরি মুছে ফেলা বা নিরাপদে নিষ্ক্রিয় (Soft Deactivate) করা
 * @access  Private (Admin Only)
 */
router.delete(
  "/:id",
  requireAdmin,
  validate({ params: productParamSchema }),
  deleteCategory
);

export default router;
