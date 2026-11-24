import { Router } from "express";
import {
  verifyAndLookupPlayer,
  saveDefaultPlayerUid,
} from "../controllers/player.controller.js";
import { optionalAuth, requireAuth } from "../middlewares/auth.middleware.js";
import { playerLookupLimiter } from "../middlewares/rateLimiter.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  playerLookupQuerySchema,
  playerLookupParamSchema,
  playerLookupBodySchema,
} from "../validators/player.validator.js";

const router = Router();

/**
 * @route   GET /api/player/lookup?uid=8674177274&server=BD
 * @desc    Query Parameter-এর মাধ্যমে Free Fire Player UID ও Server যাচাই করে আসল নাম (IGN) বের করে
 * @access  Public (Rate Limited: প্রতি মিনিটে সর্বোচ্চ ২০ বার)
 */
router.get(
  "/lookup",
  playerLookupLimiter,
  optionalAuth,
  validate({ query: playerLookupQuerySchema }),
  verifyAndLookupPlayer
);

/**
 * @route   GET /api/player?uid=8674177274&server=BD
 * @desc    রুট কুয়েরি প্যারামিটারের মাধ্যমেও যাতে সরাসরি UID চেক করা যায় (ফ্রন্টএন্ড ফ্লেক্সিবিলিটির জন্য)
 * @access  Public (Rate Limited)
 */
router.get(
  "/",
  playerLookupLimiter,
  optionalAuth,
  validate({ query: playerLookupQuerySchema }),
  verifyAndLookupPlayer
);

/**
 * @route   POST /api/player/verify
 * @desc    JSON Request Body ({ "uid": "8674177274", "server": "BD" }) পাঠিয়ে Player UID ভেরিফাই করা
 * @access  Public (Rate Limited)
 */
router.post(
  "/verify",
  playerLookupLimiter,
  optionalAuth,
  validate({ body: playerLookupBodySchema }),
  verifyAndLookupPlayer
);

/**
 * @route   POST /api/player/save-default
 * @desc    লগইন করা ইউজারের প্রোফাইলে ভেরিফায়েড গেম UID স্থায়ীভাবে সেভ করা
 * @access  Private (Logged-in Customer/Admin)
 */
router.post(
  "/save-default",
  playerLookupLimiter,
  requireAuth,
  validate({ body: playerLookupBodySchema }),
  saveDefaultPlayerUid
);

/**
 * @route   GET /api/player/:uid
 * @desc    URL Path Parameter (/api/player/8674177274) দিয়ে সরাসরি Player UID যাচাই করা
 * @access  Public (Rate Limited)
 */
router.get(
  "/:uid",
  playerLookupLimiter,
  optionalAuth,
  validate({ params: playerLookupParamSchema }),
  verifyAndLookupPlayer
);

export default router;
