const crypto = require('crypto');
const prisma = require('../config/prisma');
const env = require('../config/env');

/**
 * রিকোয়েস্ট বডি থেকে একটি নির্দিষ্ট SHA-256 হ্যাশ তৈরি করা,
 * যাতে একই Idempotency Key দিয়ে ভিন্ন প্রোডাক্ট বা ভিন্ন ইউআইডির অর্ডার পাঠানো না যায়।
 */
const createRequestHash = (req) => {
  const relevantBody = {
    playerUid: req.body?.playerUid || req.body?.uid || '',
    productId: req.body?.productId || req.body?.packageId || '',
    paymentMethod: req.body?.paymentMethod || '',
    transactionReference:
      req.body?.transactionReference || req.body?.paymentReference || req.body?.trxId || '',
  };

  const rawString = `${req.method}:${req.originalUrl}:${JSON.stringify(relevantBody)}`;
  return crypto.createHash('sha256').update(rawString).digest('hex');
};

/**
 * ফ্রন্টএন্ড থেকে Idempotency Key না পাঠালেও ডাবল-ক্লিক আটকানোর জন্য
 * ৩০ সেকেন্ডের টাইম-বাকেটসহ স্বয়ংক্রিয়ভাবে একটি নিরাপদ কী (Key) তৈরি করা।
 */
const resolveIdempotencyKey = (req) => {
  const headerKey =
    req.headers['idempotency-key'] ||
    req.headers['x-idempotency-key'] ||
    req.body?.idempotencyKey;

  if (headerKey && typeof headerKey === 'string' && headerKey.trim().length > 0) {
    return headerKey.trim().slice(0, 128);
  }

  // Fallback automatic fingerprint (30-second window) for rapid double-click protection
  const playerUid = String(req.body?.playerUid || req.body?.uid || 'anon').trim();
  const productId = String(req.body?.productId || req.body?.packageId || 'none').trim();
  const trxId = String(
    req.body?.transactionReference || req.body?.paymentReference || req.body?.trxId || 'notrx'
  ).trim();
  const actor = req.user?.id || req.guestId || req.ip || 'guest';
  const timeBucket = Math.floor(Date.now() / 30000); // 30 seconds bucket

  const rawFingerprint = `auto:${actor}:${playerUid}:${productId}:${trxId}:${timeBucket}`;
  return `auto_${crypto.createHash('sha256').update(rawFingerprint).digest('hex').slice(0, 40)}`;
};

/**
 * ইডেমপোটেন্সি প্রোটেকশন মিডলওয়্যার
 * একই অর্ডার বা পেমেন্ট রিকোয়েস্ট একাধিকবার প্রসেস হওয়া সম্পূর্ণ বন্ধ করে।
 */
const idempotencyProtection = (options = {}) => {
  const {
    requireExplicitKey = false,
    lockTimeoutMs = 30000, // ৩০ সেকেন্ড লক টাইমআউট
    ttlHours = env.IDEMPOTENCY_TTL_HOURS || 24,
  } = options;

  return async (req, res, next) => {
    try {
      const explicitKey =
        req.headers['idempotency-key'] ||
        req.headers['x-idempotency-key'] ||
        req.body?.idempotencyKey;

      if (requireExplicitKey && !explicitKey) {
        return res.status(400).json({
          success: false,
          error: 'IDEMPOTENCY_KEY_REQUIRED',
          message: 'ডুপ্লিকেট অর্ডার প্রতিরোধের জন্য Idempotency-Key পাঠানো আবশ্যক।',
        });
      }

      const idempotencyKey = resolveIdempotencyKey(req);
      const requestHash = createRequestHash(req);
      const endpoint = `${req.method} ${req.baseUrl}${req.path}`;
      const now = new Date();

      req.idempotencyKey = idempotencyKey;

      // ১. ডাটাবেসে এই Key আগে থেকেই আছে কি না যাচাই করা
      const existingRecord = await prisma.idempotencyRecord.findUnique({
        where: { key: idempotencyKey },
      });

      if (existingRecord) {
        // যদি আগের রেকর্ডের মেয়াদ শেষ হয়ে গিয়ে থাকে, তবে তা মুছে নতুন করে প্রসেস করতে দেওয়া হবে
        if (existingRecord.expiresAt && new Date(existingRecord.expiresAt) < now) {
          await prisma.idempotencyRecord.delete({
            where: { key: idempotencyKey },
          }).catch(() => {});
        } else {
          // একই Key ব্যবহার করে যদি ভিন্ন প্রোডাক্ট বা ইউআইডি পাঠানো হয়, তবে ব্লক করা হবে
          if (existingRecord.requestHash !== requestHash) {
            return res.status(422).json({
              success: false,
              error: 'IDEMPOTENCY_PAYLOAD_MISMATCH',
              message:
                'একই Idempotency Key দিয়ে ভিন্ন অর্ডারের তথ্য পাঠানো হয়েছে। নতুন অর্ডারের জন্য নতুন চেষ্টা করুন।',
            });
          }

          // যদি প্রথম রিকোয়েস্টটি এখনো প্রসেসিং অবস্থায় (Locked) থাকে
          if (
            existingRecord.isLocked &&
            existingRecord.lockedUntil &&
            new Date(existingRecord.lockedUntil) > now
          ) {
            return res.status(409).json({
              success: false,
              error: 'DUPLICATE_REQUEST_IN_PROGRESS',
              message:
                'আপনার অর্ডার বা পেমেন্ট রিকোয়েস্টটি ইতিমধ্যে প্রসেস হচ্ছে। অনুগ্রহ করে কয়েক সেকেন্ড অপেক্ষা করুন, ডাবল ক্লিক করবেন না।',
            });
          }

          // যদি রিকোয়েস্টটি ইতিমধ্যে সফলভাবে সম্পন্ন হয়ে থাকে, তবে নতুন অর্ডার না বানিয়ে আগের রেসপন্সই ফেরত দেওয়া হবে
          if (!existingRecord.isLocked && existingRecord.responseBody) {
            res.setHeader('X-Idempotency-Replayed', 'true');
            return res
              .status(existingRecord.responseStatus || 200)
              .json(existingRecord.responseBody);
          }
        }
      }

      // ২. নতুন রিকোয়েস্টের জন্য ডাটাবেসে অ্যাটমিক লক তৈরি করা
      const lockedUntil = new Date(now.getTime() + lockTimeoutMs);
      const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1000);

      try {
        await prisma.idempotencyRecord.upsert({
          where: { key: idempotencyKey },
          update: {
            endpoint,
            requestHash,
            isLocked: true,
            lockedUntil,
            expiresAt,
          },
          create: {
            key: idempotencyKey,
            endpoint,
            requestHash,
            isLocked: true,
            lockedUntil,
            expiresAt,
          },
        });
      } catch (dbErr) {
        // যদি একই মিলিসেকেন্ডে দুটি রিকোয়েস্ট হিট করে (Unique constraint race condition)
        if (dbErr.code === 'P2002') {
          return res.status(409).json({
            success: false,
            error: 'CONCURRENT_DUPLICATE_REQUEST',
            message: 'একই রিকোয়েস্ট দুইবার পাঠানো হয়েছে। অনুগ্রহ করে অপেক্ষা করুন।',
          });
        }
        throw dbErr;
      }

      // ৩. রেসপন্স ইন্টারসেপ্ট করে ডাটাবেসে ফলাফল সংরক্ষণ বা লক রিলিজ করা
      const originalJson = res.json.bind(res);

      res.json = (body) => {
        const statusCode = res.statusCode || 200;

        Promise.resolve()
          .then(async () => {
            // সার্ভার এরর (5xx) বা ভ্যালিডেশন ফেইল (4xx) হলে লক মুছে ফেলা হবে যাতে ইউজার ভুল সংশোধন করে আবার চেষ্টা করতে পারে
            if (statusCode >= 400) {
              await prisma.idempotencyRecord
                .delete({ where: { key: idempotencyKey } })
                .catch(() => {});
              return;
            }

            // সফল অর্ডার বা পেমেন্ট হলে ফলাফল ক্যাশ করে লক খুলে দেওয়া হবে
            const createdOrderId =
              body?.data?.order?.id || body?.order?.id || body?.data?.orderId || null;

            await prisma.idempotencyRecord
              .update({
                where: { key: idempotencyKey },
                data: {
                  isLocked: false,
                  responseStatus: statusCode,
                  responseBody: body,
                  orderId: createdOrderId,
                },
              })
              .catch(() => {});
          })
          .catch((err) => {
            console.error('⚠️ Idempotency response save error:', err.message);
          });

        return originalJson(body);
      };

      next();
    } catch (error) {
      console.error('❌ Idempotency Middleware Error:', error.message);
      next(error);
    }
  };
};

module.exports = {
  idempotencyProtection,
  resolveIdempotencyKey,
  createRequestHash,
};
