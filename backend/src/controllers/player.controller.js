import { prisma } from "../config/db.js";
import { lookupPlayerByUid } from "../services/player.service.js";
import { ApiError, sendSuccess, asyncHandler } from "../utils/apiResponse.js";
import { logAuditEvent } from "../services/audit.service.js";

/**
 * ১. GET /api/player/lookup?uid=8674177274&server=BD
 *    অথবা GET /api/player/:uid
 *    অথবা POST /api/player/verify
 *
 * কাস্টমারের দেওয়া Free Fire Player UID ও Server যাচাই করে আসল Player Name (IGN),
 * Region, Level এবং Guild তথ্য রিটার্ন করবে।
 * ইউজার লগইন অবস্থায় থাকলে তার প্রোফাইলে সর্বশেষ ভেরিফায়েড UID স্বয়ংক্রিয়ভাবে সেভ রাখবে।
 */
export const verifyAndLookupPlayer = asyncHandler(async (req, res) => {
  const uid =
    req.validatedQuery?.uid ||
    req.validatedParams?.uid ||
    req.body?.uid ||
    req.query?.uid ||
    req.params?.uid;

  const server =
    req.validatedQuery?.server ||
    req.body?.server ||
    req.query?.server ||
    "BD";

  if (!uid) {
    throw new ApiError(
      400,
      "অনুগ্রহ করে আপনার Free Fire Player UID দিন।",
      null,
      "UID_REQUIRED"
    );
  }

  const playerInfo = await lookupPlayerByUid(uid, server);

  // যদি কাস্টমার লগইন করা থাকে, তবে তার প্রোফাইলে ভেরিফায়েড UID ও নাম সংরক্ষণ করা যাতে পরের বার টাইপ করতে না হয়
  if (req.user?.id) {
    const validServers = ["BD", "INDIA", "SINGAPORE", "OTHER"];
    const resolvedServer = validServers.includes(playerInfo.region)
      ? playerInfo.region
      : validServers.includes(playerInfo.requestedServer)
      ? playerInfo.requestedServer
      : "BD";

    await prisma.user
      .update({
        where: { id: req.user.id },
        data: {
          savedUid: playerInfo.uid,
          savedPlayerName: playerInfo.playerName,
          savedServer: resolvedServer,
        },
      })
      .catch(() => null);
  }

  // Frontend (UidVerificationBox.jsx & TopUpContext.js) এবং Backend উভয়ের সাথে ১০০% সামঞ্জস্যপূর্ণ রেসপন্স পে-লোড
  const responseData = {
    uid: playerInfo.uid,
    playerName: playerInfo.playerName,
    name: playerInfo.playerName,
    nickname: playerInfo.playerName,
    region: playerInfo.region,
    server: playerInfo.region || playerInfo.requestedServer,
    requestedServer: playerInfo.requestedServer,
    level: playerInfo.level,
    likes: playerInfo.likes,
    guildName: playerInfo.guildName,
    verified: true,
    isRegionMatch: playerInfo.isRegionMatch,
    fromCache: playerInfo.fromCache,
    verifiedAt: playerInfo.verifiedAt,
  };

  return sendSuccess(res, {
    statusCode: 200,
    message: `Player UID verified: ${playerInfo.playerName}`,
    data: responseData,
  });
});

/**
 * ২. POST /api/player/save-default (Logged-in Customer Only)
 * লগইন করা কাস্টমারের ড্যাশবোর্ডে তার ডিফল্ট গেম UID ভেরিফাই করে প্রোফাইলে স্থায়ীভাবে সেভ করার এন্ডপয়েন্ট।
 */
export const saveDefaultPlayerUid = asyncHandler(async (req, res) => {
  const { uid, server = "BD" } = req.body;

  const playerInfo = await lookupPlayerByUid(uid, server);

  const validServers = ["BD", "INDIA", "SINGAPORE", "OTHER"];
  const resolvedServer = validServers.includes(playerInfo.region)
    ? playerInfo.region
    : validServers.includes(server)
    ? server
    : "BD";

  const updatedUser = await prisma.user.update({
    where: { id: req.user.id },
    data: {
      savedUid: playerInfo.uid,
      savedPlayerName: playerInfo.playerName,
      savedServer: resolvedServer,
    },
    select: {
      id: true,
      name: true,
      email: true,
      savedUid: true,
      savedPlayerName: true,
      savedServer: true,
    },
  });

  await logAuditEvent({
    req,
    action: "USER_SAVED_PLAYER_UID",
    entityType: "USER",
    entityId: req.user.id,
    metadata: {
      savedUid: playerInfo.uid,
      savedPlayerName: playerInfo.playerName,
      savedServer: resolvedServer,
    },
  });

  return sendSuccess(res, {
    statusCode: 200,
    message: "আপনার Free Fire Player UID সফলভাবে ভেরিফাই ও প্রোফাইলে সেভ করা হয়েছে।",
    data: {
      user: updatedUser,
      player: playerInfo,
    },
  });
});
