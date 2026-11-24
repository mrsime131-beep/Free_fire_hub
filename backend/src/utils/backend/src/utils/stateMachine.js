const { AppError } = require('../middlewares/error.middleware');

// ==========================================
// 1. STATUS CONSTANTS
// ==========================================

const ORDER_STATUS = Object.freeze({
  PENDING: 'PENDING',
  PAYMENT_REVIEW: 'PAYMENT_REVIEW',
  PAYMENT_VERIFIED: 'PAYMENT_VERIFIED',
  PROCESSING: 'PROCESSING',
  DELIVERY_PENDING: 'DELIVERY_PENDING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  REFUND_PENDING: 'REFUND_PENDING',
  REFUNDED: 'REFUNDED',
});

const PAYMENT_STATUS = Object.freeze({
  UNPAID: 'UNPAID',
  SUBMITTED: 'SUBMITTED',
  VERIFYING: 'VERIFYING',
  VERIFIED: 'VERIFIED',
  REJECTED: 'REJECTED',
  REFUNDED: 'REFUNDED',
});

const DELIVERY_STATUS = Object.freeze({
  NOT_STARTED: 'NOT_STARTED',
  QUEUED: 'QUEUED',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  RETRY_PENDING: 'RETRY_PENDING',
});

// ==========================================
// 2. ALLOWED STATE TRANSITION MAPS
// ==========================================

const ALLOWED_ORDER_TRANSITIONS = Object.freeze({
  PENDING: ['PAYMENT_REVIEW', 'PAYMENT_VERIFIED', 'CANCELLED', 'FAILED'],
  PAYMENT_REVIEW: ['PAYMENT_VERIFIED', 'PENDING', 'FAILED', 'CANCELLED'],
  PAYMENT_VERIFIED: [
    'PROCESSING',
    'DELIVERY_PENDING',
    'FAILED',
    'CANCELLED',
    'REFUND_PENDING',
  ],
  PROCESSING: ['DELIVERY_PENDING', 'COMPLETED', 'FAILED', 'REFUND_PENDING'],
  DELIVERY_PENDING: ['PROCESSING', 'COMPLETED', 'FAILED', 'REFUND_PENDING'],
  // FAILED অর্ডার কখনোই সরাসরি COMPLETED হতে পারবে না; রিট্রাই হয়ে PROCESSING এর মাধ্যমে যেতে হবে
  FAILED: [
    'PROCESSING',
    'DELIVERY_PENDING',
    'REFUND_PENDING',
    'REFUNDED',
    'CANCELLED',
  ],
  REFUND_PENDING: ['REFUNDED', 'FAILED'],
  COMPLETED: ['REFUND_PENDING'],
  CANCELLED: [],
  REFUNDED: [],
});

const ALLOWED_PAYMENT_TRANSITIONS = Object.freeze({
  UNPAID: ['SUBMITTED', 'VERIFYING'],
  SUBMITTED: ['VERIFYING', 'VERIFIED', 'REJECTED'],
  VERIFYING: ['VERIFIED', 'REJECTED'],
  // পেমেন্ট রিজেক্ট হলে কাস্টমার সঠিক TrxID দিয়ে আবার সাবমিট করতে পারবে (যদি অর্ডার CANCELLED না হয়)
  REJECTED: ['SUBMITTED', 'VERIFYING'],
  VERIFIED: ['REFUNDED'],
  REFUNDED: [],
});

const ALLOWED_DELIVERY_TRANSITIONS = Object.freeze({
  NOT_STARTED: ['QUEUED', 'PROCESSING'],
  QUEUED: ['PROCESSING', 'RETRY_PENDING', 'FAILED'],
  PROCESSING: ['COMPLETED', 'RETRY_PENDING', 'FAILED'],
  RETRY_PENDING: ['QUEUED', 'PROCESSING', 'FAILED'],
  // FAILED ডেলিভারি কখনোই সরাসরি COMPLETED হতে পারবে না; আগে QUEUED বা PROCESSING হতে হবে
  FAILED: ['RETRY_PENDING', 'QUEUED', 'PROCESSING'],
  // COMPLETED ডেলিভারি লকড থাকবে যাতে ডুপ্লিকেট ডায়মন্ড ডেলিভারি না যায়
  COMPLETED: [],
});

// ==========================================
// 3. TRANSITION CHECK HELPERS
// ==========================================

const canTransitionOrderStatus = (currentStatus, nextStatus, allowSame = true) => {
  if (!currentStatus || !nextStatus) return false;
  if (allowSame && currentStatus === nextStatus) return true;
  const allowed = ALLOWED_ORDER_TRANSITIONS[currentStatus] || [];
  return allowed.includes(nextStatus);
};

const canTransitionPaymentStatus = (currentStatus, nextStatus, allowSame = true) => {
  if (!currentStatus || !nextStatus) return false;
  if (allowSame && currentStatus === nextStatus) return true;
  const allowed = ALLOWED_PAYMENT_TRANSITIONS[currentStatus] || [];
  return allowed.includes(nextStatus);
};

const canTransitionDeliveryStatus = (currentStatus, nextStatus, allowSame = true) => {
  if (!currentStatus || !nextStatus) return false;
  if (allowSame && currentStatus === nextStatus) return true;
  const allowed = ALLOWED_DELIVERY_TRANSITIONS[currentStatus] || [];
  return allowed.includes(nextStatus);
};

// ==========================================
// 4. CROSS-STATE BUSINESS INTEGRITY RULES
// ==========================================

/**
 * অর্ডার, পেমেন্ট ও ডেলিভারি স্ট্যাটাসের মধ্যকার আন্তঃসম্পর্ক যাচাই করা।
 * কোনো ভুয়া পেমেন্ট বা ভুয়া ডেলিভারি সাকসেস স্ট্যাটাস সেট করা সম্পূর্ণ প্রতিরোধ করে।
 */
const validateCrossStateIntegrity = ({
  orderStatus,
  paymentStatus,
  deliveryStatus,
}) => {
  // নিয়ম ১: পেমেন্ট VERIFIED না হওয়া পর্যন্ত ডেলিভারি শুরু বা সম্পন্ন হতে পারবে না
  const activeDeliveryStates = ['QUEUED', 'PROCESSING', 'COMPLETED', 'RETRY_PENDING'];
  if (
    activeDeliveryStates.includes(deliveryStatus) &&
    paymentStatus !== PAYMENT_STATUS.VERIFIED &&
    paymentStatus !== PAYMENT_STATUS.REFUNDED
  ) {
    throw new AppError(
      `পেমেন্ট VERIFIED না হওয়া পর্যন্ত ডেলিভারি স্ট্যাটাস ${deliveryStatus} করা যাবে না (বর্তমান পেমেন্ট স্ট্যাটাস: ${paymentStatus})।`,
      400,
      'UNVERIFIED_PAYMENT_DELIVERY_BLOCKED'
    );
  }

  // নিয়ম ২: পেমেন্ট VERIFIED এবং ডেলিভারি COMPLETED না হলে অর্ডার কখনোই COMPLETED হতে পারবে না
  if (orderStatus === ORDER_STATUS.COMPLETED) {
    if (paymentStatus !== PAYMENT_STATUS.VERIFIED) {
      throw new AppError(
        'পেমেন্ট ভেরিফাইড (VERIFIED) না হওয়া পর্যন্ত অর্ডার COMPLETED করা যাবে না।',
        400,
        'FAKE_ORDER_COMPLETION_BLOCKED'
      );
    }

    if (deliveryStatus !== DELIVERY_STATUS.COMPLETED) {
      throw new AppError(
        'ডায়মন্ড ডেলিভারি সম্পন্ন (COMPLETED) না হওয়া পর্যন্ত অর্ডার COMPLETED করা যাবে না।',
        400,
        'INCOMPLETE_DELIVERY_COMPLETION_BLOCKED'
      );
    }
  }

  // নিয়ম ৩: ডেলিভারি ইতিমধ্যে COMPLETED হয়ে গেলে অর্ডার CANCELLED করা যাবে না
  if (
    orderStatus === ORDER_STATUS.CANCELLED &&
    deliveryStatus === DELIVERY_STATUS.COMPLETED
  ) {
    throw new AppError(
      'ডায়মন্ড ডেলিভারি ইতিমধ্যে সম্পন্ন হয়ে যাওয়ায় এই অর্ডারটি বাতিল (CANCELLED) করা সম্ভব নয়।',
      400,
      'CANCEL_COMPLETED_DELIVERY_BLOCKED'
    );
  }

  // নিয়ম ৪: অর্ডার REFUNDED করতে হলে পেমেন্ট স্ট্যাটাসও REFUNDED হতে হবে
  if (
    orderStatus === ORDER_STATUS.REFUNDED &&
    paymentStatus !== PAYMENT_STATUS.REFUNDED
  ) {
    throw new AppError(
      'অর্ডার REFUNDED হিসেবে চিহ্নিত করার আগে পেমেন্ট স্ট্যাটাস REFUNDED হতে হবে।',
      400,
      'REFUND_STATE_MISMATCH'
    );
  }

  return true;
};

// ==========================================
// 5. MASTER TRANSITION VALIDATOR & HISTORY BUILDER
// ==========================================

/**
 * বর্তমান স্ট্যাটাস থেকে নতুন স্ট্যাটাসে পরিবর্তন বৈধ কি না তা কঠোরভাবে যাচাই করে
 */
const assertValidStatusTransition = ({
  currentOrderStatus,
  currentPaymentStatus,
  currentDeliveryStatus,
  nextOrderStatus,
  nextPaymentStatus,
  nextDeliveryStatus,
}) => {
  const targetOrderStatus = nextOrderStatus || currentOrderStatus;
  const targetPaymentStatus = nextPaymentStatus || currentPaymentStatus;
  const targetDeliveryStatus = nextDeliveryStatus || currentDeliveryStatus;

  // ১. Order Status Transition Check
  if (
    nextOrderStatus &&
    !canTransitionOrderStatus(currentOrderStatus, nextOrderStatus)
  ) {
    throw new AppError(
      `অবৈধ অর্ডার স্ট্যাটাস পরিবর্তন: ${currentOrderStatus} থেকে সরাসরি ${nextOrderStatus}-এ পরিবর্তন করা অনুমোদিত নয়।`,
      400,
      'INVALID_ORDER_STATUS_TRANSITION'
    );
  }

  // ২. Payment Status Transition Check
  if (
    nextPaymentStatus &&
    !canTransitionPaymentStatus(currentPaymentStatus, nextPaymentStatus)
  ) {
    throw new AppError(
      `অবৈধ পেমেন্ট স্ট্যাটাস পরিবর্তন: ${currentPaymentStatus} থেকে সরাসরি ${nextPaymentStatus}-এ পরিবর্তন করা অনুমোদিত নয়।`,
      400,
      'INVALID_PAYMENT_STATUS_TRANSITION'
    );
  }

  // ৩. Delivery Status Transition Check
  if (
    nextDeliveryStatus &&
    !canTransitionDeliveryStatus(currentDeliveryStatus, nextDeliveryStatus)
  ) {
    throw new AppError(
      `অবৈধ ডেলিভারি স্ট্যাটাস পরিবর্তন: ${currentDeliveryStatus} থেকে সরাসরি ${nextDeliveryStatus}-এ পরিবর্তন করা অনুমোদিত নয়।`,
      400,
      'INVALID_DELIVERY_STATUS_TRANSITION'
    );
  }

  // ৪. Cross-State Integrity Validation
  validateCrossStateIntegrity({
    orderStatus: targetOrderStatus,
    paymentStatus: targetPaymentStatus,
    deliveryStatus: targetDeliveryStatus,
  });

  return {
    orderStatus: targetOrderStatus,
    paymentStatus: targetPaymentStatus,
    deliveryStatus: targetDeliveryStatus,
    hasChanged:
      targetOrderStatus !== currentOrderStatus ||
      targetPaymentStatus !== currentPaymentStatus ||
      targetDeliveryStatus !== currentDeliveryStatus,
  };
};

/**
 * ডাটাবেসের OrderStatusHistory টেবিলের জন্য পেলোড তৈরি করার হেল্পার
 */
const buildStatusHistoryPayload = ({
  orderId,
  previousOrderStatus,
  newOrderStatus,
  previousPaymentStatus,
  newPaymentStatus,
  previousDeliveryStatus,
  newDeliveryStatus,
  changedBy = 'SYSTEM',
  reason = null,
  metadata = null,
}) => {
  return {
    orderId,
    previousOrderStatus: previousOrderStatus || null,
    newOrderStatus,
    previousPaymentStatus: previousPaymentStatus || null,
    newPaymentStatus,
    previousDeliveryStatus: previousDeliveryStatus || null,
    newDeliveryStatus,
    changedBy,
    reason,
    metadata,
  };
};

module.exports = {
  ORDER_STATUS,
  PAYMENT_STATUS,
  DELIVERY_STATUS,
  ALLOWED_ORDER_TRANSITIONS,
  ALLOWED_PAYMENT_TRANSITIONS,
  ALLOWED_DELIVERY_TRANSITIONS,
  canTransitionOrderStatus,
  canTransitionPaymentStatus,
  canTransitionDeliveryStatus,
  validateCrossStateIntegrity,
  assertValidStatusTransition,
  buildStatusHistoryPayload,
};
