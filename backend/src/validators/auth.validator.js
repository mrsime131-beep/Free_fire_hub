import { z } from "zod";
import { GAME_SERVER_VALUES } from "./player.validator.js";

/**
 * বাংলাদেশি মোবাইল নম্বর ফরম্যাট ভ্যালিডেশন (ঐচ্ছিক ফিল্ডের জন্য)
 */
const bdPhoneOptionalSchema = z
  .string()
  .trim()
  .transform((val) => val.replace(/[\s-]/g, ""))
  .refine((val) => !val || /^(?:\+?88)?01[3-9]\d{8}$/.test(val), {
    message:
      "সঠিক ১১ ডিজিটের বাংলাদেশি মোবাইল নম্বর দিন (যেমন: 017XXXXXXXX)।",
  })
  .transform((val) => (val ? val.replace(/^\+?88/, "") : null))
  .nullable()
  .optional();

/**
 * ১. POST /api/auth/register — নতুন ইউজার রেজিস্ট্রেশন ভ্যালিডেশন স্কিমা
 */
export const registerSchema = z.object({
  name: z
    .string({ required_error: "আপনার নাম অবশ্যই দিতে হবে।" })
    .trim()
    .min(2, "নাম কমপক্ষে ২ অক্ষরের হতে হবে।")
    .max(80, "নাম ৮০ অক্ষরের বেশি হতে পারবে না।"),
  email: z
    .string({ required_error: "ইমেইল অ্যাড্রেস অবশ্যই দিতে হবে।" })
    .trim()
    .toLowerCase()
    .email("সঠিক ইমেইল অ্যাড্রেস দিন (যেমন: example@gmail.com)।"),
  phone: bdPhoneOptionalSchema,
  password: z
    .string({ required_error: "পাসওয়ার্ড অবশ্যই দিতে হবে।" })
    .min(6, "পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।")
    .max(72, "পাসওয়ার্ড ৭২ অক্ষরের বেশি হতে পারবে না।"),
  referralCode: z
    .string()
    .trim()
    .toUpperCase()
    .max(30)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  savedUid: z
    .string()
    .trim()
    .regex(
      /^\d{8,12}$/,
      "সঠিক Free Fire Player UID দিন (৮ থেকে ১২ ডিজিট সংখ্যা)।"
    )
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

/**
 * ২. POST /api/auth/login — ইউজার ও অ্যাডমিন লগইন ভ্যালিডেশন স্কিমা
 */
export const loginSchema = z.object({
  email: z
    .string({ required_error: "লগইন করার জন্য ইমেইল অ্যাড্রেস দিন।" })
    .trim()
    .toLowerCase()
    .email("সঠিক ইমেইল অ্যাড্রেস দিন।"),
  password: z
    .string({ required_error: "পাসওয়ার্ড অবশ্যই দিতে হবে।" })
    .min(1, "পাসওয়ার্ড খালি রাখা যাবে না।"),
});

/**
 * ৩. PATCH /api/auth/profile — ইউজার প্রোফাইল ও ডিফল্ট গেম UID আপডেট স্কিমা
 */
export const updateProfileSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "নাম কমপক্ষে ২ অক্ষরের হতে হবে।")
      .max(80)
      .optional(),
    phone: bdPhoneOptionalSchema,
    savedUid: z
      .string()
      .trim()
      .regex(
        /^\d{8,12}$/,
        "সঠিক Free Fire Player UID দিন (৮ থেকে ১২ ডিজিট সংখ্যা)।"
      )
      .nullable()
      .optional()
      .or(z.literal("").transform(() => null)),
    savedPlayerName: z
      .string()
      .trim()
      .max(60)
      .nullable()
      .optional(),
    savedServer: z
      .string()
      .trim()
      .toUpperCase()
      .refine((val) => GAME_SERVER_VALUES.includes(val), {
        message: `সঠিক Game Server নির্বাচন করুন (${GAME_SERVER_VALUES.join(", ")})।`,
      })
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "প্রোফাইল আপডেট করার জন্য কমপক্ষে একটি তথ্য প্রদান করুন।",
  });

/**
 * ৪. PATCH /api/auth/change-password — পাসওয়ার্ড পরিবর্তনের ভ্যালিডেশন স্কিমা
 */
export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string({ required_error: "বর্তমান পাসওয়ার্ড অবশ্যই দিতে হবে।" })
      .min(1, "বর্তমান পাসওয়ার্ড খালি রাখা যাবে না।"),
    newPassword: z
      .string({ required_error: "নতুন পাসওয়ার্ড অবশ্যই দিতে হবে।" })
      .min(6, "নতুন পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।")
      .max(72, "নতুন পাসওয়ার্ড ৭২ অক্ষরের বেশি হতে পারবে না।"),
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: "নতুন পাসওয়ার্ড বর্তমান পাসওয়ার্ডের চেয়ে আলাদা হতে হবে।",
    path: ["newPassword"],
  });
