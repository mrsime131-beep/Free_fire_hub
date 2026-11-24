import express from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "./config/env.js";
import { sendSuccess, ApiError } from "./utils/apiResponse.js";
import { logger } from "./utils/logger.js";
import apiRoutes from "./routes/index.js";
import * as rateLimiters from "./middlewares/rateLimiter.middleware.js";
import * as errorMiddlewares from "./middlewares/error.middleware.js";

const app = express();

/**
 * ১. Trust Proxy কনফিগারেশন
 * Render, Railway, Vercel বা Cloudflare-এর পেছনে সার্ভার চললে কাস্টমারের আসল IP Address
 * সঠিকভাবে পাওয়ার জন্য এবং Rate Limiter ও Audit Log নির্ভুলভাবে কাজ করার জন্য এটি অপরিহার্য।
 */
app.set("trust proxy", 1);

/**
 * ২. Helmet Security Headers
 * XSS, Clickjacking এবং MIME-sniffing অ্যাটাক থেকে API-কে সুরক্ষিত রাখে।
 */
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

/**
 * ৩. Dynamic CORS Configuration
 * আপনার Next.js Frontend (Vercel / Custom Domain / Localhost) থেকে নিরাপদে API কল করার অনুমতি দেয়।
 */
const rawOrigins =
  env.CORS_ORIGINS ||
  env.CORS_ORIGIN ||
  env.FRONTEND_URL ||
  "http://localhost:3000";

const allowedOrigins = Array.isArray(rawOrigins)
  ? rawOrigins
  : String(rawOrigins)
      .split(",")
      .map((origin) => origin.trim().replace(/\/$/, ""))
      .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Server-to-server, Postman, বা Mobile App রিকোয়েস্টের ক্ষেত্রে origin খালি থাকতে পারে
      if (!origin) {
        return callback(null, true);
      }

      const cleanOrigin = origin.replace(/\/$/, "");
      if (
        allowedOrigins.includes("*") ||
        allowedOrigins.includes(cleanOrigin) ||
        env.NODE_ENV !== "production"
      ) {
        return callback(null, true);
      }

      logger.warn(`Blocked request from unauthorized CORS origin: ${origin}`, null, "CORS");
      return callback(
        new ApiError(
          403,
          `CORS policy does not allow access from origin: ${origin}`,
          null,
          "CORS_NOT_ALLOWED"
        )
      );
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Idempotency-Key",
      "Idempotency-Key",
      "X-Requested-With",
      "Accept",
    ],
  })
);

/**
 * ৪. Body Parser Middleware
 * বড় পে-লোড পাঠিয়ে সার্ভার ক্র্যাশ (DoS Attack) প্রতিরোধের জন্য 1MB লিমিট সেট করা হয়েছে।
 */
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

/**
 * ৫. HTTP Request Logger Middleware
 * প্রতিটি ইনকামিং রিকোয়েস্ট এবং রেসপন্স টাইম কনসোলে লগ করবে।
 */
app.use((req, res, next) => {
  const startTime = Date.now();
  res.on("finish", () => {
    const durationMs = Date.now() - startTime;
    const logMessage = `${req.method} ${req.originalUrl} -> ${res.statusCode} (${durationMs}ms)`;
    if (res.statusCode >= 500) {
      logger.error(logMessage, null, "HTTP");
    } else if (res.statusCode >= 400) {
      logger.warn(logMessage, null, "HTTP");
    } else {
      logger.info(logMessage, null, "HTTP");
    }
  });
  next();
});

/**
 * ৬. Global API Rate Limiter
 */
const globalApiLimiter =
  rateLimiters.apiLimiter ||
  rateLimiters.globalLimiter ||
  rateLimiters.defaultLimiter ||
  null;

if (globalApiLimiter) {
  app.use("/api", globalApiLimiter);
}

/**
 * ৭. Root Status Endpoint (GET /)
 * ব্রাউজারে সরাসরি ব্যাকএন্ড URL ওপেন করলে সার্ভার যে সচল আছে তা দেখাবে।
 */
app.get("/", (req, res) => {
  return sendSuccess(res, {
    statusCode: 200,
    message: "Welcome to FreeFireHub BD E-Commerce Top-Up API",
    data: {
      service: "freefirehub-bd-backend",
      status: "ONLINE",
      version: "1.0.0",
      environment: env.NODE_ENV,
      deliveryMode: env.DELIVERY_MODE,
      healthEndpoint: "/api/health",
    },
  });
});

/**
 * ৮. Main API Routes মাউন্ট করা
 * ফ্রন্টএন্ড থেকে /api/... অথবা /api/v1/... যেভাবেই কল করা হোক, উভয় পাথই কাজ করবে।
 */
app.use("/api", apiRoutes);
app.use("/api/v1", apiRoutes);

/**
 * ৯. 404 Not Found এবং Global Error Handler সংযুক্তকরণ
 */
const notFoundMiddleware =
  errorMiddlewares.notFoundHandler ||
  errorMiddlewares.notFound ||
  ((req, res, next) => {
    next(
      new ApiError(
        404,
        `API endpoint not found: ${req.method} ${req.originalUrl}`,
        null,
        "ROUTE_NOT_FOUND"
      )
    );
  });

const globalErrorMiddleware =
  errorMiddlewares.globalErrorHandler ||
  errorMiddlewares.errorHandler ||
  errorMiddlewares.default ||
  ((err, req, res, _next) => {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      statusCode,
      errorCode: err.errorCode || "INTERNAL_SERVER_ERROR",
      message: err.message || "সার্ভারে একটি অপ্রত্যাশিত সমস্যা হয়েছে।",
      errors: err.errors || null,
    });
  });

app.use(notFoundMiddleware);
app.use(globalErrorMiddleware);

export default app;
