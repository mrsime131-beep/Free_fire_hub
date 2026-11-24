const prisma = require('../config/prisma');
const { getClientIp } = require('../middlewares/rateLimiter.middleware');

/**
 * JSON ফিল্ডে সেভ করার আগে সংবেদনশীল কী (যেমন password, token, secret) মুছে ফেলা
 * এবং Decimal/Date নিরাপদে সিরিয়ালাইজ করার হেল্পার ফাংশন।
 */
const sanitizeAuditPayload = (data) => {
  if (!data || typeof data !== 'object') return data || null;

  try {
    const rawClone = JSON.parse(JSON.stringify(data));
    const redactKeys = [
      'password',
      'passwordHash',
      'token',
      'jwt',
      'secret',
      'apiKey',
      'apiSecret',
      'pin',
      'otp',
    ];

    const cleanObject = (obj) => {
      if (Array.isArray(obj)) {
        return obj.map(cleanObject);
      }
      if (obj && typeof obj === 'object') {
        const result = {};
        for (const [key, value] of Object.entries(obj)) {
          if (redactKeys.some((r) => key.toLowerCase().includes(r.toLowerCase()))) {
            result[key] = '[REDACTED]';
          } else {
            result[key] = cleanObject(value);
          }
        }
        return result;
      }
      return obj;
    };

    return cleanObject(rawClone);
  } catch (error) {
    return { note: 'Unserializable payload omitted' };
  }
};

/**
 * ১. ডাটাবেসে নতুন Audit Log সংরক্ষণ করার কোর ফাংশন
 * এটি সাধারণ কল এবং Prisma $transaction (txClient)—উভয় ক্ষেত্রেই কাজ করবে।
 */
const createAuditLog = async (
  {
    actor = null,
    actorId = null,
    actorEmail = null,
    actorRole = null,
    action,
    entityType = 'ORDER',
    entityId,
    orderId = null,
    previousState = null,
    newState = null,
    req = null,
    ipAddress = null,
    userAgent = null,
    metadata = null,
  },
  txClient = null
) => {
  const db = txClient || prisma;

  try {
    const resolvedActorId = actor?.id || actorId || req?.user?.id || null;
    const resolvedActorEmail =
      actor?.email || actorEmail || req?.user?.email || 'SYSTEM';
    const resolvedActorRole =
      actor?.role || actorRole || req?.user?.role || 'SYSTEM';

    const resolvedIp =
      ipAddress || (req ? getClientIp(req) : null) || '127.0.0.1';
    const resolvedUserAgent =
      userAgent ||
      (req?.headers && req.headers['user-agent']
        ? String(req.headers['user-agent']).slice(0, 300)
        : null);

    const auditEntry = await db.auditLog.create({
      data: {
        actorId: resolvedActorId,
        actorEmail: resolvedActorEmail,
        actorRole: resolvedActorRole,
        action: String(action).toUpperCase(),
        entityType: String(entityType).toUpperCase(),
        entityId: String(entityId),
        orderId: orderId || (entityType === 'ORDER' ? String(entityId) : null),
        previousState: sanitizeAuditPayload(previousState),
        newState: sanitizeAuditPayload(newState),
        ipAddress: resolvedIp,
        userAgent: resolvedUserAgent,
        metadata: sanitizeAuditPayload(metadata),
      },
    });

    return auditEntry;
  } catch (error) {
    // অডিট লগ সেভ করতে কোনো অপ্রত্যাশিত সমস্যা হলে সার্ভার কনসোলে লগ রাখবে
    console.error('⚠️ AuditLog creation warning:', error.message);
    return null;
  }
};

/**
 * ২. অ্যাডমিনের অর্ডার, পেমেন্ট ও ডেলিভারি অ্যাকশনের জন্য শর্টকাট হেল্পার ফাংশন
 */
const logAdminOrderAction = async (
  {
    adminUser,
    action,
    order,
    previousState = null,
    newState = null,
    reason = null,
    req = null,
    extraMetadata = {},
  },
  txClient = null
) => {
  return createAuditLog(
    {
      actor: adminUser,
      action,
      entityType: 'ORDER',
      entityId: order.id,
      orderId: order.id,
      previousState:
        previousState || {
          orderStatus: order.orderStatus,
          paymentStatus: order.paymentStatus,
          deliveryStatus: order.deliveryStatus,
        },
      newState,
      req,
      metadata: {
        orderNumber: order.orderNumber,
        playerUid: order.playerUid,
        reason,
        ...extraMetadata,
      },
    },
    txClient
  );
};

/**
 * ৩. নির্দিষ্ট একটি অর্ডারের সম্পূর্ণ অডিট লগ ইতিহাস বের করার ফাংশন
 */
const getOrderAuditLogs = async (orderId) => {
  if (!orderId) return [];

  return prisma.auditLog.findMany({
    where: {
      OR: [{ orderId }, { entityId: orderId }],
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
};

/**
 * ৪. অ্যাডমিন ড্যাশবোর্ডের জন্য ফিল্টার ও পেজিনেশনসহ সব অডিট লগ দেখার ফাংশন
 */
const getAdminAuditLogs = async ({
  page = 1,
  limit = 30,
  action = null,
  actorEmail = null,
  orderId = null,
} = {}) => {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 30));
  const skip = (safePage - 1) * safeLimit;

  const where = {};

  if (action) {
    where.action = String(action).trim().toUpperCase();
  }

  if (actorEmail) {
    where.actorEmail = {
      contains: String(actorEmail).trim(),
      mode: 'insensitive',
    };
  }

  if (orderId) {
    where.orderId = String(orderId).trim();
  }

  const [logs, totalCount] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: safeLimit,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    logs,
    pagination: {
      page: safePage,
      limit: safeLimit,
      totalCount,
      totalPages: Math.ceil(totalCount / safeLimit) || 1,
    },
  };
};

module.exports = {
  sanitizeAuditPayload,
  createAuditLog,
  logAdminOrderAction,
  getOrderAuditLogs,
  getAdminAuditLogs,
};
