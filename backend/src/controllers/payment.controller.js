import {
  submitOrderPayment,
  verifyOrderPaymentByAdmin,
  getPaymentByOrderIdentifier,
  getAllPaymentsForAdmin,
} from "../services/payment.service.js";
import { sendSuccess, asyncHandler } from "../utils/apiResponse.js";

/**
 * ১. POST /api/payments/submit অথবা POST /api/payments/:orderNumber/submit
 * কাস্টমারের বিকাশ/নগদ/রকেট পেমেন্ট তথ্য (Sender Number ও Transaction ID) জমা দেওয়ার কন্ট্রোলার।
 * গেস্ট এবং লগইন করা কাস্টমার—উভয়েই পেমেন্ট সাবমিট করতে পারবে।
 */
export const submitPayment = asyncHandler(async (req, res) => {
  const orderIdentifier =
    req.params.orderNumber || req.body.orderIdentifier || null;

  const updatedOrder = await submitOrderPayment(
    orderIdentifier,
    req.body,
    req
  );

  return sendSuccess(res, {
    statusCode: 200,
    message: `আপনার পেমেন্ট তথ্য (TrxID: ${updatedOrder.payment?.transactionReference}) সফলভাবে জমা হয়েছে। অ্যাডমিন ভেরিফাই করার সাথে সাথেই আপনার গেমে ডায়মন্ড ডেলিভারি হয়ে যাবে।`,
    data: updatedOrder,
  });
});

/**
 * ২. PATCH /api/payments/:orderNumber/verify (Admin Only)
 * অ্যাডমিনের মাধ্যমে পেমেন্ট VERIFIED, REJECTED অথবা REFUNDED করার কন্ট্রোলার।
 * পেমেন্ট VERIFIED হলে স্বয়ংক্রিয়ভাবে ডায়মন্ড ডেলিভারি ইঞ্জিন ট্রিগার হয়ে অর্ডার COMPLETED হবে।
 */
export const verifyPayment = asyncHandler(async (req, res) => {
  const { orderNumber } = req.params;
  const resultOrder = await verifyOrderPaymentByAdmin(
    orderNumber,
    req.body,
    req
  );

  let message = `Order ${resultOrder.orderNumber} payment status updated to ${resultOrder.paymentStatus}.`;

  if (resultOrder.paymentStatus === "VERIFIED") {
    if (resultOrder.orderStatus === "COMPLETED") {
      message = `পেমেন্ট সফলভাবে VERIFIED হয়েছে এবং প্লেয়ার UID (${resultOrder.playerUid})-তে অটোমেটিক ডায়মন্ড ডেলিভারি সম্পন্ন হয়েছে!`;
    } else if (resultOrder.orderStatus === "FAILED") {
      message = `পেমেন্ট VERIFIED হয়েছে, কিন্তু অটোমেটিক ডেলিভারি ব্যর্থ হয়েছে। ডেলিভারি প্যানেল থেকে Retry করুন।`;
    } else {
      message = `পেমেন্ট সফলভাবে VERIFIED করা হয়েছে।`;
    }
  } else if (resultOrder.paymentStatus === "REJECTED") {
    message = `অর্ডার ${resultOrder.orderNumber}-এর পেমেন্ট REJECTED করা হয়েছে।`;
  } else if (resultOrder.paymentStatus === "REFUNDED") {
    message = `অর্ডার ${resultOrder.orderNumber}-এর পেমেন্ট REFUNDED হিসেবে মার্ক করা হয়েছে।`;
  }

  return sendSuccess(res, {
    statusCode: 200,
    message,
    data: resultOrder,
  });
});

/**
 * ৩. GET /api/payments/:orderNumber
 * নির্দিষ্ট অর্ডার নম্বর বা পেমেন্ট আইডি দিয়ে পেমেন্টের বর্তমান স্ট্যাটাস ও বিস্তারিত তথ্য চেক করা।
 */
export const getPaymentDetails = asyncHandler(async (req, res) => {
  const { orderNumber } = req.params;
  const paymentData = await getPaymentByOrderIdentifier(orderNumber, req.user);

  return sendSuccess(res, {
    statusCode: 200,
    message: "Payment details retrieved successfully",
    data: paymentData,
  });
});

/**
 * ৪. GET /api/payments (Admin Only)
 * অ্যাডমিন প্যানেলের জন্য সকল পেমেন্টের তালিকা, মেথড/স্ট্যাটাস ফিল্টারিং এবং TrxID সার্চ।
 */
export const getAllPayments = asyncHandler(async (req, res) => {
  const query = req.validatedQuery || req.query;
  const result = await getAllPaymentsForAdmin(query);

  return sendSuccess(res, {
    statusCode: 200,
    message: "All payment records retrieved successfully",
    data: result.payments,
    meta: result.meta,
  });
});
