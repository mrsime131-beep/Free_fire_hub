import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { env } from "../config/env.js";
import { ApiError, sendError } from "../utils/apiResponse.js";
import { logger } from "../utils/logger.js";

/**
 * 404 Not Found Middleware
 * ভুল বা অস্তিত্বহীন কোনো API Endpoint-এ রিকোয়েস্ট পাঠালে এটি হ্যান্ডেল করবে
 */
export function notFoundHandler(req, res, next) {
  const message = `API Endpoint not found: ${req.method} ${req.originalUrl}`;
  next(new ApiError(404, message, null, "ROUTE_NOT_FOUND"));
}

/**
 * Global Error Handling Middleware
 * অ্যাপ্লিকেশনের সব ধরনের Error (Custom ApiError, Zod Validation, Prisma Database, JWT, CORS)
 * নিরাপদভাবে প্রসেস করে স্ট্যান্ডার্ড JSON ফরম্যাটে পাঠাবে।
 */
export function globalErrorHandler(err, req, res, next) {
  let statusCode = err.statusCode || 500;
  let message = err.message || "Internal Server Error";
  let errorCode = err.errorCode || "INTERNAL_SERVER_ERROR";
  let errors = err.errors || null;

  // ১. Zod Input Validation Error হ্যান্ডলিং
  if (err instanceof ZodError) {
    statusCode = 400;
    message = "Validation failed. Please check your input data.";
    errorCode = "VALIDATION_ERROR";
    errors = err.errors.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    }));
  }

  // ২. Prisma Database Known Request Error হ্যান্ডলিং (যেমন: Duplicate TrxID বা Email)
  else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      statusCode = 409;
      errorCode = "DUPLICATE_RECORD";
      const targetFields = Array.isArray(err.meta?.target)
        ? err.meta.target.join(", ")
        : String(err.meta?.target || "record");

      if (targetFields.includes("transactionReference")) {
        message =
          "এই Transaction ID (TrxID) ইতিমধ্যে ব্যবহৃত হয়েছে। অনুগ্রহ করে সঠিক এবং নতুন TrxID দিন।";
        errorCode = "DUPLICATE_TRANSACTION_ID";
      } else if (targetFields.includes("email")) {
        message = "এই ইমেইল দিয়ে ইতিমধ্যে একটি অ্যাকাউন্ট খোলা আছে।";
      } else if (targetFields.includes("phone")) {
        message = "এই ফোন নম্বর দিয়ে ইতিমধ্যে একটি অ্যাকাউন্ট খোলা আছে।";
      } else if (targetFields.includes("idempotencyKey")) {
        message = "এই অর্ডার রিকোয়েস্টটি ইতিমধ্যে প্রসেস করা হয়েছে।";
        errorCode = "DUPLICATE_ORDER_REQUEST";
      } else {
        message = `Duplicate value entered for unique field: ${targetFields}`;
      }
    } else if (err.code === "P2025") {
      statusCode = 404;
      errorCode = "RECORD_NOT_FOUND";
      message = "Requested database record was not found.";
    } else if (err.code === "P2003") {
      statusCode = 400;
      errorCode = "FOREIGN_KEY_CONSTRAINT";
      message = "Invalid reference ID provided for related resource.";
    }
  }

  // ৩. Prisma Database Validation / Initialization Error
  else if (err instanceof Prisma.PrismaClientValidationError) {
    statusCode = 400;
    errorCode = "DATABASE_QUERY_VALIDATION_ERROR";
    message = "Invalid data format sent to database query.";
  }

  // ৪. JWT Authentication Error হ্যান্ডলিং
  else if (err.name === "JsonWebTokenError") {
    statusCode = 401;
    errorCode = "INVALID_TOKEN";
    message = "Invalid authentication token. Please login again.";
  } else if (err.name === "TokenExpiredError") {
    statusCode = 401;
    errorCode = "TOKEN_EXPIRED";
    message = "Your session has expired. Please login again.";
  }

  // ৫. JSON Body Syntax Error হ্যান্ডলিং
  else if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    statusCode = 400;
    errorCode = "INVALID_JSON_PAYLOAD";
    message = "Malformed JSON in request body.";
  }

  // সার্ভার লগে এরর রেকর্ড করা
  if (statusCode >= 500) {
    logger.error(
      `${req.method} ${req.originalUrl} - ${statusCode} - ${message}`,
      err,
      "GLOBAL_ERROR"
    );
  } else {
    logger.warn(
      `${req.method} ${req.originalUrl} - ${statusCode} - ${message}`,
      { errorCode, errors },
      "CLIENT_ERROR"
    );
  }

  // Production-এ ইন্টারনাল ৫০০ এরর হলে ডাটাবেস বা কোডের গোপন তথ্য লুকিয়ে রাখা
  if (env.IS_PRODUCTION && statusCode === 500 && !(err instanceof ApiError)) {
    message = "An unexpected server error occurred. Please try again later.";
  }

  return sendError(res, {
    statusCode,
    message,
    errorCode,
    errors: env.IS_PRODUCTION && statusCode === 500 ? null : errors,
  });
}
