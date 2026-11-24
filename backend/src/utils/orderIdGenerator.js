import crypto from "crypto";
import { prisma } from "../config/db.js";

/**
 * বাংলাদেশ সময় (Asia/Dhaka - UTC+6) অনুযায়ী YYYYMMDD ফরম্যাটে আজকের তারিখ বের করার ফাংশন
 */
export function getBangladeshDateString(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  // en-CA ফরম্যাট YYYY-MM-DD রিটার্ন করে, সেখান থেকে হাইফেন সরিয়ে YYYYMMDD করা হচ্ছে
  return formatter.format(date).replace(/-/g, "");
}

/**
 * প্রতিটি অর্ডারের জন্য Sequential Unique Order ID জেনারেটর
 * Example Format: FFH-20261124-000001
 * @param {object} dbClient - Prisma Client অথবা Prisma Transaction Client (tx)
 */
export async function generateUniqueOrderNumber(dbClient = prisma) {
  const datePart = getBangladeshDateString();
  const prefix = `FFH-${datePart}-`;

  // আজকের তারিখের সর্বশেষ অর্ডারটি খুঁজে বের করা
  const lastOrderToday = await dbClient.order.findFirst({
    where: {
      orderNumber: {
        startsWith: prefix,
      },
    },
    orderBy: {
      orderNumber: "desc",
    },
    select: {
      orderNumber: true,
    },
  });

  let nextSequenceNumber = 1;

  if (lastOrderToday && lastOrderToday.orderNumber) {
    const parts = lastOrderToday.orderNumber.split("-");
    const lastSeqStr = parts[2];
    const parsedSeq = parseInt(lastSeqStr, 10);
    if (!isNaN(parsedSeq)) {
      nextSequenceNumber = parsedSeq + 1;
    }
  }

  const paddedSequence = String(nextSequenceNumber).padStart(6, "0");
  const candidateOrderNumber = `${prefix}${paddedSequence}`;

  // অতিরিক্ত সুরক্ষা: যদি একই মিলিসেকেন্ডে দুটি রিকোয়েস্টের কারণে সংঘর্ষ হয়, তবে চেক করে নেওয়া
  const existing = await dbClient.order.findUnique({
    where: { orderNumber: candidateOrderNumber },
    select: { id: true },
  });

  if (!existing) {
    return candidateOrderNumber;
  }

  // বিরল রেস কন্ডিশনের ক্ষেত্রে পরবর্তী সিকোয়েন্স বা র‍্যান্ডম সাফিক্স ব্যাকআপ
  const fallbackSequence = String(nextSequenceNumber + 1).padStart(6, "0");
  return `${prefix}${fallbackSequence}`;
}

/**
 * ফিন্যান্সিয়াল লেজার (Transaction Model)-এর জন্য ইউনিক রেফারেন্স জেনারেটর
 * Example: TXN-20261124-A8F9C21B
 */
export function generateTransactionReference(prefix = "TXN") {
  const datePart = getBangladeshDateString();
  const randomHex = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `${prefix}-${datePart}-${randomHex}`;
}

/**
 * অটোমেটিক ডায়মন্ড ডেলিভারি ইঞ্জিনের জন্য ইউনিক রেফারেন্স জেনারেটর
 * DEMO মোডে স্পষ্টভাবে DEMO-DLV-... এবং LIVE মোডে LIVE-DLV-... প্রিফিক্স যুক্ত করবে
 */
export function generateDeliveryReference(isDemo = true) {
  const modePrefix = isDemo ? "DEMO-DLV" : "LIVE-DLV";
  const datePart = getBangladeshDateString();
  const randomHex = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `${modePrefix}-${datePart}-${randomHex}`;
}

/**
 * নতুন রেজিস্টার করা ইউজারের জন্য ইউনিক রেফারেল কোড জেনারেটর
 * Example: FFH7K9M2X
 */
export function generateUserReferralCode(name = "FFH") {
  const cleanPrefix =
    name
      .replace(/[^a-zA-Z]/g, "")
      .toUpperCase()
      .slice(0, 3) || "FFH";
  const randomPart = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `${cleanPrefix}${randomPart}`;
}
