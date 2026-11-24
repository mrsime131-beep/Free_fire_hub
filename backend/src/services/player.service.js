import { env } from "../config/env.js";
import { ApiError } from "../utils/apiResponse.js";
import { logger } from "../utils/logger.js";

// ৫ মিনিটের শর্ট-টার্ম ক্যাশ: কাস্টমার UID চেক করার পর অর্ডার সাবমিট করার সময় যাতে ডাবল এক্সটার্নাল API কলের কারণে দেরি না হয়
const verifiedPlayerCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * মেমোরি থেকে মেয়াদোত্তীর্ণ UID ক্যাশ পরিষ্কার করার হেল্পার
 */
function cleanupExpiredPlayerCache() {
  const now = Date.now();
  for (const [uid, entry] of verifiedPlayerCache.entries()) {
    if (now - entry.cachedAt > CACHE_TTL_MS) {
      verifiedPlayerCache.delete(uid);
    }
  }
}

/**
 * AuraFFX UID Checker API-এর JSON রেসপন্স থেকে আসল Player Name (IGN), Server/Region এবং Level বের করার ফাংশন।
 * কোনো অনুমান বা ভুয়া (Fake) নাম তৈরি করা সম্পূর্ণ নিষিদ্ধ।
 */
function extractPlayerDetailsFromPayload(payload, requestedUid, requestedServer) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  // যদি API স্পষ্টভাবে error বা status: false পাঠায়
  if (
    payload.error === true ||
    payload.success === false ||
    payload.status === "error" ||
    payload.status === false
  ) {
    return null;
  }

  // সম্ভাব্য নেস্টেড অবজেক্টগুলো বিশ্লেষণ করা (AuraFFX ও Garena Info স্ট্রাকচার অনুযায়ী)
  const basicInfo =
    payload.basicInfo ||
    payload.basic_info ||
    payload.AccountInfo ||
    payload.accountInfo ||
    payload.account_info ||
    payload.player_info ||
    payload.playerInfo ||
    payload.data?.basicInfo ||
    payload.data?.AccountInfo ||
    payload.data ||
    payload.result ||
    payload.player ||
    payload;

  const rawNickname =
    basicInfo?.nickname ??
    basicInfo?.AccountName ??
    basicInfo?.accountName ??
    basicInfo?.playerName ??
    basicInfo?.player_name ??
    basicInfo?.name ??
    basicInfo?.ign ??
    payload?.nickname ??
    payload?.AccountName ??
    payload?.playerName ??
    payload?.name ??
    null;

  if (!rawNickname || typeof rawNickname !== "string") {
    return null;
  }

  const cleanPlayerName = rawNickname.trim();

  // নাম যদি খালি হয় বা "not found" / "invalid" জাতীয় এরর স্ট্রিং হয় তবে বাতিল করা
  if (
    !cleanPlayerName ||
    cleanPlayerName.toLowerCase() === "null" ||
    cleanPlayerName.toLowerCase() === "undefined" ||
    cleanPlayerName.toLowerCase().includes("not found") ||
    cleanPlayerName.toLowerCase().includes("invalid")
  ) {
    return null;
  }

  const rawRegion =
    basicInfo?.region ??
    basicInfo?.AccountRegion ??
    basicInfo?.accountRegion ??
    basicInfo?.server ??
    payload?.region ??
    payload?.server ??
    requestedServer ??
    "BD";

  const rawLevel =
    basicInfo?.level ??
    basicInfo?.AccountLevel ??
    basicInfo?.accountLevel ??
    payload?.level ??
    null;

  const rawLikes =
    basicInfo?.liked ??
    basicInfo?.AccountLikes ??
    basicInfo?.likes ??
    payload?.likes ??
    null;

  const clanInfo =
    payload.clanBasicInfo ||
    payload.GuildInfo ||
    payload.guildInfo ||
    payload.data?.clanBasicInfo ||
    null;

  const guildName =
    clanInfo?.clanName ||
    clanInfo?.GuildName ||
    clanInfo?.guildName ||
    null;

  return {
    uid: String(requestedUid),
    playerName: cleanPlayerName,
    region: String(rawRegion).toUpperCase(),
    requestedServer: String(requestedServer || "BD").toUpperCase(),
    level: rawLevel !== null && !isNaN(Number(rawLevel)) ? Number(rawLevel) : null,
    likes: rawLikes !== null && !isNaN(Number(rawLikes)) ? Number(rawLikes) : null,
    guildName: guildName ? String(guildName).trim() : null,
    verified: true,
    verifiedAt: new Date().toISOString(),
  };
}

/**
 * ১. মূল Player UID Lookup ফাংশন
 * আপনার দেওয়া API (https://auraffxserverinfocheckerapi.onrender.com/api/player?uid=...) কল করে
 * আসল Free Fire প্লেয়ারের তথ্য যাচাই ও রিটার্ন করে।
 */
export async function lookupPlayerByUid(uid, server = "BD") {
  cleanupExpiredPlayerCache();

  const cleanUid = String(uid).trim();
  const cleanServer = String(server || "BD")
    .trim()
    .toUpperCase();

  // ফরম্যাট ডাবল-চেক (৮ থেকে ১২ ডিজিট সংখ্যা)
  if (!/^\d{8,12}$/.test(cleanUid)) {
    throw new ApiError(
      400,
      "ভুল UID ফরম্যাট! অনুগ্রহ করে ৮ থেকে ১২ ডিজিটের সঠিক Free Fire Player UID দিন।",
      null,
      "INVALID_UID_FORMAT"
    );
  }

  // ক্যাশে ভেরিফায়েড তথ্য থাকলে দ্রুত রিটার্ন করা
  const cacheKey = `${cleanUid}:${cleanServer}`;
  const cachedPlayer = verifiedPlayerCache.get(cacheKey);
  if (cachedPlayer && Date.now() - cachedPlayer.cachedAt < CACHE_TTL_MS) {
    logger.debug(
      `Returning cached verified player for UID: ${cleanUid}`,
      { playerName: cachedPlayer.data.playerName },
      "PLAYER_LOOKUP"
    );
    return {
      ...cachedPlayer.data,
      fromCache: true,
    };
  }

  const baseUrl = env.PLAYER_LOOKUP_API_URL.replace(/\/$/, "");
  const separator = baseUrl.includes("?") ? "&" : "?";
  const requestUrl = `${baseUrl}${separator}uid=${encodeURIComponent(cleanUid)}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    env.PLAYER_LOOKUP_TIMEOUT_MS
  );

  let response;
  let rawData;

  try {
    logger.info(
      `Looking up Free Fire Player UID via external API: ${cleanUid}`,
      { server: cleanServer },
      "PLAYER_LOOKUP"
    );

    response = await fetch(requestUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "FreeFireHub-BD-Backend/1.0",
      },
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeoutId);

    if (error.name === "AbortError") {
      logger.warn(
        `Player UID lookup timed out after ${env.PLAYER_LOOKUP_TIMEOUT_MS}ms for UID: ${cleanUid}`,
        null,
        "PLAYER_LOOKUP_TIMEOUT"
      );
      throw new ApiError(
        504,
        "গেম সার্ভার থেকে প্লেয়ারের তথ্য যাচাই করতে বেশি সময় লাগছে। অনুগ্রহ করে কয়েক সেকেন্ড পর আবার চেষ্টা করুন।",
        null,
        "PLAYER_LOOKUP_TIMEOUT"
      );
    }

    logger.error(
      `Network error while contacting Player UID API for UID: ${cleanUid}`,
      error,
      "PLAYER_LOOKUP_NETWORK_ERROR"
    );
    throw new ApiError(
      502,
      "বর্তমানে Player UID ভেরিফিকেশন সার্ভারে সংযোগ দেওয়া যাচ্ছে না। কিছুক্ষণ পর আবার চেষ্টা করুন।",
      null,
      "PLAYER_LOOKUP_UNAVAILABLE"
    );
  } finally {
    clearTimeout(timeoutId);
  }

  // HTTP 404 বা 400 মানে ভুল UID
  if (response.status === 404 || response.status === 400) {
    throw new ApiError(
      404,
      "এই UID দিয়ে কোনো Free Fire অ্যাকাউন্ট পাওয়া যায়নি। অনুগ্রহ করে আপনার গেম প্রোফাইল থেকে সঠিক UID কপি করে দিন।",
      null,
      "PLAYER_NOT_FOUND"
    );
  }

  if (!response.ok) {
    logger.warn(
      `Upstream Player Lookup API returned HTTP ${response.status} for UID: ${cleanUid}`,
      null,
      "PLAYER_LOOKUP_HTTP_ERROR"
    );
    throw new ApiError(
      502,
      "গেম সার্ভার থেকে এই মুহূর্তে UID যাচাই করা সম্ভব হচ্ছে না। অনুগ্রহ করে কিছুক্ষণ পর চেষ্টা করুন।",
      null,
      "UPSTREAM_API_ERROR"
    );
  }

  try {
    rawData = await response.json();
  } catch (parseError) {
    logger.error(
      "Failed to parse JSON from Player Lookup API",
      parseError,
      "PLAYER_LOOKUP_PARSE_ERROR"
    );
    throw new ApiError(
      502,
      "প্লেয়ার ভেরিফিকেশন সার্ভার থেকে অসম্পূর্ণ রেসপন্স পাওয়া গেছে। আবার চেষ্টা করুন।",
      null,
      "INVALID_UPSTREAM_RESPONSE"
    );
  }

  const playerDetails = extractPlayerDetailsFromPayload(
    rawData,
    cleanUid,
    cleanServer
  );

  // যদি রেসপন্সে কোনো আসল প্লেয়ারের নাম না থাকে, তবে কখনোই ভুয়া নাম না দেখিয়ে 404 Error দেবে
  if (!playerDetails) {
    throw new ApiError(
      404,
      "এই Player UID-এর কোনো বৈধ Free Fire অ্যাকাউন্ট খুঁজে পাওয়া যায়নি। সঠিক UID দিয়ে আবার চেষ্টা করুন।",
      null,
      "INVALID_PLAYER_UID"
    );
  }

  // যদি কাস্টমার BD সার্ভার সিলেক্ট করে কিন্তু প্লেয়ারের রিজিওন অন্য দেশের হয়, তবে সতর্কবার্তা ফ্ল্যাগ যুক্ত করা
  const isRegionMatch =
    !playerDetails.region ||
    playerDetails.region === cleanServer ||
    (cleanServer === "BD" && playerDetails.region.includes("BD"));

  const finalPlayerObject = {
    ...playerDetails,
    isRegionMatch,
    fromCache: false,
  };

  // ৫ মিনিটের জন্য ভেরিফায়েড ক্যাশে সংরক্ষণ করা
  verifiedPlayerCache.set(cacheKey, {
    data: finalPlayerObject,
    cachedAt: Date.now(),
  });

  logger.info(
    `Successfully verified Free Fire UID: ${cleanUid} -> ${finalPlayerObject.playerName} (${finalPlayerObject.region})`,
    null,
    "PLAYER_LOOKUP"
  );

  return finalPlayerObject;
}

/**
 * ২. অর্ডার সাবমিশনের সময় (Order Creation) UID ও Player Name পুনরায় নিশ্চিত করার হেল্পার ফাংশন
 */
export async function verifyPlayerForOrder(uid, server = "BD") {
  const verifiedPlayer = await lookupPlayerByUid(uid, server);

  if (!verifiedPlayer || !verifiedPlayer.playerName) {
    throw new ApiError(
      400,
      "অর্ডার সম্পন্ন করার আগে আপনার Player UID যাচাই করা সম্ভব হয়নি। সঠিক UID দিন।",
      null,
      "ORDER_UID_VERIFICATION_FAILED"
    );
  }

  return verifiedPlayer;
}
