import { env } from "../config/env.js";

const SENSITIVE_KEYS = [
  "password",
  "passwordhash",
  "token",
  "accesstoken",
  "jwt",
  "secret",
  "apikey",
  "authorization",
  "pin",
  "otp",
];

/**
 * লগের ভেতরে থাকা যেকোনো গোপন তথ্য (Password, Token, API Key, PIN, OTP) স্বয়ংক্রিয়ভাবে মাস্ক (Mask) করার ফাংশন
 */
function sanitizeMetadata(meta) {
  if (!meta || typeof meta !== "object") {
    return meta;
  }

  if (Array.isArray(meta)) {
    return meta.map((item) => sanitizeMetadata(item));
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(meta)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = SENSITIVE_KEYS.some((sensitive) =>
      lowerKey.includes(sensitive)
    );

    if (isSensitive) {
      sanitized[key] = "***[REDACTED]***";
    } else if (value && typeof value === "object") {
      sanitized[key] = sanitizeMetadata(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * স্ট্যান্ডার্ড টাইমস্ট্যাম্প ও কনটেক্সটসহ লগ মেসেজ ফরম্যাটার
 */
function formatLog(level, context, message, meta = null) {
  const timestamp = new Date().toISOString();
  const baseLog = `[${timestamp}] [${level}] [${context}] ${message}`;

  if (!meta) {
    return baseLog;
  }

  const safeMeta = sanitizeMetadata(meta);
  try {
    return `${baseLog} | ${JSON.stringify(safeMeta)}`;
  } catch {
    return baseLog;
  }
}

export const logger = {
  info(message, meta = null, context = "APP") {
    console.log(formatLog("INFO", context, message, meta));
  },

  warn(message, meta = null, context = "WARN") {
    console.warn(formatLog("WARN", context, message, meta));
  },

  error(message, errorOrMeta = null, context = "ERROR") {
    let meta = errorOrMeta;
    if (errorOrMeta instanceof Error) {
      meta = {
        name: errorOrMeta.name,
        message: errorOrMeta.message,
        ...(env.IS_PRODUCTION ? {} : { stack: errorOrMeta.stack }),
      };
    }
    console.error(formatLog("ERROR", context, message, meta));
  },

  debug(message, meta = null, context = "DEBUG") {
    if (!env.IS_PRODUCTION) {
      console.debug(formatLog("DEBUG", context, message, meta));
    }
  },

  payment(message, meta = null) {
    console.log(formatLog("INFO", "PAYMENT", message, meta));
  },

  delivery(message, meta = null) {
    console.log(formatLog("INFO", "DELIVERY_ENGINE", message, meta));
  },
};
