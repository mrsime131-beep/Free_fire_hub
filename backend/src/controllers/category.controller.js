import { prisma } from "../config/db.js";
import { ApiError, sendSuccess, asyncHandler } from "../utils/apiResponse.js";
import { logAuditEvent } from "../services/audit.service.js";

/**
 * ১. GET /api/categories
 * সকল সক্রিয় প্রোডাক্ট ক্যাটাগরি (Regular, Membership, Special) ডিসপ্লে অর্ডার অনুযায়ী রিটার্ন করবে।
 * অ্যাডমিন চাইলে ?includeInactive=true দিয়ে নিষ্ক্রিয় ক্যাটাগরিও দেখতে পারবেন।
 */
export const getCategories = asyncHandler(async (req, res) => {
  const includeInactive =
    req.query.includeInactive === "true" && req.user?.role === "ADMIN";

  const whereClause = includeInactive ? {} : { isActive: true };

  const categories = await prisma.category.findMany({
    where: whereClause,
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
    include: {
      _count: {
        select: {
          products: includeInactive ? true : { where: { isActive: true } },
        },
      },
    },
  });

  const formattedCategories = categories.map((cat) => ({
    id: cat.id,
    name: cat.name,
    slug: cat.slug,
    description: cat.description,
    badgeText: cat.badgeText,
    displayOrder: cat.displayOrder,
    isActive: cat.isActive,
    productCount: cat._count.products,
    createdAt: cat.createdAt,
    updatedAt: cat.updatedAt,
  }));

  return sendSuccess(res, {
    statusCode: 200,
    message: "Categories retrieved successfully",
    data: formattedCategories,
  });
});

/**
 * ২. GET /api/categories/:id
 * নির্দিষ্ট ক্যাটাগরি (ID অথবা Slug দিয়ে) এবং তার অধীনে থাকা সক্রিয় প্রোডাক্টগুলোর তালিকা রিটার্ন করবে।
 */
export const getCategoryByIdOrSlug = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const normalizedIdentifier = String(id).trim();

  const category = await prisma.category.findFirst({
    where: {
      OR: [
        { id: normalizedIdentifier },
        { slug: normalizedIdentifier.toLowerCase() },
      ],
    },
    include: {
      products: {
        where: { isActive: true },
        orderBy: [{ displayOrder: "asc" }, { sellingPrice: "asc" }],
      },
    },
  });

  if (!category) {
    throw new ApiError(
      404,
      `Category '${normalizedIdentifier}' not found.`,
      null,
      "CATEGORY_NOT_FOUND"
    );
  }

  return sendSuccess(res, {
    statusCode: 200,
    message: "Category details retrieved successfully",
    data: category,
  });
});

/**
 * ৩. POST /api/categories (Admin Only)
 * নতুন প্রোডাক্ট ক্যাটাগরি তৈরি করার এন্ডপয়েন্ট।
 */
export const createCategory = asyncHandler(async (req, res) => {
  const { name, slug, description, badgeText, displayOrder, isActive } =
    req.body;

  const existingCategory = await prisma.category.findUnique({
    where: { slug },
  });

  if (existingCategory) {
    throw new ApiError(
      409,
      `A category with slug '${slug}' already exists.`,
      null,
      "DUPLICATE_CATEGORY_SLUG"
    );
  }

  const newCategory = await prisma.category.create({
    data: {
      name,
      slug,
      description: description || null,
      badgeText: badgeText || null,
      displayOrder: displayOrder ?? 0,
      isActive: isActive ?? true,
    },
  });

  await logAuditEvent({
    req,
    action: "CATEGORY_CREATED",
    entityType: "CATEGORY",
    entityId: newCategory.id,
    metadata: {
      name: newCategory.name,
      slug: newCategory.slug,
      displayOrder: newCategory.displayOrder,
    },
  });

  return sendSuccess(res, {
    statusCode: 201,
    message: "Category created successfully",
    data: newCategory,
  });
});

/**
 * ৪. PATCH /api/categories/:id (Admin Only)
 * বিদ্যমান ক্যাটাগরির নাম, ব্যাজ, ডিসপ্লে অর্ডার বা স্ট্যাটাস আপডেট করার এন্ডপয়েন্ট।
 */
export const updateCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;

  const existingCategory = await prisma.category.findFirst({
    where: {
      OR: [{ id }, { slug: id.toLowerCase() }],
    },
  });

  if (!existingCategory) {
    throw new ApiError(
      404,
      "Category not found for update.",
      null,
      "CATEGORY_NOT_FOUND"
    );
  }

  if (updateData.slug && updateData.slug !== existingCategory.slug) {
    const slugConflict = await prisma.category.findUnique({
      where: { slug: updateData.slug },
    });

    if (slugConflict) {
      throw new ApiError(
        409,
        `Another category with slug '${updateData.slug}' already exists.`,
        null,
        "DUPLICATE_CATEGORY_SLUG"
      );
    }
  }

  const updatedCategory = await prisma.category.update({
    where: { id: existingCategory.id },
    data: updateData,
  });

  await logAuditEvent({
    req,
    action: "CATEGORY_UPDATED",
    entityType: "CATEGORY",
    entityId: updatedCategory.id,
    metadata: {
      updatedFields: Object.keys(updateData),
      slug: updatedCategory.slug,
    },
  });

  return sendSuccess(res, {
    statusCode: 200,
    message: "Category updated successfully",
    data: updatedCategory,
  });
});

/**
 * ৫. DELETE /api/categories/:id (Admin Only)
 * ক্যাটাগরির অধীনে কোনো প্রোডাক্ট থাকলে সেটি ডিলিট না করে নিরাপদে নিষ্ক্রিয় (Soft Deactivate) করবে,
 * আর কোনো প্রোডাক্ট না থাকলে ডাটাবেস থেকে মুছে ফেলবে।
 */
export const deleteCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const existingCategory = await prisma.category.findFirst({
    where: {
      OR: [{ id }, { slug: id.toLowerCase() }],
    },
    include: {
      _count: {
        select: { products: true },
      },
    },
  });

  if (!existingCategory) {
    throw new ApiError(
      404,
      "Category not found.",
      null,
      "CATEGORY_NOT_FOUND"
    );
  }

  if (existingCategory._count.products > 0) {
    const deactivatedCategory = await prisma.category.update({
      where: { id: existingCategory.id },
      data: { isActive: false },
    });

    await logAuditEvent({
      req,
      action: "CATEGORY_DEACTIVATED",
      entityType: "CATEGORY",
      entityId: existingCategory.id,
      metadata: {
        reason: "Category has linked products; performed soft deactivation",
        linkedProducts: existingCategory._count.products,
      },
    });

    return sendSuccess(res, {
      statusCode: 200,
      message:
        "Category has linked products and was safely deactivated instead of permanent deletion.",
      data: deactivatedCategory,
    });
  }

  await prisma.category.delete({
    where: { id: existingCategory.id },
  });

  await logAuditEvent({
    req,
    action: "CATEGORY_DELETED",
    entityType: "CATEGORY",
    entityId: existingCategory.id,
    metadata: {
      slug: existingCategory.slug,
      name: existingCategory.name,
    },
  });

  return sendSuccess(res, {
    statusCode: 200,
    message: "Category permanently deleted successfully",
    data: { id: existingCategory.id, slug: existingCategory.slug },
  });
});
