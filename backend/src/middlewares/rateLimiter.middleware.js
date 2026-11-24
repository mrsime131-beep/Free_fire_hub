import rateLimit from "express-rate-limit";
import { sendError } from "../utils/apiResponse.js";

/**
 * Rate Limit অতিক্রম করলে স্ট্যান্ডার্ড JSON এরর রেসপন্স পাঠানোর হেল্পার
 */
function createRateLimitHandler(message, errorCode = "TOO_MANY_REQUESTS") {
  return (req, res) => {
    return sendError(res, {
      statusCode: 429,
      message,
      errorCode,
    });
  };
}

/**
 * ১. Global API Rate Limiter
 * পুরো ব্যাকএন্ড সার্ভারকে DDoS ও সাধারণ বট ট্রাফিক থেকে সুরক্ষা দেয় (প্রতি মিনিটে সর্বোচ্চ ১২০টি রিকোয়েস্ট)
 */
export const globalApiLimiter = rateLimit({
  windowMs: 60 * 1000, // ১ মিনিট
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler(
    "অতিরিক্ত রিকোয়েস্ট পাঠানো হয়েছে। অনুগ্রহ করে ১ মিনিট পর আবার চেষ্টা করুন।",
    "GLOBAL_RATE_LIMIT_EXCEEDED"
  ),
});

/**
 * ২. Authentication Rate Limiter (Brute-Force Protection)
 * লগইন ও রেজিস্ট্রেশন এন্ডপয়েন্টে পাসওয়ার্ড অনুমান বা স্প্যাম অ্যাকাউন্ট খোলা রোধ করে (১৫ মিনিটে সর্বোচ্চ ১০ বার)
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // ১৫ মিনিট
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler(
    "নিরাপত্তার স্বার্থে অতিরিক্ত লগইন/রেজিস্ট্রেশন চেষ্টা ব্লক করা হয়েছে। ১৫ মিনিট পর আবার চেষ্টা করুন।",
    "AUTH_RATE_LIMIT_EXCEEDED"
  ),
});

/**
 * ৩. Player UID Lookup Rate Limiter
 * বাহ্যিক AuraFFX UID Checker API-কে স্প্যামিং বা বট স্ক্র্যাপিং থেকে সুরক্ষা দেয় (প্রতি মিনিটে সর্বোচ্চ ২০ বার)
 */
export const playerLookupLimiter = rateLimit({
  windowMs: 60 * 1000, // ১ মিনিট
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler(
    "আপনি খুব দ্রুত বারবার UID চেক করছেন। অনুগ্রহ করে কিছুক্ষণ অপেক্ষা করে সঠিক Player UID দিন।",
    "UID_LOOKUP_RATE_LIMIT_EXCEEDED"
  ),
});

/**
 * ৪. Order & Payment Submission Rate Limiter
 * ভুয়া অর্ডার ফ্লাডিং এবং র‍্যান্ডম TrxID অনুমান করে পেমেন্ট সাবমিট করা প্রতিরোধ করে (১০ মিনিটে সর্বোচ্চ ১৫টি চেষ্টা)
 */
export const orderAndPaymentLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // ১০ মিনিট
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler(
    "অতিরিক্ত অর্ডার বা পেমেন্ট রিকোয়েস্ট পাঠানো হয়েছে। অনুগ্রহ করে ১০ মিনিট পর চেষ্টা করুন।",
    "ORDER_PAYMENT_RATE_LIMIT_EXCEEDED"
  ),
});
