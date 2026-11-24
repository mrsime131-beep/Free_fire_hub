import { z } from "zod";

const PRODUCT_AVAILABILITY_VALUES = ["IN_STOCK", "OUT_OF_STOCK", "COMING_SOON"];

/**
 * ১. GET /api/products কুয়েরি প্যারামিটার ভ্যালিডেশন স্কিমা
 * ক্যাটাগরি, স্টক স্ট্যাটাস, জনপ্রিয়তা এবং সার্চ ফিল্টারিংয়ের জন্য
 */
export const listProductsQuerySchema = z.object({
  category: z.string().trim().optional(),
  availability: z.enum(PRODUCT_AVAILABILITY_VALUES).optional(),
  popular: z
    .enum(["true", "false"])
    .transform((val) => val === "true")
    .optional(),
  includeInactive: z
    .enum(["true", "false"])
    .transform((val) => val === "true")
    .optional(),
  search: z.string().trim().max(100).optional(),
});

/**
 * ২. URL Parameter (:id) ভ্যালিডেশন স্কিমা (Product ID, SKU অথবা Slug সমর্থন করবে)
 */
export const productParamSchema = z.object({
  id: z
    .string({
      required_error: "Product ID, SKU, or Slug is required",
    })
    .trim()
    .min(1, "Product identifier cannot be empty")
    .max(120, "Product identifier is too long"),
});

/**
 * ৩. POST /api/products নতুন প্রোডাক্ট তৈরির ভ্যালিডেশন স্কিমা (Admin Only)
 */
export const createProductSchema = z.object({
  sku: z
    .string({ required_error: "Product SKU is required" })
    .trim()
    .toUpperCase()
    .min(3, "SKU must be at least 3 characters")
    .max(50, "SKU cannot exceed 50 characters"),
  name: z
    .string({ required_error: "Product name is required" })
    .trim()
    .min(2, "Product name must be at least 2 characters")
    .max(120, "Product name cannot exceed 120 characters"),
  slug: z
    .string({ required_error: "Product slug is required" })
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Slug must contain only lowercase letters, numbers, and hyphens"
    ),
  categoryId: z
    .string({ required_error: "Category ID is required" })
    .uuid("Invalid Category ID format"),
  diamondQuantity: z.coerce
    .number()
    .int()
    .min(0, "Diamond quantity cannot be negative")
    .default(0),
  bonusDiamonds: z.coerce
    .number()
    .int()
    .min(0, "Bonus diamonds cannot be negative")
    .default(0),
  purchasePrice: z.coerce
    .number({ required_error: "Purchase price is required" })
    .min(0, "Purchase price cannot be negative"),
  sellingPrice: z.coerce
    .number({ required_error: "Selling price is required" })
    .positive("Selling price must be greater than 0"),
  discount: z.coerce
    .number()
    .min(0, "Discount cannot be negative")
    .default(0),
  imageUrl: z
    .string()
    .trim()
    .min(1)
    .default("/images/diamond-pack.png"),
  tag: z.string().trim().max(40).nullable().optional(),
  isPopular: z.boolean().default(false),
  availability: z
    .enum(PRODUCT_AVAILABILITY_VALUES)
    .default("IN_STOCK"),
  isActive: z.boolean().default(true),
  displayOrder: z.coerce.number().int().min(0).default(0),
  supplierCode: z.string().trim().max(80).nullable().optional(),
  description: z.string().trim().max(500).nullable().optional(),
});

/**
 * ৪. PATCH /api/products/:id প্রোডাক্ট আপডেট ভ্যালিডেশন স্কিমা (Admin Only)
 */
export const updateProductSchema = createProductSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided to update the product",
  });

/**
 * ৫. POST /api/categories নতুন ক্যাটাগরি তৈরির ভ্যালিডেশন স্কিমা (Admin Only)
 */
export const createCategorySchema = z.object({
  name: z
    .string({ required_error: "Category name is required" })
    .trim()
    .min(2, "Category name must be at least 2 characters")
    .max(80, "Category name cannot exceed 80 characters"),
  slug: z
    .string({ required_error: "Category slug is required" })
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Slug must contain only lowercase letters, numbers, and hyphens"
    ),
  description: z.string().trim().max(300).nullable().optional(),
  badgeText: z.string().trim().max(40).nullable().optional(),
  displayOrder: z.coerce.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

/**
 * ৬. PATCH /api/categories/:id ক্যাটাগরি আপডেট ভ্যালিডেশন স্কিমা (Admin Only)
 */
export const updateCategorySchema = createCategorySchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided to update the category",
  });
