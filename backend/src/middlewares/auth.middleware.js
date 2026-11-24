import jwt from "jsonwebtoken";
import { prisma } from "../config/db.js";
import { env } from "../config/env.js";
import { ApiError, asyncHandler } from "../utils/apiResponse.js";

/**
 * Request Header থেকে Bearer JWT Token আলাদা করার হেল্পার ফাংশন
 */
function extractBearerToken(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader || typeof authHeader !== "string") {
    return null;
  }

  const parts = authHeader.trim().split(" ");
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") {
    return null;
  }

  return parts[1];
}

/**
 * ১. Strict Authentication Middleware (requireAuth)
 * যেসব API শুধুমাত্র লগইন করা ইউজারদের জন্য (যেমন: User Dashboard, My Orders, Referral Stats)
 */
export const requireAuth = asyncHandler(async (req, res, next) => {
  const token = extractBearerToken(req);

  if (!token) {
    throw new ApiError(
      401,
      "Authentication required. Please log in to access this resource.",
      null,
      "AUTH_TOKEN_MISSING"
    );
  }

  let decoded;
  try {
    decoded = jwt.verify(token, env.JWT_SECRET);
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      throw new ApiError(
        401,
        "Your login session has expired. Please log in again.",
        null,
        "TOKEN_EXPIRED"
      );
    }
    throw new ApiError(
      401,
      "Invalid authentication token.",
      null,
      "INVALID_TOKEN"
    );
  }

  if (!decoded || !decoded.userId) {
    throw new ApiError(
      401,
      "Malformed authentication token payload.",
      null,
      "MALFORMED_TOKEN"
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: decoded.userId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      walletBalance: true,
      rewardPoints: true,
      referralCode: true,
      savedUid: true,
      savedPlayerName: true,
      savedServer: true,
      isActive: true,
      createdAt: true,
    },
  });

  if (!user) {
    throw new ApiError(
      401,
      "User account associated with this token no longer exists.",
      null,
      "USER_NOT_FOUND"
    );
  }

  if (!user.isActive) {
    throw new ApiError(
      403,
      "Your account has been deactivated. Please contact support.",
      null,
      "ACCOUNT_DISABLED"
    );
  }

  req.user = user;
  return next();
});

/**
 * ২. Optional Authentication Middleware (optionalAuth)
 * Guest Order এবং Order Checkout-এর জন্য অত্যন্ত গুরুত্বপূর্ণ।
 * ইউজার লগইন অবস্থায় থাকলে তার req.user যুক্ত করবে, আর লগইন না থাকলে (Guest হলে)
 * কোনো এরর না দিয়ে req.user = null রেখে অর্ডার সম্পন্ন করতে দেবে।
 */
export const optionalAuth = asyncHandler(async (req, res, next) => {
  const token = extractBearerToken(req);

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    if (!decoded || !decoded.userId) {
      req.user = null;
      return next();
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        walletBalance: true,
        rewardPoints: true,
        referralCode: true,
        savedUid: true,
        savedPlayerName: true,
        savedServer: true,
        isActive: true,
      },
    });

    req.user = user && user.isActive ? user : null;
  } catch {
    // টোকেন মেয়াদোত্তীর্ণ বা ভুল হলেও Guest Checkout যাতে আটকে না যায়
    req.user = null;
  }

  return next();
});

/**
 * ৩. Role-Based Authorization Middleware (requireRole)
 * নির্দিষ্ট রোল (যেমন: ADMIN বা CUSTOMER) ছাড়া এক্সেস ব্লক করার জন্য
 */
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(
        new ApiError(
          401,
          "Authentication required before verifying permissions.",
          null,
          "AUTH_REQUIRED"
        )
      );
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new ApiError(
          403,
          "Access denied. You do not have permission to perform this action.",
          null,
          "FORBIDDEN_ROLE"
        )
      );
    }

    return next();
  };
}

/**
 * ৪. Admin Only Shortcut Middleware (requireAdmin)
 * পেমেন্ট ভেরিফিকেশন, প্রোডাক্ট প্রাইস আপডেট ও ম্যানুয়াল ডেলিভারি ট্রিগারের জন্য
 */
export const requireAdmin = [requireAuth, requireRole("ADMIN")];
