import cors from "cors";
import { env } from "./env.js";

/**
 * Production-Ready CORS Configuration
 * শুধুমাত্র অনুমোদিত Frontend Domain (যেমন: https://free-fire-hub-12.onrender.com)
 * এবং Localhost থেকে আসা ব্রাউজার রিকোয়েস্টগুলোকে এক্সেস দেবে।
 */
export const corsOptions = {
  origin: (origin, callback) => {
    // Server-to-Server call, Render Health Check বা মোবাইল অ্যাপের ক্ষেত্রে origin নাও থাকতে পারে
    if (!origin) {
      return callback(null, true);
    }

    const normalizedOrigin = origin.replace(/\/$/, "");
    const isAllowed = env.ALLOWED_ORIGINS_LIST.some(
      (allowed) => allowed.replace(/\/$/, "") === normalizedOrigin
    );

    if (isAllowed || !env.IS_PRODUCTION) {
      return callback(null, true);
    }

    const corsError = new Error(
      `CORS Security Block: Origin '${origin}' is not authorized to access this API.`
    );
    corsError.statusCode = 403;
    return callback(corsError, false);
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Idempotency-Key",
    "X-Requested-With",
    "Accept",
  ],
  exposedHeaders: ["X-RateLimit-Limit", "X-RateLimit-Remaining"],
  credentials: true,
  optionsSuccessStatus: 200,
  maxAge: 86400, // ২৪ ঘণ্টা Preflight (OPTIONS) রিকোয়েস্ট ক্যাশ রাখবে, ফলে সাইট দ্রুত কাজ করবে
};

export const corsMiddleware = cors(corsOptions);
