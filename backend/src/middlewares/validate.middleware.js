const VALID_PAYMENT_METHODS = ['BKASH', 'NAGAD', 'ROCKET', 'MANUAL'];

const VALID_ORDER_STATUSES = [
  'PENDING',
  'PAYMENT_REVIEW',
  'PAYMENT_VERIFIED',
  'PROCESSING',
  'DELIVERY_PENDING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'REFUND_PENDING',
  'REFUNDED',
];

const VALID_PAYMENT_STATUSES = [
  'UNPAID',
  'SUBMITTED',
  'VERIFYING',
  'VERIFIED',
  'REJECTED',
  'REFUNDED',
];

const VALID_DELIVERY_STATUSES = [
  'NOT_STARTED',
  'QUEUED',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'RETRY_PENDING',
];

/**
 * ক্ষতিকর HTML/Script ট্যাগ পরিষ্কার করার স্যানিটাইজার হেল্পার
 */
const sanitizeString = (value) => {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[<>]/g, '')
    .trim();
};

/**
 * সংবেদনশীল তথ্য (PIN, OTP, Password) পাঠানো হলে সাথে সাথে ব্লক করার সিকিউরিটি চেক
 */
const containsForbiddenPaymentSecrets = (body) => {
  if (!body || typeof body !== 'object') return false;
  const forbiddenKeys = ['pin', 'otp', 'mpin', 'password', 'secretPin', 'bkashPin', 'nagadPin'];
  const bodyKeys = Object.keys(body).map((k) => k.toLowerCase());
  return forbiddenKeys.some((forbidden) => bodyKeys.includes(forbidden.toLowerCase()));
};

/**
 * ১. স্মার্ট অর্ডার তৈরির ইনপুট ভ্যালিডেশন (POST /api/orders)
 */
const validateOrderCreation = (req, res, next) => {
  try {
    const body = req.body || {};

    // নিরাপত্তা যাচাই: কখনোই PIN বা OTP গ্রহণ করা যাবে না
    if (containsForbiddenPaymentSecrets(body)) {
      return res.status(400).json({
        success: false,
        error: 'FORBIDDEN_SENSITIVE_DATA',
        message: 'নিরাপত্তা নীতিমালা অনুযায়ী কখনোই আপনার বিকাশ/নগদ PIN, OTP বা Password প্রদান করবেন না।',
      });
    }

    const errors = [];

    // ফিল্ড নরমালাইজেশন (আগের ও নতুন ফ্রন্টএন্ডের সাথে সামঞ্জস্য বজায় রাখতে)
    const rawUid = body.playerUid || body.uid || body.playerId || '';
    const playerUid = sanitizeString(String(rawUid));

    const rawPlayerName = body.verifiedPlayerName || body.playerName || body.nickname || '';
    const verifiedPlayerName = sanitizeString(String(rawPlayerName));

    const rawProductId = body.productId || body.packageId || body.productSlug || body.sku || '';
    const productId = sanitizeString(String(rawProductId));

    const rawGameServer = body.gameServer || body.server || 'BD';
    const gameServer = sanitizeString(String(rawGameServer)).toUpperCase() || 'BD';

    const rawPaymentMethod = body.paymentMethod || body.method || 'BKASH';
    const paymentMethod = sanitizeString(String(rawPaymentMethod)).toUpperCase();

    const customerPhone = body.customerPhone || body.phone
      ? sanitizeString(String(body.customerPhone || body.phone))
      : null;

    const customerEmail = body.customerEmail || body.email
      ? sanitizeString(String(body.customerEmail || body.email)).toLowerCase()
      : null;

    const transactionReference =
      body.transactionReference || body.paymentReference || body.trxId
        ? sanitizeString(String(body.transactionReference || body.paymentReference || body.trxId)).toUpperCase()
        : null;

    const senderNumber = body.senderNumber || body.walletNumber
      ? sanitizeString(String(body.senderNumber || body.walletNumber))
      : null;

    // ১. Player UID যাচাই (৫ থেকে ১৫ সংখ্যার নিউমেরিক ইউআইডি)
    if (!playerUid) {
      errors.push('Player UID প্রদান করা আবশ্যক।');
    } else if (!/^\d{5,15}$/.test(playerUid)) {
      errors.push('অবৈধ Player UID! ফ্রি ফায়ার ইউআইডি শুধুমাত্র ৫ থেকে ১৫ সংখ্যার হতে হবে।');
    }

    // ২. Player Verification সম্পন্ন হয়েছে কিনা যাচাই
    if (!verifiedPlayerName || verifiedPlayerName.length < 1) {
      errors.push('অর্ডার করার পূর্বে Player UID ভেরিফিকেশন সম্পন্ন করা আবশ্যক।');
    } else if (verifiedPlayerName.length > 60) {
      errors.push('Verified Player Name অস্বাভাবিক বড়। অনুগ্রহ করে আবার UID যাচাই করুন।');
    }

    // ৩. Product ID যাচাই
    if (!productId) {
      errors.push('ডায়মন্ড প্যাকেজ (Product) সিলেক্ট করা আবশ্যক।');
    }

    // ৪. Payment Method যাচাই
    if (!VALID_PAYMENT_METHODS.includes(paymentMethod)) {
      errors.push(
        `অবৈধ পেমেন্ট মেথড! অনুমোদিত মেথডসমূহ: ${VALID_PAYMENT_METHODS.join(', ')}`
      );
    }

    // ৫. যদি ফ্রন্টএন্ড থেকে দাম পাঠানো হয়, তবে সেটি বৈধ সংখ্যা কিনা যাচাই (আসল দাম ডাটাবেস থেকে মিলিয়ে দেখা হবে)
    let clientSentPrice = null;
    if (body.price !== undefined || body.packagePrice !== undefined || body.finalPayableAmount !== undefined) {
      const rawPrice = body.finalPayableAmount ?? body.packagePrice ?? body.price;
      const parsedPrice = Number(rawPrice);
      if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
        errors.push('প্রেরিত প্রোডাক্টের মূল্য (Price) সঠিক সংখ্যা নয়।');
      } else {
        clientSentPrice = parsedPrice;
      }
    }

    // ৬. কাস্টমার ফোন নাম্বার যাচাই (যদি দেওয়া থাকে)
    if (customerPhone && !/^(\+?880|0)1[3-9]\d{8}$/.test(customerPhone)) {
      errors.push('সঠিক ১১ ডিজিটের বাংলাদেশি মোবাইল নাম্বার প্রদান করুন (যেমন: 01623759878)।');
    }

    // ৭. কাস্টমার ইমেইল যাচাই (যদি দেওয়া থাকে)
    if (customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
      errors.push('সঠিক ইমেইল অ্যাড্রেস প্রদান করুন।');
    }

    // ৮. যদি অর্ডারের সাথে সাথেই TrxID দেওয়া হয়, তবে তার ফরম্যাট যাচাই
    if (transactionReference && !/^[A-Z0-9_-]{4,35}$/.test(transactionReference)) {
      errors.push('অবৈধ Transaction ID (TrxID)! অনুগ্রহ করে সঠিক ট্রানজেকশন আইডি লিখুন।');
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'ORDER_VALIDATION_FAILED',
        message: errors[0],
        errors,
      });
    }

    // ভ্যালিডেটেড এবং পরিষ্কার ডেটা req.validatedOrder-এ সংরক্ষণ
    req.validatedOrder = {
      playerUid,
      verifiedPlayerName,
      gameServer,
      productId,
      paymentMethod,
      customerPhone,
      customerEmail,
      transactionReference,
      senderNumber,
      clientSentPrice,
      notes: body.notes ? sanitizeString(String(body.notes)).slice(0, 300) : null,
    };

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * ২. ম্যানুয়াল পেমেন্ট ও TrxID সাবমিশন ভ্যালিডেশন (POST /api/orders/:orderId/payment)
 */
const validatePaymentSubmission = (req, res, next) => {
  try {
    const body = req.body || {};

    if (containsForbiddenPaymentSecrets(body)) {
      return res.status(400).json({
        success: false,
        error: 'FORBIDDEN_SENSITIVE_DATA',
        message: 'কখনোই আপনার পেমেন্ট অ্যাকাউন্টের PIN, OTP বা Password প্রদান করবেন না।',
      });
    }

    const errors = [];

    const rawTrx =
      body.transactionReference || body.trxId || body.paymentReference || body.transactionId || '';
    const transactionReference = sanitizeString(String(rawTrx)).toUpperCase();

    const rawSender = body.senderNumber || body.walletNumber || body.phone || '';
    const senderNumber = sanitizeString(String(rawSender));

    const rawMethod = body.paymentMethod || body.method || '';
    const paymentMethod = rawMethod ? sanitizeString(String(rawMethod)).toUpperCase() : null;

    const rawAmount = body.paidAmount ?? body.amount;
    const paidAmount = rawAmount !== undefined && rawAmount !== '' ? Number(rawAmount) : null;

    if (!transactionReference) {
      errors.push('পেমেন্ট ভেরিফিকেশনের জন্য Transaction ID (TrxID) প্রদান করা আবশ্যক।');
    } else if (!/^[A-Z0-9_-]{4,35}$/.test(transactionReference)) {
      errors.push('Transaction ID (TrxID) অবশ্যই ৪ থেকে ৩৫ অক্ষরের (ইংরেজি অক্ষর ও সংখ্যা) হতে হবে।');
    }

    if (!senderNumber) {
      errors.push('যে নাম্বার থেকে টাকা পাঠিয়েছেন (Sender Number) সেটি প্রদান করুন।');
    } else if (!/^[0-9+*#-]{6,16}$/.test(senderNumber)) {
      errors.push('সঠিক বিকাশ/নগদ/রকেট সেন্ডার মোবাইল নাম্বার প্রদান করুন।');
    }

    if (paymentMethod && !VALID_PAYMENT_METHODS.includes(paymentMethod)) {
      errors.push(`অবৈধ পেমেন্ট মেথড! অনুমোদিত মেথড: ${VALID_PAYMENT_METHODS.join(', ')}`);
    }

    if (paidAmount !== null && (!Number.isFinite(paidAmount) || paidAmount <= 0)) {
      errors.push('প্রদত্ত টাকার পরিমাণ (Amount) সঠিক নয়।');
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'PAYMENT_VALIDATION_FAILED',
        message: errors[0],
        errors,
      });
    }

    req.validatedPayment = {
      transactionReference,
      senderNumber,
      paymentMethod,
      paidAmount,
      proofUrl: body.proofUrl ? sanitizeString(String(body.proofUrl)).slice(0, 500) : null,
    };

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * ৩. অ্যাডমিন পেমেন্ট ভেরিফিকেশন/রিজেকশন ভ্যালিডেশন (POST /api/admin/orders/:orderId/verify-payment)
 */
const validateAdminPaymentVerification = (req, res, next) => {
  const body = req.body || {};
  const rawDecision = body.decision || body.status || body.action || 'VERIFIED';
  const decision = sanitizeString(String(rawDecision)).toUpperCase();

  const isApproved = ['VERIFIED', 'APPROVE', 'APPROVED', 'CONFIRM'].includes(decision);
  const isRejected = ['REJECTED', 'REJECT', 'DECLINE', 'DECLINED'].includes(decision);

  if (!isApproved && !isRejected) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_VERIFICATION_DECISION',
      message: 'পেমেন্ট ডিসিশন অবশ্যই VERIFIED (Approve) অথবা REJECTED (Reject) হতে হবে।',
    });
  }

  const reason = body.reason || body.rejectionReason || body.reviewNotes
    ? sanitizeString(String(body.reason || body.rejectionReason || body.reviewNotes))
    : null;

  if (isRejected && (!reason || reason.length < 3)) {
    return res.status(400).json({
      success: false,
      error: 'REJECTION_REASON_REQUIRED',
      message: 'পেমেন্ট রিজেক্ট করার ক্ষেত্রে কারণ (Rejection Reason) উল্লেখ করা আবশ্যক।',
    });
  }

  req.validatedPaymentReview = {
    status: isApproved ? 'VERIFIED' : 'REJECTED',
    reason: reason || (isApproved ? 'Manually verified and approved by Admin' : null),
    autoTriggerDelivery: body.autoTriggerDelivery !== false, // ডিফল্টভাবে পেমেন্ট অ্যাপ্রুভ হলে ডেলিভারি ট্রিগার হবে
  };

  next();
};

/**
 * ৪. অ্যাডমিন অর্ডার স্ট্যাটাস আপডেট ভ্যালিডেশন (PATCH /api/admin/orders/:orderId/status)
 */
const validateAdminStatusUpdate = (req, res, next) => {
  const body = req.body || {};

  const orderStatus = body.orderStatus
    ? sanitizeString(String(body.orderStatus)).toUpperCase()
    : null;
  const paymentStatus = body.paymentStatus
    ? sanitizeString(String(body.paymentStatus)).toUpperCase()
    : null;
  const deliveryStatus = body.deliveryStatus
    ? sanitizeString(String(body.deliveryStatus)).toUpperCase()
    : null;
  const reason = body.reason
    ? sanitizeString(String(body.reason)).slice(0, 300)
    : 'Updated by Admin';

  if (!orderStatus && !paymentStatus && !deliveryStatus) {
    return res.status(400).json({
      success: false,
      error: 'EMPTY_STATUS_UPDATE',
      message: 'আপডেট করার জন্য অন্তত একটি স্ট্যাটাস (orderStatus, paymentStatus বা deliveryStatus) প্রদান করুন।',
    });
  }

  if (orderStatus && !VALID_ORDER_STATUSES.includes(orderStatus)) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_ORDER_STATUS',
      message: `অবৈধ Order Status! অনুমোদিত স্ট্যাটাস: ${VALID_ORDER_STATUSES.join(', ')}`,
    });
  }

  if (paymentStatus && !VALID_PAYMENT_STATUSES.includes(paymentStatus)) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_PAYMENT_STATUS',
      message: `অবৈধ Payment Status! অনুমোদিত স্ট্যাটাস: ${VALID_PAYMENT_STATUSES.join(', ')}`,
    });
  }

  if (deliveryStatus && !VALID_DELIVERY_STATUSES.includes(deliveryStatus)) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_DELIVERY_STATUS',
      message: `অবৈধ Delivery Status! অনুমোদিত স্ট্যাটাস: ${VALID_DELIVERY_STATUSES.join(', ')}`,
    });
  }

  req.validatedStatusUpdate = {
    orderStatus,
    paymentStatus,
    deliveryStatus,
    reason,
  };

  next();
};

/**
 * ৫. অর্ডার আইডি প্যারামিটার ভ্যালিডেশন (:orderId)
 */
const validateOrderIdParam = (req, res, next) => {
  const rawOrderId = req.params.orderId || req.body?.orderId || '';
  const orderId = sanitizeString(String(rawOrderId));

  if (!orderId || orderId.length < 5 || orderId.length > 64) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_ORDER_ID_FORMAT',
      message: 'অবৈধ অর্ডার আইডি! অনুগ্রহ করে সঠিক Order ID (যেমন: FFH-20261124-000001) প্রদান করুন।',
    });
  }

  req.orderIdentifier = orderId;
  next();
};

module.exports = {
  VALID_PAYMENT_METHODS,
  VALID_ORDER_STATUSES,
  VALID_PAYMENT_STATUSES,
  VALID_DELIVERY_STATUSES,
  sanitizeString,
  validateOrderCreation,
  validatePaymentSubmission,
  validateAdminPaymentVerification,
  validateAdminStatusUpdate,
  validateOrderIdParam,
};
