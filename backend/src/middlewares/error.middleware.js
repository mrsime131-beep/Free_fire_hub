const env = require('../config/env');

/**
 * কাস্টম অপারেশনাল এরর ক্লাস (AppError)
 * অর্ডার, পেমেন্ট ও ডেলিভারি সার্ভিস থেকে নির্দিষ্ট স্ট্যাটাস কোড ও এরর কোডসহ এরর থ্রো করার জন্য ব্যবহৃত হবে।
 */
class AppError extends Error {
  constructor(message, statusCode = 400, errorCode = 'BAD_REQUEST', details = null) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Async Controller Wrapper (যাতে কন্ট্রোলারে কোনো আনহ্যান্ডেলড প্রমিজ রিজেকশন হলে সার্ভার ক্র্যাশ না করে)
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * ৪0৪ নট ফাউন্ড রাউট হ্যান্ডলার
 */
const notFoundHandler = (req, res, next) => {
  res.status(404).json({
    success: false,
    error: 'ROUTE_NOT_FOUND',
    message: `অনুরোধকৃত এপিআই রাউটটি (${req.method} ${req.originalUrl}) খুঁজে পাওয়া যায়নি।`,
  });
};

/**
 * গ্লোবাল নিরাপদ এরর হ্যান্ডলিং মিডলওয়্যার
 * ডাটাবেস, প্রিজমা, ভ্যালিডেশন ও সার্ভার এররগুলোকে নিরাপদভাবে প্রসেস করে এবং কোনো গোপন তথ্য প্রকাশ করে না।
 */
const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || err.status || 500;
  let errorCode = err.errorCode || err.code || 'INTERNAL_SERVER_ERROR';
  let message = err.message || 'সার্ভারে একটি অপ্রত্যাশিত ত্রুটি ঘটেছে। অনুগ্রহ করে আবার চেষ্টা করুন।';
  let details = err.details || null;

  // ১. Prisma Unique Constraint Violation (P2002) - ডুপ্লিকেট অর্ডার আইডি বা ডুপ্লিকেট TrxID প্রতিরোধ
  if (err.code === 'P2002') {
    statusCode = 409;
    const targetFields = Array.isArray(err.meta?.target)
      ? err.meta.target.join(', ')
      : String(err.meta?.target || '');

    if (targetFields.includes('transactionReference')) {
      errorCode = 'DUPLICATE_TRANSACTION_REFERENCE';
      message =
        'এই Transaction ID (TrxID) ইতিমধ্যে অন্য একটি পেমেন্টে ব্যবহার করা হয়েছে। অনুগ্রহ করে সঠিক TrxID প্রদান করুন।';
    } else if (targetFields.includes('orderNumber')) {
      errorCode = 'DUPLICATE_ORDER_NUMBER';
      message = 'অর্ডার আইডি জেনারেট করতে কনফ্লিক্ট হয়েছে। অনুগ্রহ করে পুনরায় চেষ্টা করুন।';
    } else if (targetFields.includes('idempotencyKey') || targetFields.includes('key')) {
      errorCode = 'DUPLICATE_REQUEST';
      message = 'এই রিকোয়েস্টটি ইতিমধ্যে প্রসেস করা হয়েছে।';
    } else if (targetFields.includes('email')) {
      errorCode = 'DUPLICATE_EMAIL';
      message = 'এই ইমেইল অ্যাড্রেস দিয়ে ইতিমধ্যে অ্যাকাউন্ট খোলা রয়েছে।';
    } else {
      errorCode = 'DUPLICATE_RECORD';
      message = 'প্রদত্ত তথ্যটি ইতিমধ্যে ডাটাবেসে বিদ্যমান রয়েছে।';
    }
  }

  // ২. Prisma Record Not Found (P2025)
  else if (err.code === 'P2025') {
    statusCode = 404;
    errorCode = 'RECORD_NOT_FOUND';
    message = 'অনুরোধকৃত অর্ডার বা প্রোডাক্টের তথ্য ডাটাবেসে খুঁজে পাওয়া যায়নি।';
  }

  // ৩. Prisma Foreign Key Constraint Failed (P2003)
  else if (err.code === 'P2003') {
    statusCode = 400;
    errorCode = 'INVALID_REFERENCE';
    message = 'প্রদত্ত প্রোডাক্ট বা রেফারেন্স আইডি সঠিক নয়।';
  }

  // ৪. ভুল JSON পেলোড (Body Parser Syntax Error)
  else if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    statusCode = 400;
    errorCode = 'INVALID_JSON_PAYLOAD';
    message = 'রিকোয়েস্ট বডিতে পাঠানো JSON ফরম্যাট সঠিক নয়।';
  }

  // ৫. JWT Authentication Errors
  else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    errorCode = 'INVALID_TOKEN';
    message = 'অবৈধ লগইন টোকেন। অনুগ্রহ করে পুনরায় লগইন করুন।';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    errorCode = 'TOKEN_EXPIRED';
    message = 'আপনার লগইন সেশনের মেয়াদ শেষ হয়েছে। অনুগ্রহ করে পুনরায় লগইন করুন।';
  }

  // সার্ভার কনসোলে বিস্তারিত এরর লগ রাখা (ডিবাগিংয়ের জন্য)
  if (statusCode >= 500) {
    console.error('🔥 [CRITICAL SERVER ERROR]:', {
      method: req.method,
      url: req.originalUrl,
      errorCode,
      message: err.message,
      stack: err.stack,
    });
  } else if (env.NODE_ENV === 'development') {
    console.warn(`⚠️ [${statusCode} ${errorCode}]: ${message}`);
  }

  // প্রোডাকশনে 500 এরর হলে অভ্যন্তরীণ ডাটাবেস বা সাপ্লায়ার সিক্রেট যেন কাস্টমারের কাছে প্রকাশ না পায়
  const isProduction = env.NODE_ENV === 'production';
  const safeMessage =
    isProduction && statusCode === 500 && !err.isOperational
      ? 'সার্ভারে সাময়িক কারিগরি ত্রুটি দেখা দিয়েছে। অনুগ্রহ করে কিছুক্ষণ পর আবার চেষ্টা করুন।'
      : message;

  const responsePayload = {
    success: false,
    error: String(errorCode),
    message: safeMessage,
  };

  if (details) {
    responsePayload.details = details;
  }

  if (!isProduction && err.stack) {
    responsePayload.stack = err.stack;
  }

  return res.status(statusCode).json(responsePayload);
};

module.exports = {
  AppError,
  asyncHandler,
  notFoundHandler,
  errorHandler,
};
