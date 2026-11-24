import { ApiError } from "../utils/apiResponse.js";
import { logger } from "../utils/logger.js";

// ইন-মেমোরি রিকোয়েস্ট লক ও রেসপন্স ক্যাশ (ডাটাবেস Unique Constraint-এর পাশাপাশি তাৎক্ষণিক ডাবল-ক্লিক রোধ করার জন্য)
const idempotencyStore = new Map();
const TTL_MS = 10 * 60 * 1000; // ১০ মিনিট ক্যাশ মেয়াদ

/**
 * নির্দিষ্ট সময় পর পর মেয়াদোত্তীর্ণ Idempotency Key মেমোরি থেকে পরিষ্কার করার ফাংশন
 */
function cleanupExpiredKeys() {
  const now = Date.now();
  for (const [key, entry] of idempotencyStore.entries()) {
    if (now - entry.timestamp > TTL_MS) {
      idempotencyStore.delete(key);
    }
  }
}

// প্রতি ৫ মিনিট পর পর অটো-ক্লিনআপ চলবে
setInterval(cleanupExpiredKeys, 5 * 60 * 1000).unref();

/**
 * Idempotency Protection Middleware
 * কাস্টমার যখন "Place Order" বা "Submit Payment" বাটনে ডাবল ক্লিক করে অথবা স্লো ইন্টারনেটের কারণে
 * একই রিকোয়েস্ট দুইবার আসে, তখন ডুপ্লিকেট অর্ডার বা পেমেন্ট তৈরি হওয়া শতভাগ প্রতিরোধ করে।
 */
export function idempotencyProtection(options = { required: false }) {
  return (req, res, next) => {
    cleanupExpiredKeys();

    const rawKey =
      req.headers["x-idempotency-key"] ||
      req.headers["X-Idempotency-Key"] ||
      req.body?.idempotencyKey ||
      null;

    if (!rawKey) {
      if (options.required) {
        return next(
          new ApiError(
            400,
            "Idempotency key (X-Idempotency-Key header) is required for this request.",
            null,
            "IDEMPOTENCY_KEY_MISSING"
          )
        );
      }
      req.idempotencyKey = null;
      return next();
    }

    const cleanKey = String(rawKey).trim();

    if (cleanKey.length < 8 || cleanKey.length > 128) {
      return next(
        new ApiError(
          400,
          "Invalid X-Idempotency-Key format. Must be between 8 and 128 characters.",
          null,
          "INVALID_IDEMPOTENCY_KEY"
        )
      );
    }

    // আলাদা এন্ডপয়েন্ট ও মেথডের সাথে কী (Key) স্কোপ করা
    const scopedKey = `${req.method}:${req.baseUrl}${req.path}:${cleanKey}`;
    req.idempotencyKey = cleanKey;

    const existingEntry = idempotencyStore.get(scopedKey);

    if (existingEntry) {
      // ১. যদি আগের রিকোয়েস্টটি এখনো প্রসেসিং অবস্থায় থাকে (যেমন: ইউজার ১ সেকেন্ডে ২ বার বাটনে ক্লিক করেছে)
      if (existingEntry.status === "IN_PROGRESS") {
        logger.warn(
          `Blocked concurrent duplicate request with Idempotency-Key: ${cleanKey}`,
          { path: req.originalUrl },
          "IDEMPOTENCY"
        );
        return next(
          new ApiError(
            409,
            "আপনার রিকোয়েস্টটি ইতিমধ্যে প্রসেস হচ্ছে। অনুগ্রহ করে ডাবল ক্লিক না করে কয়েক সেকেন্ড অপেক্ষা করুন।",
            null,
            "CONCURRENT_DUPLICATE_REQUEST"
          )
        );
      }

      // ২. যদি রিকোয়েস্টটি ইতিমধ্যে সফলভাবে সম্পন্ন হয়ে থাকে, তবে নতুন অর্ডার না বানিয়ে আগের সফল রেসপন্সই ফেরত দেবে
      if (existingEntry.status === "COMPLETED" && existingEntry.responseBody) {
        logger.info(
          `Returning cached idempotent response for key: ${cleanKey}`,
          { path: req.originalUrl },
          "IDEMPOTENCY"
        );
        res.setHeader("X-Idempotent-Replay", "true");
        return res
          .status(existingEntry.statusCode || 200)
          .json(existingEntry.responseBody);
      }
    }

    // নতুন রিকোয়েস্টকে IN_PROGRESS হিসেবে লক করা
    idempotencyStore.set(scopedKey, {
      status: "IN_PROGRESS",
      timestamp: Date.now(),
    });

    // res.json হুক করে সফল রেসপন্স ক্যাশ করা, আর এরর হলে লক খুলে দেওয়া যাতে ইউজার ভুল সংশোধন করে আবার চেষ্টা করতে পারে
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        idempotencyStore.set(scopedKey, {
          status: "COMPLETED",
          statusCode: res.statusCode,
          responseBody: body,
          timestamp: Date.now(),
        });
      } else {
        idempotencyStore.delete(scopedKey);
      }
      return originalJson(body);
    };

    // যদি সংযোগ বিচ্ছিন্ন বা অপ্রত্যাশিত এরর হয় তবে লক রিলিজ করা
    res.on("close", () => {
      const current = idempotencyStore.get(scopedKey);
      if (current && current.status === "IN_PROGRESS" && !res.writableEnded) {
        idempotencyStore.delete(scopedKey);
      }
    });

    return next();
  };
}
