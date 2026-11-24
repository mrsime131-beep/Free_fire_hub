import { Router } from "express";
import {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
} from "../controllers/product.controller.js";
import { optionalAuth, requireAdmin } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  listProductsQuerySchema,
  productParamSchema,
  createProductSchema,
  updateProductSchema,
} from "../validators/product.validator.js";

const router = Router();

/**
 * @route   GET /api/products
 * @desc    ডাটাবেস থেকে সব সক্রিয় ডায়মন্ড ও মেম্বারশিপ প্রোডাক্ট ডিসপ্লে অর্ডার অনুযায়ী রিটার্ন করে
 *          Query Filters: ?category=regular | ?availability=IN_STOCK | ?popular=true | ?search=weekly
 * @access  Public (Admin টোকেন থাকলে ক্রয়মূল্য ও নিষ্ক্রিয় প্রোডাক্টও দেখা যাবে)
 */
router.get(
  "/",
  optionalAuth,
  validate({ query: listProductsQuerySchema }),
  getProducts
);

/**
 * @route   GET /api/products/:id
 * @desc    নির্দিষ্ট একটি প্রোডাক্টের বিস্তারিত তথ্য (UUID, SKU অথবা Slug দিয়ে) রিটার্ন করে
 * @access  Public
 */
router.get(
  "/:id",
  optionalAuth,
  validate({ params: productParamSchema }),
  getProductById
);

/**
 * @route   POST /api/products
 * @desc    নতুন ডায়মন্ড বা মেম্বারশিপ প্রোডাক্ট তৈরি করা
 * @access  Private (Admin Only)
 */
router.post(
  "/",
  requireAdmin,
  validate({ body: createProductSchema }),
  createProduct
);

/**
 * @route   PATCH /api/products/:id
 * @desc    প্রোডাক্টের দাম (sellingPrice, purchasePrice, discount), স্টক বা displayOrder আপডেট করা
 * @access  Private (Admin Only)
 */
router.patch(
  "/:id",
  requireAdmin,
  validate({ params: productParamSchema, body: updateProductSchema }),
  updateProduct
);

/**
 * @route   DELETE /api/products/:id
 * @desc    প্রোডাক্ট মুছে ফেলা অথবা অর্ডার হিস্ট্রি থাকলে নিরাপদে নিষ্ক্রিয় (Soft Deactivate) করা
 * @access  Private (Admin Only)
 */
router.delete(
  "/:id",
  requireAdmin,
  validate({ params: productParamSchema }),
  deleteProduct
);

export default router;
