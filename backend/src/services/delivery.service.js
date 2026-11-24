import crypto from "crypto";
import { prisma } from "../config/db.js";
import { env } from "../config/env.js";
import { ApiError } from "../utils/apiResponse.js";
import { logger } from "../utils/logger.js";
import { logAuditEvent } from "./audit.service.js";
import { formatOrderResponse } from "./order.service.js";

/**
 * ডেলিভারি রেফারেন্স আইডি তৈরি করার হেল্পার ফাংশন
 * উদাহরণ: DEMO-DLV-20261124-A8F9C2 অথবা LIVE-DLV-20261124-9B1D4E
 */
function generateDeliveryReference(isDemoMode = true) {
  const prefix = isDemoMode ? "DEMO-DLV" : "LIVE-DLV";
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomHex = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `${prefix}-${datePart}-${randomHex}`;
}

/**
 * DEMO Mode সিমুলেটর:
 * প্রোডাকশনে অটো-টপআপ সাপ্লায়ার API যুক্ত করার আগে সম্পূর্ণ অর্ডার ও ডেলিভারি ফ্লো টেস্ট করার জন্য।
 */
async function runDemoTopUpDelivery(order, deliveryRecord) {
  const deliveryReferenceId = generateDeliveryReference(true);

  const simulatedResponse = {
    mode: "DEMO",
    provider: "FreeFireHub-Internal-Demo-Engine",
    success: true,
    deliveryReferenceId,
    orderNumber: order.orderNumber,
    playerUid: order.playerUid,
    playerName: order.playerName,
    server: order.server,
    totalDiamondsDelivered: deliveryRecord.totalDiamonds,
    packages: order.items.map((item) => ({
      sku: item.productSku,
      name: item.productName,
      quantity: item.quantity,
      diamondsPerUnit:
        Number(item.diamondQuantity || 0) + Number(item.bonusDiamonds || 0),
    })),
    processedAt: new Date().toISOString(),
  };

  return {
    success: true,
    deliveryReferenceId,
    providerResponse: simulatedResponse,
  };
}

/**
 * LIVE Mode Supplier API কলার:
 * যখন .env ফাইলে DELIVERY_MODE="LIVE" এবং DELIVERY_PROVIDER_API_URL সেট করা থাকবে,
 * তখন আসল রিসেলার/সাপ্লায়ার সার্ভারে অটোমেটিক টপ-আপ রিকোয়েস্ট পাঠাবে।
 */
async function runLiveTopUpDelivery(order, deliveryRecord) {
  const providerUrl = env.DELIVERY_PROVIDER_API_URL;
  const providerApiKey = env.DELIVERY_PROVIDER_API_KEY;

  if (!providerUrl) {
    throw new Error(
      "LIVE delivery mode is enabled, but DELIVERY_PROVIDER_API_URL is not configured in environment variables."
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // ১৫ সেকেন্ড টাইমআউট

  try {
    const requestPayload = {
      orderNumber: order.orderNumber,
      playerUid: order.playerUid,
      playerName: order.playerName,
      server: order.server,
      totalDiamonds: deliveryRecord.totalDiamonds,
      items: order.items.map((item) => ({
        sku: item.productSku,
        productName: item.productName,
        quantity: item.quantity,
        diamondQuantity: item.diamondQuantity,
        bonusDiamonds: item.bonusDiamonds,
      })),
    };

    const response = await fetch(providerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(providerApiKey ? { Authorization: `Bearer ${providerApiKey}` } : {}),
      },
      body: JSON.stringify(requestPayload),
      signal: controller.signal,
    });

    const responseData = await response.json().catch(() => ({}));

    if (!response.ok || responseData.success === false || responseData.error) {
      const errorMsg =
        responseData.message ||
        responseData.error ||
        `Supplier API returned HTTP ${response.status}`;
      throw new Error(errorMsg);
    }

    const deliveryReferenceId =
      responseData.deliveryReferenceId ||
      responseData.referenceId ||
      responseData.transactionId ||
      generateDeliveryReference(false);

    return {
      success: true,
      deliveryReferenceId: String(deliveryReferenceId),
      providerResponse: responseData,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * ১. মূল অটোমেটিক ডায়মন্ড ডেলিভারি এক্সিকিউশন ফাংশন (executeOrderDelivery)
 * পেমেন্ট VERIFIED হওয়ার সাথে সাথে এটি স্বয়ংক্রিয়ভাবে কল হবে অথবা অ্যাডমিন ম্যানুয়ালি Retry করতে পারবেন।
 *
 * নিরাপত্তা:
 * - পেমেন্ট VERIFIED না থাকলে কখনোই ডায়মন্ড ডেলিভারি হবে না।
 * - ইতিমধ্যে DELIVERED হয়ে থাকলে ডাবল ডায়মন্ড যাবে না (Idempotent Delivery)।
 */
export async function executeOrderDelivery(
  orderIdentifier,
  { req = null, triggeredBy = "AUTO_PAYMENT_VERIFIED" } = {}
) {
  const cleanId = String(orderIdentifier).trim();

  const order = await prisma.order.findFirst({
    where: {
      OR: [{ id: cleanId }, { orderNumber: cleanId.toUpperCase() }],
    },
    include: {
      items: true,
      payment: true,
      delivery: true,
    },
  });

  if (!order) {
    throw new ApiError(
      404,
      `ডেলিভারির জন্য অর্ডার ('${cleanId}') খুঁজে পাওয়া যায়নি।`,
      null,
      "ORDER_NOT_FOUND"
    );
  }

  // নিরাপত্তা চেক ১: পেমেন্ট ভেরিফায়েড কি না
  if (order.paymentStatus !== "VERIFIED") {
    throw new ApiError(
      400,
      `অর্ডার ${order.orderNumber}-এর পেমেন্ট এখনো VERIFIED হয়নি (বর্তমান স্ট্যাটাস: ${order.paymentStatus})। পেমেন্ট ভেরিফাই ছাড়া ডেলিভারি সম্ভব নয়।`,
      null,
      "PAYMENT_NOT_VERIFIED"
    );
  }

  // নিরাপত্তা চেক ২: ডাবল ডেলিভারি প্রতিরোধ
  if (
    order.delivery?.status === "DELIVERED" &&
    order.orderStatus === "COMPLETED"
  ) {
    logger.info(
      `Order ${order.orderNumber} is already DELIVERED. Skipping duplicate delivery.`,
      { deliveryReferenceId: order.delivery.deliveryReferenceId },
      "DELIVERY_ENGINE"
    );
    return formatOrderResponse(order, true);
  }

  const isDemoMode =
    String(env.DELIVERY_MODE || "DEMO").toUpperCase() !== "LIVE";

  const totalOrderDiamonds = order.items.reduce(
    (sum, item) =>
      sum +
      (Number(item.diamondQuantity || 0) + Number(item.bonusDiamonds || 0)) *
        Number(item.quantity || 1),
    0
  );

  // ডেলিভারি রেকর্ড না থাকলে তৈরি করা, থাকলে PROCESSING স্ট্যাটাসে নিয়ে attempts + 1 করা
  const activeDelivery = await prisma.delivery.upsert({
    where: { orderId: order.id },
    create: {
      orderId: order.id,
      playerUid: order.playerUid,
      playerName: order.playerName,
      server: order.server,
      totalDiamonds: totalOrderDiamonds,
      status: "PROCESSING",
      isDemoMode,
      attempts: 1,
    },
    update: {
      status: "PROCESSING",
      isDemoMode,
      attempts: { increment: 1 },
      errorMessage: null,
    },
  });

  await prisma.order.update({
    where: { id: order.id },
    data: { orderStatus: "PROCESSING" },
  });

  try {
    logger.info(
      `Starting [${isDemoMode ? "DEMO" : "LIVE"}] diamond delivery for Order ${order.orderNumber} -> UID: ${order.playerUid} (${totalOrderDiamonds} Diamonds)`,
      { triggeredBy, attempt: activeDelivery.attempts },
      "DELIVERY_ENGINE"
    );

    const deliveryResult = isDemoMode
      ? await runDemoTopUpDelivery(order, activeDelivery)
      : await runLiveTopUpDelivery(order, activeDelivery);

    const now = new Date();
    const earnedRewardPoints = Math.max(
      1,
      Math.floor(Number(order.payableAmount || 0) / 100)
    );

    // ডেলিভারি সফল হলে Atomic Transaction-এ Delivery, Order এবং ইউজারের Reward Points আপডেট করা
    const completedOrder = await prisma.$transaction(async (tx) => {
      await tx.delivery.update({
        where: { id: activeDelivery.id },
        data: {
          status: "DELIVERED",
          deliveryReferenceId: deliveryResult.deliveryReferenceId,
          providerResponse: deliveryResult.providerResponse,
          errorMessage: null,
          deliveredAt: now,
        },
      });

      const updatedOrder = await tx.order.update({
        where: { id: order.id },
        data: {
          orderStatus: "COMPLETED",
          completedAt: now,
        },
        include: {
          items: true,
          payment: true,
          delivery: true,
        },
      });

      // লগইন করা কাস্টমার হলে তার অ্যাকাউন্টে রিওয়ার্ড পয়েন্ট যোগ করা
      if (order.userId) {
        await tx.user
          .update({
            where: { id: order.userId },
            data: {
              rewardPoints: { increment: earnedRewardPoints },
            },
          })
          .catch(() => null);
      }

      return updatedOrder;
    });

    await logAuditEvent({
      req,
      action: "DELIVERY_COMPLETED",
      entityType: "DELIVERY",
      entityId: completedOrder.orderNumber,
      metadata: {
        orderId: completedOrder.id,
        orderNumber: completedOrder.orderNumber,
        playerUid: completedOrder.playerUid,
        playerName: completedOrder.playerName,
        totalDiamonds: totalOrderDiamonds,
        deliveryReferenceId: deliveryResult.deliveryReferenceId,
        mode: isDemoMode ? "DEMO" : "LIVE",
        triggeredBy,
      },
    });

    logger.info(
      `Diamond delivery COMPLETED for Order ${completedOrder.orderNumber} (Ref: ${deliveryResult.deliveryReferenceId})`,
      null,
      "DELIVERY_ENGINE"
    );

    return formatOrderResponse(completedOrder, true);
  } catch (deliveryError) {
    const errorMsg =
      deliveryError.message || "Unknown error during diamond delivery";

    logger.error(
      `Diamond delivery FAILED for Order ${order.orderNumber}: ${errorMsg}`,
      deliveryError,
      "DELIVERY_ENGINE_ERROR"
    );

    const failedOrder = await prisma.$transaction(async (tx) => {
      await tx.delivery.update({
        where: { id: activeDelivery.id },
        data: {
          status: "FAILED",
          errorMessage: errorMsg,
        },
      });

      return tx.order.update({
        where: { id: order.id },
        data: {
          orderStatus: "FAILED",
        },
        include: {
          items: true,
          payment: true,
          delivery: true,
        },
      });
    });

    await logAuditEvent({
      req,
      action: "DELIVERY_FAILED",
      entityType: "DELIVERY",
      entityId: order.orderNumber,
      metadata: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        playerUid: order.playerUid,
        errorMessage: errorMsg,
        attempt: activeDelivery.attempts,
        triggeredBy,
      },
    });

    return formatOrderResponse(failedOrder, true);
  }
}

/**
 * ২. নির্দিষ্ট অর্ডারের ডেলিভারি স্ট্যাটাস চেক করা (GET /api/deliveries/:orderNumber)
 */
export async function getDeliveryByOrderIdentifier(
  orderIdentifier,
  currentUser = null
) {
  const cleanId = String(orderIdentifier).trim();

  const order = await prisma.order.findFirst({
    where: {
      OR: [{ orderNumber: cleanId.toUpperCase() }, { id: cleanId }],
    },
    include: {
      delivery: true,
      items: true,
    },
  });

  if (!order || !order.delivery) {
    throw new ApiError(
      404,
      `অর্ডার '${cleanId}'-এর কোনো ডেলিভারি রেকর্ড পাওয়া যায়নি।`,
      null,
      "DELIVERY_NOT_FOUND"
    );
  }

  const isAdmin = currentUser?.role === "ADMIN";

  return {
    orderNumber: order.orderNumber,
    orderStatus: order.orderStatus,
    paymentStatus: order.paymentStatus,
    playerUid: order.playerUid,
    playerName: order.playerName,
    server: order.server,
    delivery: {
      id: order.delivery.id,
      status: order.delivery.status,
      totalDiamonds: order.delivery.totalDiamonds,
      deliveryReferenceId: order.delivery.deliveryReferenceId,
      isDemoMode: order.delivery.isDemoMode,
      attempts: order.delivery.attempts,
      deliveredAt: order.delivery.deliveredAt,
      ...(isAdmin
        ? {
            errorMessage: order.delivery.errorMessage,
            providerResponse: order.delivery.providerResponse,
          }
        : {}),
    },
  };
}

/**
 * ৩. অ্যাডমিন প্যানেলের জন্য সকল ডেলিভারি লগ ও স্ট্যাটাস ফিল্টারিং (GET /api/deliveries)
 */
export async function getAllDeliveriesForAdmin(query = {}) {
  const page = Math.max(1, Number(query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(query.limit || 20)));
  const skip = (page - 1) * limit;

  const whereClause = {};

  if (query.status) {
    whereClause.status = String(query.status).trim().toUpperCase();
  }

  if (query.player
