import { prisma } from "../config/db.js";
import { ApiError, sendSuccess, asyncHandler } from "../utils/apiResponse.js";
import { logAuditEvent } from "../services/audit.service.js";

/**
 * ডাটাবেসের প্রোডাক্ট অবজেক্টকে Frontend (`PackageGrid.jsx` ও `TopUpContext.js`) এবং
 * Backend API—উভয়ের সাথে ১০০% সামঞ্জস্যপূর্ণ ফরম্যাটে রূপান্তর করার হেল্পার ফাংশন।
 *
 * নিরাপত্তা: সাধারণ কাস্টমারদের কাছে পাইকারি ক্রয়মূল্য (purchasePrice) এবং supplierCode গোপন থাকবে,
 * শুধুমাত্র ADMIN লগইন থাকলে তা দেখা যাবে।
 */
function formatProductResponse(product, isAdmin = false) {
  const categorySlug = product.category?.slug || "regular";
  const effectiveOriginalPrice =
    Number(product.sellingPrice) + Number(product.discount || 0);

  const formatted = {
    // Core Backend Fields
    id: product.id,
    sku: product.sku,
    name: product.name,
    slug: product.slug,
    categoryId: product.categoryId,
    categoryName: product.category?.name || "Regular Diamonds",
    diamondQuantity: product.diamondQuantity,
    bonusDiamonds: product.bonusDiamonds,
    sellingPrice: product.sellingPrice,
    discount: product.discount,
    imageUrl: product.imageUrl,
    tag: product.tag,
    isPopular: product.isPopular,
    availability: product.availability,
    isActive: product.isActive,
    displayOrder: product.displayOrder,
    description: product.description,

    // Existing Next.js Frontend Compatibility Aliases (যাতে ফ্রন্টএন্ডের ডিজাইন ও কোড না ভাঙে)
    category: categorySlug,
    diamonds: product.diamondQuantity,
    bonus: product.bonusDiamonds,
    price: product.sellingPrice,
    originalPrice: effectiveOriginalPrice,
    popular: product.isPopular,
    inStock: product.isActive && product.availability === "IN_STOCK",

    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };

  if (isAdmin) {
    formatted.purchasePrice = product.purchasePrice;
    formatted.supplierCode = product.supplierCode;
    formatted.profitMargin = Number(
      (product.sellingPrice - product.purchasePrice).toFixed(2)
    );
  }

  return formatted;
}

/**
 * ১. GET /api/products
 * ডাটাবেস থেকে সব ডাইনামিক ডায়মন্ড ও মেম্বারশিপ প্রোডাক্ট displayOrder অনুযায়ী রিটার্ন করবে।
 * Query Filters: ?category=regular | ?availability=IN_STOCK | ?popular=true | ?search=weekly
 */
export const getProducts = asyncHandler(async (req, res) => {
  const isAdmin = req.user?.role === "ADMIN";
  const { category, availability, popular, includeInactive, search } =
    req.validatedQuery || req.query;

  const whereClause = {};

  // সাধারণ ইউজারদের জন্য শুধুমাত্র Active প্রোডাক্ট দেখাবে
  if (!(isAdmin && (includeInactive === true || includeInactive === "true"))) {
    whereClause.isActive = true;
  }

  // Category Slug অথবা Category UUID দিয়ে ফিল্টার
  if (category && category !== "all") {
    const cleanCategory = String(category).trim();
    whereClause.category = {
      OR: [{ id: cleanCategory }, { slug: cleanCategory.toLowerCase() }],
    };
  }

  // Availability ফিল্টার (IN_STOCK, OUT_OF_STOCK, COMING_SOON)
  if (availability) {
    whereClause.availability = availability;
  }

  // Popular প্যাকেজ ফিল্টার
  if (popular !== undefined) {
    whereClause.isPopular = popular === true || popular === "true";
  }

  // নাম বা SKU দিয়ে সার্চ ফিল্টার
  if (search) {
    const cleanSearch = String(search).trim();
    whereClause.OR = [
      { name: { contains: cleanSearch, mode: "insensitive" } },
      { sku: { contains: cleanSearch, mode: "insensitive" } },
      { description: { contains: cleanSearch, mode: "insensitive" } },
    ];
  }

  const products = await prisma.product.findMany({
    where: whereClause,
    include: {
      category: {
        select: {
          id: true,
          name: true,
          slug: true,
          badgeText: true,
        },
      },
    },
    orderBy: [{ displayOrder: "asc" }, { sellingPrice: "asc" }],
  });

  const formattedProducts = products.map((item) =>
    formatProductResponse(item, isAdmin)
  );

  return sendSuccess(res, {
    statusCode: 200,
    message: "Products retrieved successfully",
    data: formattedProducts,
    meta: {
      total: formattedProducts.length,
    },
  });
});

/**
 * ২. GET /api/products/:id
 * নির্দিষ্ট একটি প্রোডাক্টের বিস্তারিত তথ্য (UUID, SKU অথবা Slug দিয়ে) রিটার্ন করবে।
 */
export const getProductById = asyncHandler(async (req, res) => {
  const isAdmin = req.user?.role === "ADMIN";
  const identifier = String(req.params.id).trim();

  const product = await prisma.product.findFirst({
    where: {
      OR: [
        { id: identifier },
        { sku: identifier.toUpperCase() },
        { slug: identifier.toLowerCase() },
      ],
    },
    include: {
      category: {
        select: {
          id: true,
          name: true,
          slug: true,
          badgeText: true,
        },
      },
    },
  });

  if (!product || (!product.isActive && !isAdmin)) {
    throw new ApiError(
      404,
      `Product '${identifier}' not found or currently unavailable.`,
      null,
      "PRODUCT_NOT_FOUND"
    );
  }

  return sendSuccess(res, {
    statusCode: 200,
    message: "Product details retrieved successfully",
    data: formatProductResponse(product, isAdmin),
  });
});

/**
 * ৩. POST /api/products (Admin Only)
 * ডাটাবেসে নতুন ডায়মন্ড বা মেম্বারশিপ প্রোডাক্ট তৈরি করার এন্ডপয়েন্ট।
 */
export const createProduct = asyncHandler(async (req, res) => {
  const payload = req.body;

  // Category অস্তিত্ব যাচাই করা
  const categoryExists = await prisma.category.findUnique({
    where: { id: payload.categoryId },
  });

  if (!categoryExists) {
    throw new ApiError(
      404,
      "Selected category does not exist.",
      null,
      "CATEGORY_NOT_FOUND"
    );
  }

  // SKU বা Slug ডুপ্লিকেট কি না তা চেক করা
  const duplicateProduct = await prisma.product.findFirst({
    where: {
      OR: [{ sku: payload.sku }, { slug: payload.slug }],
    },
  });

  if (duplicateProduct) {
    throw new ApiError(
      409,
      `A product with SKU '${payload.sku}' or Slug '${payload.slug}' already exists.`,
      null,
      "DUPLICATE_PRODUCT"
    );
  }

  const createdProduct = await prisma.product.create({
    data: payload,
    include: {
      category: true,
    },
  });

  await logAuditEvent({
    req,
    action: "PRODUCT_CREATED",
    entityType: "PRODUCT",
    entityId: createdProduct.id,
    metadata: {
      sku: createdProduct.sku,
      name: createdProduct.name,
      sellingPrice: createdProduct.sellingPrice,
      purchasePrice: createdProduct.purchasePrice,
    },
  });

  return sendSuccess(res, {
    statusCode: 201,
    message: "Product created successfully",
    data: formatProductResponse(createdProduct, true),
  });
});

/**
 * ৪. PATCH /api/products/:id (Admin Only)
 * প্রোডাক্টের দাম (sellingPrice, purchasePrice, discount), স্টক (availability),
 * অথবা displayOrder ডাইনামিকভাবে আপডেট করার এন্ডপয়েন্ট।
 */
export const updateProduct = asyncHandler(async (req, res) => {
  const identifier = String(req.params.id).trim();
  const updateData = req.body;

  const existingProduct = await prisma.product.findFirst({
    where: {
      OR: [
        { id: identifier },
        { sku: identifier.toUpperCase() },
        { slug: identifier.toLowerCase() },
      ],
    },
  });

  if (!existingProduct) {
    throw new ApiError(
      404,
      `Product '${identifier}' not found for update.`,
      null,
      "PRODUCT_NOT_FOUND"
    );
  }

  // যদি Category পরিবর্তন করা হয় তবে নতুন Category বৈধ কি না চেক করা
  if (
    updateData.categoryId &&
    updateData.categoryId !== existingProduct.categoryId
  ) {
    const categoryExists = await prisma.category.findUnique({
      where: { id: updateData.categoryId },
    });
    if (!categoryExists) {
      throw new ApiError(
        404,
        "Target category does not exist.",
        null,
        "CATEGORY_NOT_FOUND"
      );
    }
  }

  // SKU বা Slug পরিবর্তন করলে অন্য প্রোডাক্টের সাথে কনফ্লিক্ট চেক করা
  if (
    (updateData.sku && updateData.sku !== existingProduct.sku) ||
    (updateData.slug && updateData.slug !== existingProduct.slug)
  ) {
    const conflict = await prisma.product.findFirst({
      where: {
        id: { not: existingProduct.id },
        OR: [
          ...(updateData.sku ? [{ sku: updateData.sku }] : []),
          ...(updateData.slug ? [{ slug: updateData.slug }] : []),
        ],
      },
    });

    if (conflict) {
      throw new ApiError(
        409,
        "Another product already uses this SKU or Slug.",
        null,
        "DUPLICATE_PRODUCT_IDENTIFIER"
      );
    }
  }

  const updatedProduct = await prisma.product.update({
    where: { id: existingProduct.id },
    data: updateData,
    include: {
      category: true,
    },
  });

  await logAuditEvent({
    req,
    action: "PRODUCT_UPDATED",
    entityType: "PRODUCT",
    entityId: updatedProduct.id,
    metadata: {
      sku: updatedProduct.sku,
      updatedFields: Object.keys(updateData),
      oldPrice: existingProduct.sellingPrice,
      newPrice: updatedProduct.sellingPrice,
      availability: updatedProduct.availability,
      isActive: updatedProduct.isActive,
    },
  });

  return sendSuccess(res, {
    statusCode: 200,
    message: "Product updated successfully",
    data: formatProductResponse(updatedProduct, true),
  });
});

/**
 * ৫. DELETE /api/products/:id (Admin Only)
 * প্রোডাক্টটির সাথে যদি পূর্বের কোনো অর্ডারের (OrderItem) রেকর্ড যুক্ত থাকে,
 * তবে হিসাব অক্ষুণ্ণ রাখতে সেটিকে ডিলিট না করে নিষ্ক্রিয় (isActive: false, OUT_OF_STOCK) করবে।
 */
export const deleteProduct = asyncHandler(async (req, res) => {
  const identifier = String(req.params.id).trim();

  const existingProduct = await prisma.product.findFirst({
    where: {
      OR: [
        { id: identifier },
        { sku: identifier.toUpperCase() },
        { slug: identifier.toLowerCase() },
      ],
    },
    include: {
      _count: {
        select: { orderItems: true },
      },
    },
  });

  if (!existingProduct) {
    throw new ApiError(
      404,
      `Product '${identifier}' not found.`,
      null,
      "PRODUCT_NOT_FOUND"
    );
  }

  if (existingProduct._count.orderItems > 0) {
    const deactivatedProduct = await prisma.product.update({
      where: { id: existingProduct.id },
      data: {
        isActive: false,
        availability: "OUT_OF_STOCK",
      },
      include: { category: true },
    });

    await logAuditEvent({
      req,
      action: "PRODUCT_DEACTIVATED",
      entityType: "PRODUCT",
      entityId: existingProduct.id,
      metadata: {
        sku: existingProduct.sku,
        reason: "Product has historical orders; performed soft deactivation",
        linkedOrdersCount: existingProduct._count.orderItems,
      },
    });

    return sendSuccess(res, {
      statusCode: 200,
      message:
        "Product has order history and was safely deactivated instead of permanent deletion.",
      data: formatProductResponse(deactivatedProduct, true),
    });
  }

  await prisma.product.delete({
    where: { id: existingProduct.id },
  });

  await logAuditEvent({
    req,
    action: "PRODUCT_DELETED",
    entityType: "PRODUCT",
    entityId: existingProduct.id,
    metadata: {
      sku: existingProduct.sku,
      name: existingProduct.name,
    },
  });

  return sendSuccess(res, {
    statusCode: 200,
    message: "Product permanently deleted successfully",
    data: {
      id: existingProduct.id,
      sku: existingProduct.sku,
      name: existingProduct.name,
    },
  });
});
