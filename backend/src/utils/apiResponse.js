/**
 * Custom Operational API Error Class
 * যেকোনো Service বা Controller থেকে নির্দিষ্ট HTTP Status Code সহ এরর থ্রো করার জন্য
 */
export class ApiError extends Error {
  constructor(
    statusCode = 500,
    message = "Internal Server Error",
    errors = null,
    errorCode = "INTERNAL_ERROR"
  ) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.errors = errors;
    this.errorCode = errorCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Standard Success JSON Response Helper
 */
export function sendSuccess(
  res,
  {
    statusCode = 200,
    message = "Request completed successfully",
    data = null,
    meta = null,
  } = {}
) {
  const payload = {
    success: true,
    message,
    data,
  };

  if (meta !== null && meta !== undefined) {
    payload.meta = meta;
  }

  return res.status(statusCode).json(payload);
}

/**
 * Standard Error JSON Response Helper
 */
export function sendError(
  res,
  {
    statusCode = 500,
    message = "Something went wrong",
    errorCode = "SERVER_ERROR",
    errors = null,
  } = {}
) {
  const payload = {
    success: false,
    message,
    errorCode,
  };

  if (errors !== null && errors !== undefined) {
    payload.errors = errors;
  }

  return res.status(statusCode).json(payload);
}

/**
 * Async Controller Wrapper
 * প্রতিটি Async Controller-এ আলাদা try-catch লেখার বদলে অটোমেটিক Global Error Middleware-এ এরর পাঠাবে
 */
export function asyncHandler(requestHandler) {
  return (req, res, next) => {
    Promise.resolve(requestHandler(req, res, next)).catch((err) => next(err));
  };
}
