import { z } from "zod";
import {
  PAYMENT_METHOD_VALUES,
  PAYMENT_STATUS_VALUES,
} from "./order.validator.js";

/**
 * বাংলাদেশি ১১ ডিজিটের মোবাইল নম্বর ভ্যালিডেশন স্কিমা (বিকাশ/নগদ/রকেট সেন্ডার নম্বর)
 */
const bdSenderPhoneSchema = z
  .string({
    required_error: "যে নম্বর থেকে টাকা পাঠিয়েছেন (Sender Number) তা অবশ্যই দিতে হবে।",
  })
  .trim()
  .transform((val) => val.replace(/[\s-]/g, ""))
  .refine((val) => /^(?:\+?88)?01[3-9]\d{8}$/.test(val), {
    message:
      "সঠিক ১১ ডিজিটের বিকাশ/নগদ/রকেট নম্বর দিন (যেমন: 017XXXXXXXX)।",
  })
  .transform((val) => val.replace(/^\+?88/, ""));

/**
 * বিকাশ/নগদ/রকেট Transaction ID (TrxID) ভ্যালিডেশন স্কিমা
 */
const trxIdSchema = z
  .string({
    required_error: "পেমেন্টের Transaction ID (TrxID) অবশ্যই দিতে হবে।",
  })
  .trim()
  .toUpperCase()
  .min(4, "সঠিক Transaction ID (TrxID) দিন (কমপক্ষে ৪ অক্ষর)।")
  .max(40, "Transaction ID বেশি বড় হয়ে গেছে।")
  .regex(
    /^[A-Z0-9_-]+$/,
    "Transaction ID (TrxID)-তে শুধুমাত্র ইংরেজি অক্ষর ও সংখ্যা ব্যবহার করুন।"
  );

/**
 * ১. POST /api/payments/submit অথবা POST /api/payments/:orderNumber/submit
 * কাস্টমারের পেমেন্ট তথ্য (Sender Number ও TrxID) জমা দেওয়ার ভ্যালিডেশন স্কিমা।
 * এটি transactionReference এবং trxId—উভয় ফিল্ড নামই সমর্থন করে।
 */
export const submitPaymentSchema = z
  .object({
    orderNumber: z.string().trim().min(5).max(64).optional(),
    orderId: z.string().trim().min(5).max(64).optional(),
    paymentMethod: z
      .string()
      .trim()
      .toUpperCase()
      .refine((val) => PAYMENT_METHOD_VALUES.includes(val), {
        message: `সঠিক পেমেন্ট মেথড নির্বাচন করুন (${PAYMENT_METHOD_VALUES.join(", ")})।`,
      })
      .optional(),
    senderNumber: bdSenderPhoneSchema,
    transactionReference: trxIdSchema.optional(),
    trxId: trxIdSchema.optional(),
  })
  .superRefine((data, ctx) => {
    const resolvedTrx = data.transactionReference || data.trxId;
    if (!resolvedTrx) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["transactionReference"],
        message: "পেমেন্টের Transaction ID (TrxID) অবশ্যই দিতে হবে।",
      });
    }
  })
  .transform((data) => ({
    orderIdentifier: data.orderNumber || data.orderId || null,
    paymentMethod: data.paymentMethod || null,
    senderNumber: data.senderNumber,
    transactionReference: data.transactionReference || data.trxId,
  }));

/**
 * ২. PATCH /api/payments/:orderNumber/verify (Admin Only)
 * অ্যাডমিনের মাধ্যমে পেমেন্ট VERIFIED বা REJECTED করার ভ্যালিডেশন স্কিমা।
 * পেমেন্ট REJECTED করলে কেন বাতিল করা হয়েছে (rejectionReason) তা উল্লেখ করা বাধ্যতামূলক।
 */
export const verifyPaymentSchema = z
  .object({
    status: z
      .string({
        required_error: "পেমেন্ট ভেরিফিকেশন স্ট্যাটাস (VERIFIED বা REJECTED) দিতে হবে।",
      })
      .trim()
      .toUpperCase()
      .refine((val) => ["VERIFIED", "REJECTED", "REFUNDED"].includes(val), {
        message: "স্ট্যাটাস অবশ্যই VERIFIED, REJECTED অথবা REFUNDED হতে হবে।",
      }),
    rejectionReason: z.string().trim().max(300).optional(),
    adminNote: z.string().trim().max(500).optional(),
    autoDeliver: z.boolean().default(true),
  })
  .superRefine((data, ctx) => {
    if (
      data.status === "REJECTED" &&
      (!data.rejectionReason || data.rejectionReason.length < 3)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rejectionReason"],
        message:
          "পেমেন্ট রিজেক্ট (REJECTED) করার ক্ষেত্রে কারণ (rejectionReason) উল্লেখ করা বাধ্যতামূলক।",
      });
    }
  });

/**
 * ৩. URL Parameter (:orderNumber) ভ্যালিডেশন স্কিমা
 * Order Number (FFH-20261124-000001), Order UUID অথবা Payment UUID সমর্থন করবে
 */
export const paymentOrderParamSchema = z.object({
  orderNumber: z
    .string({ required_error: "Order Number বা Payment ID অবশ্যই দিতে হবে।" })
    .trim()
    .min(5, "সঠিক Order Number বা Payment ID দিন।")
    .max(64),
});

/**
 * ৪. GET /api/payments (Admin Only) পেমেন্ট তালিকা ফিল্টার ও পেজিনেশন স্কিমা
 */
export const listPaymentsQuerySchema = z.object({
  status: z
    .string()
    .trim()
    .toUpperCase()
    .refine((val) => PAYMENT_STATUS_VALUES.includes(val), {
      message: "Invalid payment status filter",
    })
    .optional(),
  paymentMethod: z
    .string()
    .trim()
    .toUpperCase()
    .refine((val) => PAYMENT_METHOD_VALUES.includes(val), {
      message: "Invalid payment method filter",
    })
    .optional(),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
