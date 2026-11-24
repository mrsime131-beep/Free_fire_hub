import { prisma } from "../config/db.js";
import { ApiError, sendSuccess, asyncHandler } from "../utils/apiResponse.js";
import { logAuditEvent } from "../services/audit.service.js";

/**
 * ১. POST /api/coupons/validate অথবা GET /api/coupons/validate?code=WELCOME10&subtotal=170
 * চেকআউট পেজে অর্ডার সাবমিট করার আগেই কাস্টমার যাতে কুপন কোড অ্যাপ্লাই করে
 * কত টাকা ডিসকাউন্ট পাবে এবং কত টাকা পেমেন্ট করতে হবে তা লাইভ দেখতে পারে।
 */
export const validateCouponCode = asyncHandler(async (req, res) => {
  const rawCode = req.body?.code || req.query?.code;
  const rawSubtotal =
    req.body?.subtotal ??
    req.body?.subtotalAmount ??
    req.query?.subtotal ??
    req.query?.subtotalAmount ??
    0;

  if (!rawCode || String(rawCode).trim().length === 0) {
    throw new ApiError(
      400,
      "অনুগ্রহ করে একটি কুপন কোড লিখুন।",
      null,
      "COUPON_CODE_REQUIRED"
    );
  }

  const cleanCode = String(rawCode).trim().toUpperCase();
  const subtotalAmount = Math.max(0, Number(rawSubtotal) || 0);

  const coupon = await prisma.coupon.findUnique({
    where: { code: cleanCode },
  });

  if (!coupon || !coupon.isActive) {
    throw new ApiError(
      404,
      `কুপন কোড '${cleanCode}' বৈধ নয় অথবা বর্তমানে নিষ্ক্রিয়।`,
      null,
      "INVALID_COUPON"
    );
  }

  const now = new Date();

  if (coupon.startsAt && now < new Date(coupon.startsAt)) {
    throw new ApiError(
      400,
      "এই কুপন কোডটির মেয়াদ এখনো শুরু হয়নি।",
      null,
      "COUPON_NOT_STARTED"
    );
  }

  if (coupon.expiresAt && now > new Date(coupon.expiresAt)) {
    throw new ApiError(
      400,
      "এই কুপন কোডটির মেয়াদ শেষ হয়ে গেছে।",
      null,
      "COUPON_EXPIRED"
    );
  }

  if (
    coupon.usageLimit !== null &&
    coupon.usageLimit !== undefined &&
    coupon.usedCount >= coupon.usageLimit
  ) {
    throw new ApiError(
      400,
      "এই কুপন কোডটির সর্বোচ্চ ব্যবহারের সীমা শেষ হয়ে গেছে।",
      null,
      "COUPON_LIMIT_REACHED"
    );
  }

  const minOrderAmount = Number(coupon.minOrderAmount || 0);
  if (subtotalAmount > 0 && subtotalAmount < minOrderAmount) {
    throw new ApiError(
      400,
      `এই কুপনটি ব্যবহার করতে কমপক্ষে ৳${minOrderAmount} টাকার অর্ডার করতে হবে।`,
      null,
      "COUPON_MIN_AMOUNT_NOT_MET"
    );
  }

  let discountAmount = 0;
  if (subtotalAmount > 0) {
    if (coupon.discountType === "PERCENTAGE") {
      discountAmount = (subtotalAmount * Number(coupon.discountValue)) / 100;
      if (
        coupon.maxDiscountAmount !== null &&
        coupon.maxDiscountAmount !== undefined &&
        discountAmount > Number(coupon.maxDiscountAmount)
      ) {
        discountAmount = Number(coupon.maxDiscountAmount);
      }
    } else {
      discountAmount = Number(coupon.discountValue);
    }

    discountAmount = Math.min(subtotalAmount, Number(discountAmount.toFixed(2)));
  }

  const payableAmount = Number(
    Math.max(0, subtotalAmount - discountAmount).toFixed(2)
  );

  return sendSuccess(res, {
    statusCode: 200,
    message: `কুপন '${coupon.code}' সফলভাবে যাচাই হয়েছে!`,
    data: {
      code: coupon.code,
      description: coupon.description,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      minOrderAmount: coupon.minOrderAmount,
      maxDiscountAmount: coupon.maxDiscountAmount,
      subtotalAmount,
      discountAmount,
      payableAmount,
    },
  });
});

/**
 * ২. GET /api/coupons (Admin Only)
 * অ্যাডমিন প্যানেলের জন্য সব কুপনের তালিকা ও ব্যবহারের পরিসংখ্যান দেখা।
 */
export const getAllCoupons = asyncHandler(async (req, res) => {
  const coupons = await prisma.coupon.findMany({
    orderBy: { createdAt: "desc" },
  });

  return sendSuccess(res, {
    statusCode: 200,
    message: "All coupons retrieved successfully",
    data: coupons,
  });
});

/**
 * ৩. POST /api/coupons (Admin Only)
 * নতুন ডিসকাউন্ট কুপন তৈরি করা।
 */
export const createCoupon = asyncHandler(async (req, res) => {
  const {
    code,
    description,
    discountType = "PERCENTAGE",
    discountValue,
    minOrderAmount = 0,
    maxDiscountAmount = null,
    usageLimit = null,
    startsAt = null,
    expiresAt = null,
    isActive = true,
  } = req.body;

  if (!code || discountValue === undefined || discountValue === null) {
    throw new ApiError(
      400,
      "কুপন কোড (code) এবং ডিসকাউন্টের পরিমাণ (discountValue) অবশ্যই দিতে হবে।",
      null,
      "COUPON_FIELDS_REQUIRED"
    );
  }

  const cleanCode = String(code).trim().toUpperCase();
  const cleanType = String(discountType).trim().toUpperCase();

  if (!["PERCENTAGE", "FIXED"].includes(cleanType)) {
    throw new ApiError(
      400,
      "discountType অবশ্যই PERCENTAGE অথবা FIXED হতে হবে।",
      null,
      "INVALID_DISCOUNT_TYPE"
    );
  }

  const existing = await prisma.coupon.findUnique({
    where: { code: cleanCode },
  });

  if (existing) {
    throw new ApiError(
      409,
      `কুপন কোড '${cleanCode}' ইতিমধ্যে ডাটাবেসে রয়েছে।`,
      null,
      "DUPLICATE_COUPON_CODE"
    );
  }

  const createdCoupon = await prisma.coupon.create({
    data: {
      code: cleanCode,
      description: description ? String(description).trim() : null,
      discountType: cleanType,
      discountValue: Number(discountValue),
      minOrderAmount: Number(minOrderAmount || 0),
      maxDiscountAmount:
        maxDiscountAmount !== null && maxDiscountAmount !== ""
          ? Number(maxDiscountAmount)
          : null,
      usageLimit:
        usageLimit !== null && usageLimit !== "" ? Number(usageLimit) : null,
      startsAt: startsAt ? new Date(startsAt) : null,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      isActive: Boolean(isActive),
    },
  });

  await logAuditEvent({
    req,
    action: "COUPON_CREATED",
    entityType: "COUPON",
    entityId: createdCoupon.code,
    metadata: {
      couponId: createdCoupon.id,
      code: createdCoupon.code,
      discountType: createdCoupon.discountType,
      discountValue: createdCoupon.discountValue,
    },
  });

  return sendSuccess(res, {
    statusCode: 201,
    message: `কুপন '${createdCoupon.code}' সফলভাবে তৈরি করা হয়েছে।`,
    data: createdCoupon,
  });
});

/**
 * ৪. PATCH /api/coupons/:id (Admin Only)
 * কুপনের মেয়াদ, ডিসকাউন্ট ভ্যালু বা Active/Inactive স্ট্যাটাস আপডেট করা।
 */
export const updateCoupon = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const existing = await prisma.coupon.findFirst({
    where: {
      OR: [{ id }, { code: id.toUpperCase() }],
    },
  });

  if (!existing) {
    throw new ApiError(
      404,
      "কুপনটি খুঁজে পাওয়া যায়নি।",
      null,
      "COUPON_NOT_FOUND"
    );
  }

  const updateData = {};
  const {
    description,
    discountType,
    discountValue,
    minOrderAmount,
    maxDiscountAmount,
    usageLimit,
    startsAt,
    expiresAt,
    isActive,
  } = req.body;

  if (description !== undefined) updateData.description = description;
  if (discountType !== undefined)
    updateData.discountType = String(discountType).trim().toUpperCase();
  if (discountValue !== undefined)
    updateData.discountValue = Number(discountValue);
  if (minOrderAmount !== undefined)
    updateData.minOrderAmount = Number(minOrderAmount);
  if (maxDiscountAmount !== undefined)
    updateData.maxDiscountAmount =
      maxDiscountAmount !== null ? Number(maxDiscountAmount) : null;
  if (usageLimit !== undefined)
    updateData.usageLimit = usageLimit !== null ? Number(usageLimit) : null;
  if (startsAt !== undefined)
    updateData.startsAt = startsAt ? new Date(startsAt) : null;
  if (expiresAt !== undefined)
    updateData.expiresAt = expiresAt ? new Date(expiresAt) : null;
  if (isActive !== undefined) updateData.isActive = Boolean(isActive);

  const updatedCoupon = await prisma.coupon.update({
    where: { id: existing.id },
    data: updateData,
  });

  await logAuditEvent({
    req,
    action: "COUPON_UPDATED",
    entityType: "COUPON",
    entityId: updatedCoupon.code,
    metadata: {
      updatedFields: Object.keys(updateData),
    },
  });

  return sendSuccess(res, {
    statusCode: 200,
    message: `কুপন '${updatedCoupon.code}' সফলভাবে আপডেট করা হয়েছে।`,
    data: updatedCoupon,
  });
});

/**
 * ৫. DELETE /api/coupons/:id (Admin Only)
 * কুপন ডিলিট করা।
 */
export const deleteCoupon = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const existing = await prisma.coupon.findFirst({
    where: {
      OR: [{ id }, { code: id.toUpperCase() }],
    },
  });

  if (!existing) {
    throw new ApiError(
      404,
      "কুপনটি খুঁজে পাওয়া যায়নি।",
      null,
      "COUPON_NOT_FOUND"
    );
  }

  await prisma.coupon.delete({
    where: { id: existing.id },
  });

  await logAuditEvent({
    req,
    action: "COUPON_DELETED",
    entityType: "COUPON",
    entityId: existing.code,
  });

  return sendSuccess(res, {
    statusCode: 200,
    message: `কুপন '${existing.code}' সফলভাবে মুছে ফেলা হয়েছে।`,
  });
});
