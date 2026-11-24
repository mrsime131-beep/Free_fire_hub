import { z } from "zod";
import { playerUidSchema, gameServerSchema } from "./player.validator.js";

export const ORDER_STATUS_VALUES = [
  "PENDING",
  "PAYMENT_REVIEW",
  "PAID",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "REFUNDED",
];

export const PAYMENT_METHOD_VALUES = ["BKASH", "NAGAD", "ROCKET", "MANUAL"];

export const PAYMENT_STATUS_VALUES = [
  "UNPAID",
  "UNDER_REVIEW",
  "VERIFIED",
  "REJECTED",
  "REFUNDED",
];

/**
 * বাংলাদেশি মোবাইল নম্বর ফরম্যাট ভ্যালিডেশন (013xxxxxxxx - 019xxxxxxxx)
 */
const bdPhoneOptionalSchema = z
  .string()
  .trim()
  .transform((val) => val.replace(/[\s-]/g, ""))
  .refine((val) => !val || /^(?:\+?88)?01[3-9]\d{8}$/.test(val), {
    message: "সঠিক ১১ ডিজিটের বাংলাদেশি মোবাইল নম্বর দিন (যেমন: 017XXXXXXXX)।",
  })
  .transform((val) => (val ? val.replace(/^\+?88/, "") : undefined))
  .optional();

/**
 * অর্ডারের প্রতিটি প্রোডাক্ট আইটেমের ভ্যালিডেশন স্কিমা
 */
const orderItemInputSchema = z.object({
  productId: z
    .string({ required_error: "Product ID বা SKU অবশ্যই দিতে হবে।" })
    .trim()
    .min(1, "Product ID খালি রাখা যাবে না।"),
  quantity: z.coerce
    .number()
    .int()
    .min(1, "প্রোডাক্টের পরিমাণ কমপক্ষে ১ হতে হবে।")
    .max(20, "একবারে একটি প্যাকেজ সর্বোচ্চ ২০টির বেশি অর্ডার করা যাবে না।")
    .default(1),
});

/**
 * ১. POST /api/orders — নতুন অর্ডার তৈরির ভ্যালিডেশন স্কিমা
 * এটি সিঙ্গেল প্রোডাক্ট (productId / packageId) এবং মাল্টিপল আইটেম (items array)—উভয় ফরম্যাটই সমর্থন করে,
 * যাতে বর্তমান Next.js Frontend এবং REST API উভয় জায়গা থেকেই নির্বিঘ্নে কাজ করে।
 */
export const createOrderSchema = z
  .object({
    playerUid: playerUidSchema.optional(),
    uid: playerUidSchema.optional(),
    server: gameServerSchema.optional().default("BD"),

    // সিঙ্গেল প্রোডাক্ট সিলেকশন বা মাল্টি-আইটেম কার্ট
    productId: z.string().trim().min(1).optional(),
    packageId: z.string().trim().min(1).optional(),
    quantity: z.coerce.number().int().min(1).max(20).default(1),
    items: z.array(orderItemInputSchema).min(1).max(10).optional(),

    // পেমেন্ট মেথড (ছোট হাতের 'bkash' আসলেও স্বয়ংক্রিয়ভাবে 'BKASH' করে নেবে)
    paymentMethod: z
      .string({ required_error: "অনুগ্রহ করে একটি পেমেন্ট মেথড নির্বাচন করুন।" })
      .trim()
      .toUpperCase()
      .refine((val) => PAYMENT_METHOD_VALUES.includes(val), {
        message: `সঠিক পেমেন্ট মেথড নির্বাচন করুন (${PAYMENT_METHOD_VALUES.join(", ")})।`,
      }),

    // গেস্ট ইউজার ও কন্টাক্ট তথ্য
    guestPhone: bdPhoneOptionalSchema,
    guestEmail: z
      .string()
      .trim()
      .email("সঠিক ইমেইল অ্যাড্রেস দিন।")
      .optional()
      .or(z.literal("").transform(() => undefined)),

    // কুপন কোড ও নোট
    couponCode: z
      .string()
      .trim()
      .toUpperCase()
      .max(30)
      .optional()
      .or(z.literal("").transform(() => undefined)),
    customerNote: z.string().trim().max(300).optional(),
    idempotencyKey: z.string().trim().min(8).max(128).optional(),

    // যদি ফ্রন্টএন্ড চেকআউট ফর্ম থেকে অর্ডারের সাথেই পেমেন্টের senderNumber ও TrxID পাঠানো হয়
    senderNumber: bdPhoneOptionalSchema,
    transactionReference: z
      .string()
      .trim()
      .toUpperCase()
      .min(4, "সঠিক Transaction ID (TrxID) দিন।")
      .max(40, "Transaction ID বেশি বড় হয়ে গেছে।")
      .regex(
        /^[A-Z0-9_-]+$/,
        "Transaction ID-তে শুধুমাত্র ইংরেজি অক্ষর ও সংখ্যা ব্যবহার করুন।"
      )
      .optional()
      .or(z.literal("").transform(() => undefined)),
    trxId: z
      .string()
      .trim()
      .toUpperCase()
      .min(4, "সঠিক Transaction ID (TrxID) দিন।")
      .max(40)
      .regex(
        /^[A-Z0-9_-]+$/,
        "Transaction ID-তে শুধুমাত্র ইংরেজি অক্ষর ও সংখ্যা ব্যবহার করুন।"
      )
      .optional()
      .or(z.literal("").transform(() => undefined)),
  })
  .superRefine((data, ctx) => {
    const resolvedUid = data.playerUid || data.uid;
    if (!resolvedUid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["playerUid"],
        message: "Free Fire Player UID অবশ্যই দিতে হবে।",
      });
    }

    const hasItemsArray = Array.isArray(data.items) && data.items.length > 0;
    const hasSingleProduct = Boolean(data.productId || data.packageId);

    if (!hasItemsArray && !hasSingleProduct) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["productId"],
        message: "অনুগ্রহ করে কমপক্ষে একটি ডায়মন্ড প্যাকেজ নির্বাচন করুন।",
      });
    }
  })
  .transform((data) => {
    const normalizedItems =
      Array.isArray(data.items) && data.items.length > 0
        ? data.items
        : [
            {
              productId: data.productId || data.packageId,
              quantity: data.quantity || 1,
            },
          ];

    return {
      playerUid: data.playerUid || data.uid,
      server: data.server || "BD",
      items: normalizedItems,
      paymentMethod: data.paymentMethod,
      guestPhone: data.guestPhone || data.senderNumber || null,
      guestEmail: data.guestEmail || null,
      couponCode: data.couponCode || null,
      customerNote: data.customerNote || null,
      idempotencyKey: data.idempotencyKey || null,
      senderNumber: data.senderNumber || null,
      transactionReference: data.transactionReference || data.trxId || null,
    };
  });

/**
 * ২. URL Parameter (:orderNumber) ভ্যালিডেশন স্কিমা
 * উদাহরণ: FFH-20261124-000001 অথবা অর্ডারের UUID
 */
export const orderNumberParamSchema = z.object({
  orderNumber: z
    .string({ required_error: "Order ID অবশ্যই দিতে হবে।" })
    .trim()
    .min(5, "সঠিক Order ID দিন।")
    .max(64, "Order ID ফরম্যাট সঠিক নয়।"),
});

/**
 * ৩. GET /api/orders বা /api/orders/my-orders কুয়েরি ফিল্টার ভ্যালিডেশন স্কিমা
 */
export const listOrdersQuerySchema = z.object({
  status: z
    .string()
    .trim()
    .toUpperCase()
    .refine((val) => ORDER_STATUS_VALUES.includes(val), {
      message: "Invalid order status filter",
    })
    .optional(),
  paymentStatus: z
    .string()
    .trim()
    .toUpperCase()
    .refine((val) => PAYMENT_STATUS_VALUES.includes(val), {
      message: "Invalid payment status filter",
    })
    .optional(),
  playerUid: z.string().trim().optional(),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * ৪. PATCH /api/orders/:orderNumber/status (Admin Only) স্ট্যাটাস আপডেট স্কিমা
 */
export const updateOrderStatusSchema = z.object({
  orderStatus: z
    .string({ required_error: "নতুন Order Status অবশ্যই দিতে হবে।" })
    .trim()
    .toUpperCase()
    .refine((val) => ORDER_STATUS_VALUES.includes(val), {
      message: `Order Status অবশ্যই এদের একটি হতে হবে: ${ORDER_STATUS_VALUES.join(", ")}`,
    }),
  adminNote: z.string().trim().max(500).optional(),
});
