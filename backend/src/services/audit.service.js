import { prisma } from "../config/db.js";
import { logger } from "../utils/logger.js";

/**
 * Express Request (req) থেকে ক্লায়েন্টের আসল IP Address বের করার ফাংশন
 * Render এবং Cloudflare প্রক্সি হেডার (x-forwarded-for) সমর্থন করে
 */
export function extractClientIp(req) {
  if (!req) return null;

  const forwardedFor = req.headers?.["x-forwarded-for"];
  if (forwardedFor) {
    const ips = String(forwardedFor).split(",");
    return ips[0].trim();
  }

  return (
    req.headers?.["x-real-ip"] ||
    req.ip ||
    req.socket?.remoteAddress ||
    null
  );
}

/**
 * Express Request (req) থেকে User-Agent বের করার ফাংশন
 */
export function extractUserAgent(req) {
  if (!req || !req.headers) return null;
  const ua = req.headers["user-agent"] || req.headers["User-Agent"];
  return ua ? String(ua).slice(0, 500) : null;
}

/**
 * ডাটাবেসের AuditLog টেবিলে সিকিউরিটি ও বিজনেস ইভেন্ট সংরক্ষণ করার মূল ফাংশন
 * এটি ব্যাকগ্রাউন্ডে নিরাপদভাবে লগ সেভ করবে এবং কোনো কারণে লগিং ব্যর্থ হলেও মূল অর্ডার বা পেমেন্ট প্রসেসকে ক্র্যাশ করাবে না।
 *
 * @param {object} params
 * @param {string|null} [params.userId] - ইউজার বা অ্যাডমিনের আইডি (Guest হলে null)
 * @param {string} params.action - কী অ্যাকশন নেওয়া হয়েছে (যেমন: ORDER_CREATED, PAYMENT_SUBMITTED, PAYMENT_VERIFIED, DELIVERY_TRIGGERED)
 * @param {string} params.entityType - কোন মডেলে পরিবর্তন হয়েছে (যেমন: ORDER, PAYMENT, PRODUCT, DELIVERY, USER)
 * @param {string|null} [params.entityId] - সংশ্লিষ্ট মডেলের আইডি বা অর্ডার নম্বর
 * @param {object|null} [params.req] - Express Request অবজেক্ট (IP ও User-Agent অটোমেটিক নেওয়ার জন্য)
 * @param {string|null} [params.ipAddress] - ম্যানুয়ালি IP পাস করতে চাইলে
 * @param {string|null} [params.userAgent] - ম্যানুয়ালি User-Agent পাস করতে চাইলে
 * @param {object|null} [params.metadata] - অতিরিক্ত তথ্য (JSON আকারে সেভ হবে)
 */
export async function logAuditEvent({
  userId = null,
  action,
  entityType,
  entityId = null,
  req = null,
  ipAddress = null,
  userAgent = null,
  metadata = null,
}) {
  try {
    const resolvedUserId = userId || req?.user?.id || null;
    const resolvedIp = ipAddress || extractClientIp(req);
    const resolvedUserAgent = userAgent || extractUserAgent(req);

    const record = await prisma.auditLog.create({
      data: {
        userId: resolvedUserId,
        action: String(action).toUpperCase(),
        entityType: String(entityType).toUpperCase(),
        entityId: entityId ? String(entityId) : null,
        ipAddress: resolvedIp,
        userAgent: resolvedUserAgent,
        metadata: metadata || undefined,
      },
    });

    logger.debug(
      `Audit event recorded: ${action} on ${entityType} (${entityId || "N/A"})`,
      { auditId: record.id, userId: resolvedUserId, ip: resolvedIp },
      "AUDIT"
    );

    return record;
  } catch (error) {
    // অডিট লগ সেভ হতে কোনো সমস্যা হলে সার্ভারের কনসোলে সতর্কবার্তা দেখাবে, কিন্তু কাস্টমারের অর্ডার আটকে রাখবে না
    logger.error("Failed to write audit log to database", error, "AUDIT_ERROR");
    return null;
  }
}
