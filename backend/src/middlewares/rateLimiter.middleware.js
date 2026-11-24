/**
 * Render ও Reverse Proxy থেকে ক্লায়েন্টের আসল IP Address বের করার হেল্পার ফাংশন
 */
const getClientIp = (req) => {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor && typeof forwardedFor === 'string') {
    return forwardedFor.split(',')[0].trim();
  }
  return (
    req.headers['x-real-ip'] ||
    req.ip ||
    req.connection?.remoteAddress ||
    'unknown_ip'
  );
};

// ইন-মেমোরি স্টোর (যাতে কোনো এক্সটার্নাল প্যাকেজ মিসিং থাকলেও সার্ভার কখনো ক্র্যাশ না করে)
const rateLimitStore = new Map();

// প্রতি ৫ মিনিটে মেয়াদোত্তীর্ণ IP রেকর্ড পরিষ্কার করা (Memory Leak প্রতিরোধ)
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitStore.entries()) {
    if (record.resetTime <= now) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

if (cleanupInterval.unref) {
  cleanupInterval.unref();
}

/**
 * কাস্টম রেট লিমিটার জেনারেটর ফাংশন
 */
const createRateLimiter = (options = {}) => {
  const {
    keyPrefix = 'global',
    windowMs = 60 * 1000, // ডিফল্ট ১ মিনিট
    max = 60, // প্রতি উইন্ডোতে সর্বোচ্চ রিকোয়েস্ট সংখ্যা
    message = 'অতিরিক্ত রিকোয়েস্ট পাঠানো হয়েছে। অনুগ্রহ করে কিছুক্ষণ পর আবার চেষ্টা করুন।',
    skipSuccessfulRequests = false,
  } = options;

  return (req, res, next) => {
    try {
      const clientIp = getClientIp(req);
      const userIdOrGuest = req.user?.id || req.headers['x-guest-id'] || '';
      const key = `${keyPrefix}:${clientIp}:${userIdOrGuest}`;
      const now = Date.now();

      let record = rateLimitStore.get(key);

      if (!record || record.resetTime <= now) {
        record = {
          count: 0,
          resetTime: now + windowMs,
        };
      }

      record.count += 1;
      rateLimitStore.set(key, record);

      const remaining = Math.max(0, max - record.count);
      const retryAfterSeconds = Math.ceil((record.resetTime - now) / 1000);

      // স্ট্যান্ডার্ড RateLimit হেডার যুক্ত করা
      res.setHeader('X-RateLimit-Limit', String(max));
      res.setHeader('X-RateLimit-Remaining', String(remaining));
      res.setHeader('X-RateLimit-Reset', String(Math.ceil(record.resetTime / 1000)));

      if (record.count > max) {
        res.setHeader('Retry-After', String(retryAfterSeconds));
        return res.status(429).json({
          success: false,
          error: 'TOO_MANY_REQUESTS',
          message,
          retryAfterSeconds,
        });
      }

      if (skipSuccessfulRequests) {
        res.on('finish', () => {
          if (res.statusCode < 400) {
            const current = rateLimitStore.get(key);
            if (current && current.count > 0) {
              current.count -= 1;
              rateLimitStore.set(key, current);
            }
          }
        });
      }

      next();
    } catch (error) {
      // রেট লিমিটারের কোনো অভ্যন্তরীণ এররের কারণে যেন আসল অর্ডার ব্লক না হয়
      console.error('⚠️ RateLimiter non-fatal error:', error.message);
      next();
    }
  };
};

/**
 * ১. সাধারণ API রেট লিমিটার (প্রতি ১ মিনিটে সর্বোচ্চ ১২০টি রিকোয়েস্ট)
 */
const apiRateLimiter = createRateLimiter({
  keyPrefix: 'api_general',
  windowMs: 60 * 1000,
  max: 120,
  message: 'আপনি খুব দ্রুত রিকোয়েস্ট পাঠাচ্ছেন। অনুগ্রহ করে ১ মিনিট অপেক্ষা করুন।',
});

/**
 * ২. স্মার্ট অর্ডার ক্রিয়েশন লিমিটার (প্রতি ৫ মিনিটে সর্বোচ্চ ১৫টি অর্ডার চেষ্টার অনুমতি)
 */
const orderCreationLimiter = createRateLimiter({
  keyPrefix: 'order_create',
  windowMs: 5 * 60 * 1000,
  max: 15,
  message:
    'নিরাপত্তার স্বার্থে অল্প সময়ে অতিরিক্ত অর্ডার রিকোয়েস্ট সাময়িকভাবে সীমিত করা হয়েছে। ৫ মিনিট পর চেষ্টা করুন।',
});

/**
 * ৩. ম্যানুয়াল পেমেন্ট ও TrxID সাবমিশন লিমিটার (প্রতি ৫ মিনিটে সর্বোচ্চ ১৫ বার)
 */
const paymentSubmissionLimiter = createRateLimiter({
  keyPrefix: 'payment_submit',
  windowMs: 5 * 60 * 1000,
  max: 15,
  message:
    'অতিরিক্ত পেমেন্ট ভেরিফিকেশন রিকোয়েস্ট পাঠানো হয়েছে। অনুগ্রহ করে ৫ মিনিট পর সঠিক TrxID দিয়ে চেষ্টা করুন।',
});

/**
 * ৪. কাস্টমার অর্ডার ট্র্যাকিং লিমিটার (প্রতি ১ মিনিটে সর্বোচ্চ ৪০ বার ট্র্যাকিং চেক)
 */
const trackingRateLimiter = createRateLimiter({
  keyPrefix: 'order_track',
  windowMs: 60 * 1000,
  max: 40,
  message: 'অর্ডার ট্র্যাকিং রিকোয়েস্টের সীমা অতিক্রম করেছে। ১ মিনিট পর আবার চেক করুন।',
});

/**
 * ৫. লগইন ও অ্যাডমিন অথেনটিকেশন ব্রুট-ফোর্স প্রোটেকশন (প্রতি ১৫ মিনিটে সর্বোচ্চ ১০ বার ভুল চেষ্টা)
 */
const authRateLimiter = createRateLimiter({
  keyPrefix: 'auth_login',
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  message:
    'একাধিকবার ভুল লগইন চেষ্টার কারণে আপনার আইপি ১৫ মিনিটের জন্য লক করা হয়েছে।',
});

module.exports = {
  getClientIp,
  createRateLimiter,
  apiRateLimiter,
  orderCreationLimiter,
  paymentSubmissionLimiter,
  trackingRateLimiter,
  authRateLimiter,
};
