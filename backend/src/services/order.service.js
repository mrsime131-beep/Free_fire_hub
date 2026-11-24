import { prisma } from "../config/db.js";
import { env } from "../config/env.js";
import { ApiError } from "../utils/apiResponse.js";
import { generateUniqueOrderNumber } from "../utils/orderIdGenerator.js";
import { verifyPlayerForOrder } from "./player.service.js";
import { logAuditEvent } from "./audit.service.js";
import { logger } from "../utils/logger.js";

/**
 * অর্ডার অবজেক্টকে Frontend এবং REST API উভয়ের জন্য স্ট্যান্ডার্ড ফরম্যাটে সাজানোর হেল্পার ফাংশন
 */
export function formatOrderResponse(order, isAdmin = false) {
  if (!order) return null;

  const totalDiamonds = Array.isArray(order.items)
    ? order.items.reduce(
        (sum, item) =>
          sum +
          (Number(item.diamondQuantity || 0) + Number(item.bonusDiamonds || 0)) *
            Number(item.quantity || 1),
        0
      )
    : 0;

  const formattedItems = Array.isArray(order.items)
    ? order.items.map((item) => {
        const cleanItem = {
          id: item.id,
          productId: item.productId,
          productName: item.productName,
          productSku: item.productSku,
          diamondQuantity: item.diamondQuantity,
          bonusDiamonds: item.bonusDiamonds,
          quantity: item.quantity,
          unitSellingPrice: item.unitSellingPrice,
          totalPrice: item.totalPrice,
        };

        if (isAdmin) {
          cleanItem.unitPurchasePrice = item.unitPurchasePrice;
        }

        return cleanItem;
      })
    : [];

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    orderId: order.orderNumber, // Frontend Compatibility Alias
    userId: order.userId,
    guestPhone: order.guestPhone,
    guestEmail: order.guestEmail,
    playerUid: order.playerUid,
    playerName: order.playerName,
    server: order.server,
    totalDiamonds,
    subtotalAmount: order.subtotalAmount,
    discountAmount: order.discountAmount,
    payableAmount: order.payableAmount,
    couponCode: order.couponCode,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    orderStatus: order.orderStatus,
    status: order.orderStatus, // Frontend Compatibility Alias
    customerNote: order.customerNote,
    ...(isAdmin ? { adminNote: order.adminNote } : {}),
    items: formattedItems,
    payment: order.payment
      ? {
          id: order.payment.id,
          paymentMethod: order.payment.paymentMethod,
          amount: order.payment.amount,
          senderNumber: order.payment.senderNumber,
          transactionReference: order.payment.transactionReference,
          status: order.payment.status,
          rejectionReason: order.payment.rejectionReason,
          submittedAt: order.payment.submittedAt,
          verifiedAt: order.payment.verifiedAt,
        }
      : null,
    delivery: order.delivery
      ? {
          id: order.delivery.id,
          status: order.delivery.status,
          totalDiamonds: order.delivery.totalDiamonds,
          deliveryReferenceId: order.delivery.deliveryReferenceId,
          isDemoMode: order.delivery.isDemoMode,
          attempts: order.delivery.attempts,
          deliveredAt: order.delivery.deliveredAt,
          ...(isAdmin ? { errorMessage: order.delivery.errorMessage } : {}),
        }
      : null,
    completedAt: order.completedAt,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

/**
 * কুপন কোড যাচাই এবং ডিসকাউন্ট অ্যামাউন্ট হিসাব করার অভ্যন্তরীণ ফাংশন
 */
async function validateAndCalculateCoupon(couponCode, subtotalAmount, dbClient = prisma) {
  if (!couponCode) {
    return { coupon: null, discountAmount: 0 };
  }

  const cleanCode = String(couponCode).trim().toUpperCase();
  const coupon = await dbClient.coupon.findUnique({
    where: { code: cleanCode },
  });

  if (!coupon || !coupon.isActive) {
    throw new ApiError(
      400,
      `কুপন কোড '${cleanCode}' বৈধ নয় অথবা বর্তমানে নিষ্ক্রিয়।`,
      null,
      "INVALID_COUPON"
    );
  }

  const now = new Date();
  if (coupon.startsAt && now < new Date(coupon.startsAt)) {
    throw new ApiError(
      400,
      "এই কুপন কোডটির মেয়াদ এখনো শুরু হয়নি।",
      null,
      "COUPON_NOT_STARTED"
    );
  }

  if (coupon.expiresAt && now > new Date(coupon.expiresAt)) {
    throw new ApiError(
      400,
      "এই কুপন কোডটির মেয়াদ শেষ হয়ে গেছে।",
      null,
      "COUPON_EXPIRED"
    );
  }

  if (
    coupon.usageLimit !== null &&
    coupon.usageLimit !== undefined &&
    coupon.usedCount >= coupon.usageLimit
  ) {
    throw new ApiError(
      400,
      "এই কুপন কোডটির সর্বোচ্চ ব্যবহারের সীমা শেষ হয়ে গেছে।",
      null,
      "COUPON_LIMIT_REACHED"
    );
  }

  if (subtotalAmount < Number(coupon.minOrderAmount || 0)) {
    throw new ApiError(
      400,
      `এই কুপনটি ব্যবহার করতে কমপক্ষে ৳${coupon.minOrderAmount} টাকার অর্ডার করতে হবে।`,
      null,
      "COUPON_MIN_AMOUNT_NOT_MET"
    );
  }

  let discountAmount = 0;
  if (coupon.discountType === "PERCENTAGE") {
    discountAmount = (subtotalAmount * Number(coupon.discountValue)) / 100;
    if (
      coupon.maxDiscountAmount !== null &&
      coupon.maxDiscountAmount !== undefined &&
      discountAmount > Number(coupon.maxDiscountAmount)
    ) {
      discountAmount = Number(coupon.maxDiscountAmount);
    }
  } else {
    discountAmount = Number(coupon.discountValue);
  }

  discountAmount = Math.min(subtotalAmount, Number(discountAmount.toFixed(2)));

  return {
    coupon,
    discountAmount,
  };
}

/**
 * ১. নতুন অর্ডার তৈরি করার মূল সার্ভিস (createNewOrder)
 * - Idempotency ডুপ্লিকেট অর্ডার প্রতিরোধ
 * - Duplicate Transaction ID (TrxID) প্রি-চেক
 * - রিয়েল-টাইম Free Fire Player UID ও Name যাচাই
 * - ডাটাবেস থেকে প্রোডাক্টের আসল দাম ও স্টক যাচাই
 * - Atomic Database Transaction-এ Order, OrderItem, Payment ও Delivery তৈরি
 */
export async function createNewOrder(payload, req = null) {
  const {
    playerUid,
    server = "BD",
    items,
    paymentMethod,
    guestPhone,
    guestEmail,
    couponCode,
    customerNote,
    senderNumber,
    transactionReference,
  } = payload;

  const effectiveIdempotencyKey =
    req?.idempotencyKey || payload.idempotencyKey || null;

  // ১. Idempotency Key ডাটাবেস চেক: যদি একই কী দিয়ে অর্ডার ইতিমধ্যে তৈরি হয়ে থাকে, তবে সেটিই রিটার্ন করবে
  if (effectiveIdempotencyKey) {
    const existingIdempotentOrder = await prisma.order.findUnique({
      where: { idempotencyKey: effectiveIdempotencyKey },
      include: {
        items: true,
        payment: true,
        delivery: true,
      },
    });

    if (existingIdempotentOrder) {
      logger.info(
        `Returning existing database order for idempotencyKey: ${effectiveIdempotencyKey}`,
        { orderNumber: existingIdempotentOrder.orderNumber },
        "ORDER_SERVICE"
      );
      return formatOrderResponse(existingIdempotentOrder, req?.user?.role === "ADMIN");
    }
  }

  // ২. যদি চেকআউটের সময়ই কাস্টমার Transaction ID (TrxID) দিয়ে থাকে, তবে ডুপ্লিকেট TrxID কি না তা শুরুতেই চেক করা
  const cleanTrxId = transactionReference
    ? String(transactionReference).trim().toUpperCase()
    : null;

  if (cleanTrxId) {
    const duplicatePayment = await prisma.payment.findUnique({
      where: { transactionReference: cleanTrxId },
      select: { id: true },
    });

    if (duplicatePayment) {
      throw new ApiError(
        409,
        "এই Transaction ID (TrxID) ইতিমধ্যে অন্য একটি অর্ডারে ব্যবহৃত হয়েছে। অনুগ্রহ করে সঠিক এবং নতুন TrxID দিন।",
        null,
        "DUPLICATE_TRANSACTION_ID"
      );
    }
  }

  // ৩. রিয়েল-টাইম Player UID যাচাই করে আসল Player Name (IGN) বের করা
  const verifiedPlayer = await verifyPlayerForOrder(playerUid, server);

  // ৪. ডাটাবেস থেকে নির্বাচিত প্রোডাক্টগুলোর আসল তথ্য, স্টক ও দাম লোড করা
  const requestedIdentifiers = items.map((i) => String(i.productId).trim());

  const dbProducts = await prisma.product.findMany({
    where: {
      OR: [
        { id: { in: requestedIdentifiers } },
        { sku: { in: requestedIdentifiers.map((id) => id.toUpperCase()) } },
        { slug: { in: requestedIdentifiers.map((id) => id.toLowerCase()) } },
      ],
    },
  });

  let subtotalAmount = 0;
  let totalOrderDiamonds = 0;
  const preparedOrderItems = [];

  for (const requestedItem of items) {
    const rawId = String(requestedItem.productId).trim();
    const quantity = Number(requestedItem.quantity || 1);

    const matchedProduct = dbProducts.find(
      (p) =>
        p.id === rawId ||
        p.sku.toUpperCase() === rawId.toUpperCase() ||
        p.slug.toLowerCase() === rawId.toLowerCase()
    );

    if (!matchedProduct) {
      throw new ApiError(
        404,
        `নির্বাচিত প্রোডাক্ট ('${rawId}') খুঁজে পাওয়া যায়নি।`,
        null,
        "PRODUCT_NOT_FOUND"
      );
    }

    if (!matchedProduct.isActive || matchedProduct.availability !== "IN_STOCK") {
      throw new ApiError(
        400,
        `'${matchedProduct.name}' প্যাকেজটি বর্তমানে স্টকে নেই (${matchedProduct.availability})।`,
        null,
        "PRODUCT_OUT_OF_STOCK"
      );
    }

    const unitSellingPrice = Number(matchedProduct.sellingPrice);
    const unitPurchasePrice = Number(matchedProduct.purchasePrice);
    const itemTotalPrice = Number((unitSellingPrice * quantity).toFixed(2));
    const itemDiamonds =
      (Number(matchedProduct.diamondQuantity || 0) +
        Number(matchedProduct.bonusDiamonds || 0)) *
      quantity;

    subtotalAmount = Number((subtotalAmount + itemTotalPrice).toFixed(2));
    totalOrderDiamonds += itemDiamonds;

    preparedOrderItems.push({
      productId: matchedProduct.id,
      productName: matchedProduct.name,
      productSku: matchedProduct.sku,
      diamondQuantity: matchedProduct.diamondQuantity,
      bonusDiamonds: matchedProduct.bonusDiamonds,
      quantity,
      unitPurchasePrice,
      unitSellingPrice,
      totalPrice: itemTotalPrice,
    });
  }

  // ৫. কুপন কোড থাকলে তার বৈধতা ও ডিসকাউন্ট হিসাব করা
  const { coupon, discountAmount } = await validateAndCalculateCoupon(
    couponCode,
    subtotalAmount
  );

  const payableAmount = Number(
    Math.max(0, subtotalAmount - discountAmount).toFixed(2)
  );

  // কাস্টমার যদি অর্ডারের সাথেই senderNumber ও TrxID সাবমিট করে, তবে স্ট্যাটাস সরাসরি PAYMENT_REVIEW হবে
  const hasSubmittedPaymentProof = Boolean(cleanTrxId);
  const initialOrderStatus = hasSubmittedPaymentProof
    ? "PAYMENT_REVIEW"
    : "PENDING";
  const initialPaymentStatus = hasSubmittedPaymentProof
    ? "UNDER_REVIEW"
    : "UNPAID";

  const validServers = ["BD", "INDIA", "SINGAPORE", "OTHER"];
  const resolvedServer = validServers.includes(server) ? server : "BD";
  const isDemoMode = String(env.DELIVERY_MODE || "DEMO").toUpperCase() !== "LIVE";

  // ৬. Atomic Database Transaction: Order, OrderItems, Payment, Delivery এবং Coupon Usage একসাথে সেভ করা
  const createdOrder = await prisma.$transaction(async (tx) => {
    const uniqueOrderNumber = await generateUniqueOrderNumber(tx);

    if (coupon) {
      await tx.coupon.update({
        where: { id: coupon.id },
        data: {
          usedCount: { increment: 1 },
        },
      });
    }

    const newOrder = await tx.order.create({
      data: {
        orderNumber: uniqueOrderNumber,
        userId: req?.user?.id || null,
        guestPhone: guestPhone || senderNumber || req?.user?.phone || null,
        guestEmail: guestEmail || req?.user?.email || null,
        playerUid: verifiedPlayer.uid,
        playerName: verifiedPlayer.playerName,
        server: resolvedServer,
        subtotalAmount,
        discountAmount,
        payableAmount,
        couponCode: coupon ? coupon.code : null,
        paymentMethod,
        paymentStatus: initialPaymentStatus,
        orderStatus: initialOrderStatus,
        idempotencyKey: effectiveIdempotencyKey,
        customerNote: customerNote || null,
        items: {
          create: preparedOrderItems,
        },
        payment: {
          create: {
            paymentMethod,
            amount: payableAmount,
            senderNumber: senderNumber || guestPhone || null,
            transactionReference: cleanTrxId,
            status: initialPaymentStatus,
            submittedAt: hasSubmittedPaymentProof ? new Date() : null,
          },
        },
        delivery: {
          create: {
            playerUid: verifiedPlayer.uid,
            playerName: verifiedPlayer.playerName,
            server: resolvedServer,
            totalDiamonds: totalOrderDiamonds,
            status: "PENDING",
            isDemoMode,
          },
        },
      },
      include: {
        items: true,
        payment: true,
        delivery: true,
      },
    });

    return newOrder;
  });

  // ৭. Audit Log-এ অর্ডার তৈরির রেকর্ড সংরক্ষণ
  await logAuditEvent({
    req,
    userId: req?.user?.id || null,
    action: "ORDER_CREATED",
    entityType: "ORDER",
    entityId: createdOrder.orderNumber,
    metadata: {
      orderId: createdOrder.id,
      orderNumber: createdOrder.orderNumber,
      playerUid: createdOrder.playerUid,
      playerName: createdOrder.playerName,
      payableAmount: createdOrder.payableAmount,
      paymentMethod: createdOrder.paymentMethod,
      orderStatus: createdOrder.orderStatus,
      hasTrxIdAtCheckout: hasSubmittedPaymentProof,
    },
  });

  logger.info(
    `New order created: ${createdOrder.orderNumber} for UID ${createdOrder.playerUid} (${createdOrder.playerName}) — ৳${createdOrder.payableAmount}`,
    null,
    "ORDER_SERVICE"
  );

  return formatOrderResponse(createdOrder, req?.user?.role === "ADMIN");
}

/**
 * ২. Order Number (যেমন: FFH-20261124-000001) অথবা Order UUID দিয়ে অর্ডারের বিস্তারিত তথ্য বের করা
 */
export async function getOrderByNumberOrId(identifier, currentUser = null) {
  const cleanId = String(identifier).trim();

  const order = await prisma.order.findFirst({
    where: {
      OR: [
        { orderNumber: cleanId.toUpperCase() },
        { id: cleanId },
      ],
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
      `অর্ডার '${cleanId}' খুঁজে পাওয়া যায়নি। অনুগ্রহ করে সঠিক Order ID দিন।`,
      null,
      "ORDER_NOT_FOUND"
    );
  }

  const isAdmin = currentUser?.role === "ADMIN";
  return formatOrderResponse(order, isAdmin);
}

/**
 * ৩. লগইন করা ইউজারের নিজস্ব অর্ডার হিস্ট্রি বের করা (GET /api/orders/my-orders)
 */
export async function getUserOrders(userId, query = {}) {
  const page = Number(query.page || 1);
  const limit = Number(query.limit || 20);
  const skip = (page - 1) * limit;

  const whereClause = { userId };

  if (query.status) {
    whereClause.orderStatus = query.status;
  }

  if (query.paymentStatus) {
    whereClause.paymentStatus = query.paymentStatus;
  }

  const [orders, totalCount] = await Promise.all([
    prisma.order.findMany({
      where: whereClause,
      include: {
        items: true,
        payment: true,
        delivery: true,
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.order.count({ where: whereClause }),
  ]);

  return {
    orders: orders.map((o) => formatOrderResponse(o, false)),
    meta: {
      page,
      limit,
      total: totalCount,
      totalPages: Math.ceil(totalCount / limit) || 1,
    },
  };
}

/**
 * ৪. অ্যাডমিন প্যানেলের জন্য সকল অর্ডার ফিল্টার ও পেজিনেশনসহ বের করা (GET /api/orders)
 */
export async function getAllOrdersForAdmin(query = {}) {
  const page = Number(query.page || 1);
  const limit = Number(query.limit || 20);
  const skip = (page - 1) * limit;

  const whereClause = {};

  if (query.status) {
    whereClause.orderStatus = query.status;
  }

  if (query.paymentStatus) {
    whereClause.paymentStatus = query.paymentStatus;
  }

  if (query.playerUid) {
    whereClause.playerUid = String(query.playerUid).trim();
  }

  if (query.search) {
    const cleanSearch = String(query.search).trim();
    whereClause.OR = [
      { orderNumber: { contains: cleanSearch, mode: "insensitive" } },
      { playerUid: { contains: cleanSearch, mode: "insensitive" } },
      { playerName: { contains: cleanSearch, mode: "insensitive" } },
      { guestPhone: { contains: cleanSearch, mode: "insensitive" } },
      {
        payment: {
          transactionReference: { contains: cleanSearch, mode: "insensitive" },
        },
      },
    ];
  }

  const [orders, totalCount] = await Promise.all([
    prisma.order.findMany({
      where: whereClause,
      include: {
        items: true,
        payment: true,
        delivery: true,
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.order.count({ where: whereClause }),
  ]);

  return {
    orders: orders.map((o) => formatOrderResponse(o, true)),
    meta: {
      page,
      limit,
      total: totalCount,
      totalPages: Math.ceil(totalCount / limit) || 1,
    },
  };
}

/**
 * ৫. অ্যাডমিনের মাধ্যমে অর্ডারের স্ট্যাটাস ম্যানুয়ালি আপডেট করা (PATCH /api/orders/:orderNumber/status)
 */
export async function updateOrderStatusByAdmin(
  identifier,
  { orderStatus, adminNote },
  req = null
) {
  const cleanId = String(identifier).trim();

  const existingOrder = await prisma.order.findFirst({
    where: {
      OR: [{ orderNumber: cleanId.toUpperCase() }, { id: cleanId }],
    },
  });

  if (!existingOrder) {
    throw new ApiError(
      404,
      `অর্ডার '${cleanId}' খুঁজে পাওয়া যায়নি।`,
      null,
      "ORDER_NOT_FOUND"
    );
  }

  const updateData = {
    orderStatus,
  };

  if (adminNote !== undefined) {
    updateData.adminNote = adminNote;
  }

  if (orderStatus === "COMPLETED" && !existingOrder.completedAt) {
    updateData.completedAt = new Date();
  }

  const updatedOrder = await prisma.order.update({
    where: { id: existingOrder.id },
    data: updateData,
    include: {
      items: true,
      payment: true,
      delivery: true,
    },
  });

  await logAuditEvent({
    req,
    action: "ORDER_STATUS_UPDATED",
    entityType: "ORDER",
    entityId: updatedOrder.orderNumber,
    metadata: {
      previousStatus: existingOrder.orderStatus,
      newStatus: updatedOrder.orderStatus,
      adminNote: adminNote || null,
    },
  });

  return formatOrderResponse(updatedOrder, true);
}
