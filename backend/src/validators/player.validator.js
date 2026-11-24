import { z } from "zod";

export const GAME_SERVER_VALUES = ["BD", "INDIA", "SINGAPORE", "OTHER"];

/**
 * Free Fire Player UID Format Validation Schema
 * রুল: শুধুমাত্র ইংরেজি সংখ্যা (0-9) হতে হবে এবং দৈর্ঘ্য ৮ থেকে ১২ ডিজিটের মধ্যে হতে হবে।
 */
export const playerUidSchema = z
  .union([z.string(), z.number()], {
    required_error: "Free Fire Player UID অবশ্যই দিতে হবে।",
    invalid_type_error: "Player UID অবশ্যই সঠিক সংখ্যা হতে হবে।",
  })
  .transform((val) => String(val).trim())
  .refine((val) => val.length > 0, {
    message: "Free Fire Player UID খালি রাখা যাবে না।",
  })
  .refine((val) => /^\d+$/.test(val), {
    message:
      "ভুল UID ফরম্যাট! Player UID-তে শুধুমাত্র ইংরেজি সংখ্যা (0-9) ব্যবহার করুন।",
  })
  .refine((val) => val.length >= 8 && val.length <= 12, {
    message:
      "সঠিক Free Fire Player UID দিন (UID অবশ্যই ৮ থেকে ১২ ডিজিটের হতে হবে)।",
  });

/**
 * Game Server Selection Validation Schema
 * ডিফল্ট সার্ভার: BD (Bangladesh)
 */
export const gameServerSchema = z
  .string()
  .trim()
  .toUpperCase()
  .default("BD")
  .refine((val) => GAME_SERVER_VALUES.includes(val), {
    message: `সঠিক Game Server নির্বাচন করুন (${GAME_SERVER_VALUES.join(", ")})।`,
  });

/**
 * ১. GET /api/player/lookup?uid=8674177274&server=BD কুয়েরি ভ্যালিডেশন স্কিমা
 */
export const playerLookupQuerySchema = z.object({
  uid: playerUidSchema,
  server: gameServerSchema.optional().default("BD"),
});

/**
 * ২. GET /api/player/:uid প্যারামিটার ভ্যালিডেশন স্কিমা
 */
export const playerLookupParamSchema = z.object({
  uid: playerUidSchema,
});

/**
 * ৩. POST /api/player/verify অথবা POST /api/player/lookup বডি ভ্যালিডেশন স্কিমা
 */
export const playerLookupBodySchema = z.object({
  uid: playerUidSchema,
  server: gameServerSchema.optional().default("BD"),
});
