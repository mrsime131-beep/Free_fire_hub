import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../config/db.js";
import { env } from "../config/env.js";
import { ApiError, sendSuccess, asyncHandler } from "../utils/apiResponse.js";
import { logAuditEvent } from "../services/audit.service.js";
import { lookupPlayerByUid } from "../services/player.service.js";

/**
 * ইউজারের জন্য নিরাপদ JWT Token তৈরি করার হেল্পার ফাংশন
 */
function signAuthToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
    },
    env.JWT_SECRET,
    {
      expiresIn: env.JWT_EXPIRES_IN || "7d",
    }
  );
}

/**
 * প্রতিটি নতুন ইউজারের জন্য ইউনিক রেফারেল কোড তৈরি করার হেল্পার ফাংশন
 * উদাহরণ: FFH-RAKIB4F9A
 */
async function generateUniqueReferralCode(name = "USER") {
  const cleanPrefix =
    String(name)
      .replace(/[^a-zA-Z0-9]/g, "")
      .toUpperCase()
      .slice(0, 5) || "PLAYER";

  for (let i = 0; i < 5; i++) {
    const randomSuffix = crypto.randomBytes(2).toString("hex").toUpperCase();
    const candidateCode = `FFH-${cleanPrefix}${randomSuffix}`;

    const existing = await prisma.user.findUnique({
      where: { referralCode: candidateCode },
      select: { id: true },
    });

    if (!existing) {
      return candidateCode;
    }
  }

  return `FFH-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

/**
 * রেসপন্সে পাঠানোর জন্য পাসওয়ার্ড হ্যাশ বাদে নিরাপদ ইউজার অবজেক্ট সাজানো
 */
function sanitizeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    walletBalance: user.walletBalance,
    rewardPoints: user.rewardPoints,
    referralCode: user.referralCode,
    savedUid: user.savedUid,
    savedPlayerName: user.savedPlayerName,
    savedServer: user.savedServer,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

/**
 * ১. POST /api/auth/register
 * নতুন কাস্টমার অ্যাকাউন্ট রেজিস্ট্রেশন, পাসওয়ার্ড হ্যাশিং, রেফারেল বোনাস এবং অটো-লগইন টোকেন প্রদান।
 */
export const registerUser = asyncHandler(async (req, res) => {
  const {
    name,
    email,
    phone,
    password,
    referralCode: invitedByCode,
    savedUid,
  } = req.body;

  // ১. ইমেইল আগে থেকেই ব্যবহৃত হয়েছে কি না তা চেক করা
  const existingEmailUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existingEmailUser) {
    throw new ApiError(
      409,
      "এই ইমেইল অ্যাড্রেস দিয়ে ইতিমধ্যে একটি অ্যাকাউন্ট খোলা রয়েছে। অনুগ্রহ করে লগইন করুন।",
      null,
      "EMAIL_ALREADY_EXISTS"
    );
  }

  // ২. ফোন নম্বর দেওয়া থাকলে সেটি ডুপ্লিকেট কি না চেক করা
  if (phone) {
    const existingPhoneUser = await prisma.user.findFirst({
      where: { phone },
      select: { id: true },
    });

    if (existingPhoneUser) {
      throw new ApiError(
        409,
        "এই মোবাইল নম্বরটি ইতিমধ্যে অন্য একটি অ্যাকাউন্টে ব্যবহৃত হয়েছে।",
        null,
        "PHONE_ALREADY_EXISTS"
      );
    }
  }

  // ৩. রেফারেল কোড দেওয়া থাকলে আমন্ত্রণকারী ইউজারকে খুঁজে বের করা
  let referrerUser = null;
  if (invitedByCode) {
    referrerUser = await prisma.user.findUnique({
      where: { referralCode: invitedByCode.toUpperCase() },
      select: { id: true, referralCode: true },
    });
  }

  // ৪. রেজিস্ট্রেশনের সময়ই যদি কাস্টমার নিজের Free Fire UID দেয়, তবে আসল নাম ভেরিফাই করে নেওয়া
  let verifiedPlayerName = null;
  if (savedUid) {
    const playerLookup = await lookupPlayerByUid(savedUid, "BD").catch(
      () => null
    );
    if (playerLookup?.playerName) {
      verifiedPlayerName = playerLookup.playerName;
    }
  }

  const saltRounds = Number(env.BCRYPT_SALT_ROUNDS || 10);
  const passwordHash = await bcrypt.hash(password, saltRounds);
  const ownReferralCode = await generateUniqueReferralCode(name);

  // রেফারেল কোড ব্যবহার করে জয়েন করলে নতুন ইউজার এবং রেফারার উভয়েই ১০ রিওয়ার্ড পয়েন্ট বোনাস পাবে
  const initialRewardPoints = referrerUser ? 10 : 0;

  const newUser = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        name,
        email,
        phone: phone || null,
        passwordHash,
        role: "CUSTOMER",
        referralCode: ownReferralCode,
        rewardPoints: initialRewardPoints,
        savedUid: savedUid || null,
        savedPlayerName: verifiedPlayerName,
        savedServer: "BD",
        isActive: true,
      },
    });

    if (referrerUser) {
      await tx.user.update({
        where: { id: referrerUser.id },
        data: {
          rewardPoints: { increment: 10 },
        },
      });
    }

    return created;
  });

  const token = signAuthToken(newUser);

  await logAuditEvent({
    req,
    userId: newUser.id,
    action: "USER_REGISTERED",
    entityType: "USER",
    entityId: newUser.id,
    metadata: {
      email: newUser.email,
      phone: newUser.phone,
      referredByCode: referrerUser ? referrerUser.referralCode : null,
      savedUid: newUser.savedUid,
    },
  });

  return sendSuccess(res, {
    statusCode: 201,
    message: "আপনার অ্যাকাউন্ট সফলভাবে তৈরি হয়েছে!",
    data: {
      token,
      user: sanitizeUser(newUser),
    },
  });
});

/**
 * ২. POST /api/auth/login
 * কাস্টমার এবং অ্যাডমিন লগইন এন্ডপয়েন্ট।
 */
export const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    throw new ApiError(
      401,
      "ভুল ইমেইল অথবা পাসওয়ার্ড দেওয়া হয়েছে। আবার চেষ্টা করুন।",
      null,
      "INVALID_CREDENTIALS"
    );
  }

  if (!user.isActive) {
    throw new ApiError(
      403,
      "আপনার অ্যাকাউন্টটি সাময়িকভাবে নিষ্ক্রিয় করা হয়েছে। সাপোর্টে যোগাযোগ করুন।",
      null,
      "ACCOUNT_DISABLED"
    );
  }

  const isPasswordMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordMatch) {
    throw new ApiError(
      401,
      "ভুল ইমেইল অথবা পাসওয়ার্ড দেওয়া হয়েছে। আবার চেষ্টা করুন।",
      null,
      "INVALID_CREDENTIALS"
    );
  }

  const token = signAuthToken(user);

  await logAuditEvent({
    req,
    userId: user.id,
    action: "USER_LOGGED_IN",
    entityType: "USER",
    entityId: user.id,
    metadata: {
      email: user.email,
      role: user.role,
    },
  });

  return sendSuccess(res, {
    statusCode: 200,
    message: `স্বাগতম, ${user.name}! আপনি সফলভাবে লগইন করেছেন।`,
    data: {
      token,
      user: sanitizeUser(user),
    },
  });
});

/**
 * ৩. GET /api/auth/me (Logged-in User/Admin)
 * বর্তমান লগইন করা ইউজারের প্রোফাইল, ওয়ালেট ব্যালেন্স, রিওয়ার্ড পয়েন্ট এবং মোট অর্ডারের সংখ্যা রিটার্ন করে।
 */
export const getCurrentUserProfile = asyncHandler(async (req, res) => {
  const userWithStats = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: {
      _count: {
        select: { orders: true },
      },
    },
  });

  if (!userWithStats) {
    throw new ApiError(
      404,
      "ইউজার প্রোফাইল খুঁজে পাওয়া যায়নি।",
      null,
      "USER_NOT_FOUND"
    );
  }

  return sendSuccess(res, {
    statusCode: 200,
    message: "User profile retrieved successfully",
    data: {
      ...sanitizeUser(userWithStats),
      totalOrders: userWithStats._count.orders,
    },
  });
});

/**
 * ৪. PATCH /api/auth/profile (Logged-in User/Admin)
 * ইউজারের নাম, মোবাইল নম্বর এবং ডিফল্ট Free Fire UID আপডেট করা।
 */
export const updateUserProfile = asyncHandler(async (req, res) => {
  const { name, phone, savedUid, savedPlayerName, savedServer } = req.body;

  if (phone) {
    const duplicatePhone = await prisma.user.findFirst({
      where: {
        phone,
        id: { not: req.user.id },
      },
      select: { id: true },
    });

    if (duplicatePhone) {
      throw new ApiError(
        409,
        "এই মোবাইল নম্বরটি ইতিমধ্যে অন্য একটি অ্যাকাউন্টে ব্যবহৃত হচ্ছে।",
        null,
        "PHONE_ALREADY_IN_USE"
      );
    }
  }

  const updateData = {};
  if (name !== undefined) updateData.name = name;
  if (phone !== undefined) updateData.phone = phone;
  if (savedServer !== undefined) updateData.savedServer = savedServer;

  if (savedUid !== undefined) {
    updateData.savedUid = savedUid;

    if (savedUid && !savedPlayerName) {
      const targetServer = savedServer || req.user.savedServer || "BD";
      const verified = await lookupPlayerByUid(savedUid, targetServer);
      updateData.savedPlayerName = verified.playerName;
    } else if (!savedUid) {
      updateData.savedPlayerName = null;
    }
  }

  if (savedPlayerName !== undefined && savedUid !== null) {
    updateData.savedPlayerName = savedPlayerName;
  }

  const updatedUser = await prisma.user.update({
    where: { id: req.user.id },
    data: updateData,
  });

  await logAuditEvent({
    req,
    userId: req.user.id,
    action: "USER_PROFILE_UPDATED",
    entityType: "USER",
    entityId: req.user.id,
    metadata: {
      updatedFields: Object.keys(updateData),
    },
  });

  return sendSuccess(res, {
    statusCode: 200,
    message: "আপনার প্রোফাইল সফলভাবে আপডেট করা হয়েছে।",
    data: sanitizeUser(updatedUser),
  });
});

/**
 * ৫. PATCH /api/auth/change-password (Logged-in User/Admin)
 * বর্তমান পাসওয়ার্ড যাচাই করে নতুন পাসওয়ার্ড সেট করা।
 */
export const changeUserPassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
  });

  if (!user) {
    throw new ApiError(404, "ইউজার খুঁজে পাওয়া যায়নি।", null, "USER_NOT_FOUND");
  }

  const isCurrentValid = await bcrypt.compare(
    currentPassword,
    user.passwordHash
  );

  if (!isCurrentValid) {
    throw new ApiError(
      400,
      "আপনার বর্তমান পাসওয়ার্ডটি সঠিক নয়।",
      null,
      "INCORRECT_CURRENT_PASSWORD"
    );
  }

  const saltRounds = Number(env.BCRYPT_SALT_ROUNDS || 10);
  const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: newPasswordHash,
    },
  });

  await logAuditEvent({
    req,
    userId: user.id,
    action: "USER_PASSWORD_CHANGED",
    entityType: "USER",
    entityId: user.id,
  });

  return sendSuccess(res, {
    statusCode: 200,
    message: "আপনার পাসওয়ার্ড সফলভাবে পরিবর্তন করা হয়েছে।",
  });
});
