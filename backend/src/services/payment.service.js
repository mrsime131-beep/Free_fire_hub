import { prisma } from "../config/db.js";
import { ApiError } from "../utils/apiResponse.js";
import { logger } from "../utils/logger.js";
import { logAuditEvent } from "./audit.service.js";
import { formatOrderResponse } from "./order.service.js";
import { executeOrderDelivery } from "./delivery.service.js";

/**
 * অর্ডার নম্বর (FFH-20261124-000001), Order UUID অথবা Payment UUID দিয়ে অর্ডার ও পেমেন্ট রেকর্ড খুঁজে বের করার হেল্পার
 */
async function findOrderWithPayment(identifier) {
  const cleanId = String(identifier).trim();

  const order = await prisma.order.findFirst({
    where: {
      OR: [
        { orderNumber: cleanId.toUpperCase() },
        { id: cleanId },
        { payment: { id: cleanId } },
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
      `অর্ডার বা পেমেন্ট রেকর্ড ('${cleanId}') খুঁজে পাওয়া যায়নি।`,
      null,
      "ORDER_OR_PAYMENT_NOT_FOUND"
    );
  }

  return order;
}

/**
 * ১. কাস্টমারের বিকাশ/নগদ/রকেট পেমেন্ট তথ্য (Sender Number ও TrxID) জমা নেওয়ার সার্ভিস
 * - ডুপ্লিকেট Transaction ID (TrxID) কঠোরভাবে ব্লক করবে
 * - আগে রিজেক্ট হওয়া পেমেন্টে সঠিক TrxID দিয়ে পুনরায় সাবমিট করার সুযোগ দেবে
 */
export async function submitOrderPayment(orderIdentifier, payload, req = null) {
  const targetId = orderIdentifier || payload.orderIdentifier;

  if (!targetId) {
    throw new ApiError(
      400,
      "পেমেন্ট জমা দেওয়ার জন্য Order Number অবশ্যই দিতে হবে।",
      null,
      "ORDER_NUMBER_REQUIRED"
    );
  }

  const order = await findOrderWithPayment(targetId);

  // ১. অর্ডার ইতিমধ্যে সম্পন্ন বা বাতিল হয়ে থাকলে নতুন পেমেন্ট নেওয়া যাবে না
  if (["COMPLETED", "CANCELLED", "REFUNDED"].includes(order.orderStatus)) {
    throw new ApiError(
      400,
      `এই অর্ডারটি ইতিমধ্যে ${order.orderStatus} অবস্থায় রয়েছে। এতে নতুন পেমেন্ট সাবমিট করা যাবে না।`,
      null,
      "INVALID_ORDER_STATE_FOR_PAYMENT"
    );
  }

  if (order.paymentStatus === "VERIFIED") {
    throw new ApiError(
      400,
      "এই অর্ডারের পেমেন্ট ইতিমধ্যে ভেরিফাই (VERIFIED) করা হয়েছে।",
      null,
      "PAYMENT_ALREADY_VERIFIED"
    );
  }

  const cleanTrxId = String(payload.transactionReference).trim().toUpperCase();
  const cleanSenderNumber = String(payload.senderNumber).trim();
  const resolvedPaymentMethod = payload.paymentMethod || order.paymentMethod;

  // ২. ডুপ্লিকেট TrxID চেক: অন্য কোনো অর্ডারে এই TrxID ব্যবহৃত হয়েছে কি না তা যাচাই করা
  const existingTrxPayment = await prisma.payment.findUnique({
    where: { transactionReference: cleanTrxId },
    select: { id: true, orderId: true },
  });

  if (existingTrxPayment && existingTrxPayment.orderId !== order.id) {
    logger.warn(
      `Blocked duplicate TrxID submission: ${cleanTrxId} on Order ${order.orderNumber}`,
      { existingOrderId: existingTrxPayment.orderId },
      "PAYMENT_SECURITY"
    );
    throw new ApiError(
      409,
      "এই Transaction ID (TrxID) ইতিমধ্যে অন্য একটি অর্ডারে ব্যবহৃত হয়েছে। অনুগ্রহ করে সঠিক এবং নতুন TrxID দিন।",
      null,
      "DUPLICATE_TRANSACTION_ID"
    );
  }

  const now = new Date();

  // ৩. Atomic Transaction-এ Payment এবং Order স্ট্যাটাস আপডেট করা
  const updatedOrder = await prisma.$transaction(async (tx) => {
    await tx.payment.upsert({
      where: { orderId: order.id },
      create: {
        orderId: order.id,
        paymentMethod: resolvedPaymentMethod,
        amount: order.payableAmount,
        senderNumber: cleanSenderNumber,
        transactionReference: cleanTrxId,
        status: "UNDER_REVIEW",
        submittedAt: now,
      },
      update: {
        paymentMethod: resolvedPaymentMethod,
        senderNumber: cleanSenderNumber,
        transactionReference: cleanTrxId,
        status: "UNDER_REVIEW",
        rejectionReason: null,
        submittedAt: now,
      },
    });

    return tx.order.update({
      where: { id: order.id },
      data: {
        paymentMethod: resolvedPaymentMethod,
        paymentStatus: "UNDER_REVIEW",
        orderStatus: "PAYMENT_REVIEW",
        guestPhone: order.guestPhone || cleanSenderNumber,
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
    userId: req?.user?.id || order.userId || null,
    action: "PAYMENT_SUBMITTED",
    entityType: "PAYMENT",
    entityId: updatedOrder.orderNumber,
    metadata: {
      orderId: updatedOrder.id,
      orderNumber: updatedOrder.orderNumber,
      paymentMethod: resolvedPaymentMethod,
      senderNumber: cleanSenderNumber,
      transactionReference: cleanTrxId,
      amount: updatedOrder.payableAmount,
    },
  });

  logger.info(
    `Payment submitted for Order ${updatedOrder.orderNumber} — Method: ${resolvedPaymentMethod}, TrxID: ${cleanTrxId}`,
    null,
    "PAYMENT_SERVICE"
  );

  return formatOrderResponse(updatedOrder, req?.user?.role === "ADMIN");
}

/**
 * ২. অ্যাডমিনের মাধ্যমে পেমেন্ট ভেরিফিকেশন সার্ভিস (VERIFIED / REJECTED / REFUNDED)
 * - পেমেন্ট VERIFIED হওয়ার সাথে সাথে স্বয়ংক্রিয়ভাবে executeOrderDelivery() কল করে ডায়মন্ড ডেলিভারি সম্পন্ন করবে।
 */
export async function verifyOrderPaymentByAdmin(identifier, payload, req = null) {
  const {
    status,
    rejectionReason = null,
    adminNote,
    autoDeliver = true,
  } = payload;

  const order = await findOrderWithPayment(identifier);

  if (!order.payment) {
    throw new ApiError(
      400,
      "এই অর্ডারের কোনো পেমেন্ট রেকর্ড পাওয়া যায়নি।",
      null,
      "PAYMENT_RECORD_MISSING"
    );
  }

  // যদি ইতিমধ্যে VERIFIED এবং DELIVERED হয়ে থাকে, তবে পুনরায় ভেরিফাই না করে বর্তমান স্ট্যাটাস রিটার্ন করা
  if (
    status === "VERIFIED" &&
    order.paymentStatus === "VERIFIED" &&
    order.orderStatus === "COMPLETED"
  ) {
    return formatOrderResponse(order, true);
  }

  const now = new Date();
  const adminUserId = req?.user?.id || null;

  // ক) যদি অ্যাডমিন পেমেন্ট VERIFIED করেন
  if (status === "VERIFIED") {
    if (!order.payment.transactionReference) {
      throw new ApiError(
        400,
        "Transaction ID (TrxID) ছাড়া পেমেন্ট VERIFIED করা যাবে না।",
        null,
        "TRX_ID_MISSING_FOR_VERIFICATION"
      );
    }

    const verifiedOrder = await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: order.payment.id },
        data: {
          status: "VERIFIED",
          rejectionReason: null,
          verifiedBy: adminUserId,
          verifiedAt: now,
        },
      });

      return tx.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: "VERIFIED",
          orderStatus: "PAID",
          ...(adminNote !== undefined ? { adminNote } : {}),
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
      userId: adminUserId,
      action: "PAYMENT_VERIFIED",
      entityType: "PAYMENT",
      entityId: verifiedOrder.orderNumber,
      metadata: {
        orderId: verifiedOrder.id,
        orderNumber: verifiedOrder.orderNumber,
        transactionReference: verifiedOrder.payment.transactionReference,
        amount: verifiedOrder.payableAmount,
        autoDeliver,
      },
    });

    logger.info(
      `Payment VERIFIED by Admin for Order ${verifiedOrder.orderNumber} (TrxID: ${verifiedOrder.payment.transactionReference})`,
      null,
      "PAYMENT_SERVICE"
    );

    // পেমেন্ট VERIFIED হওয়ার সাথে সাথে অটোমেটিক ডায়মন্ড ডেলিভারি ট্রিগার
    if (autoDeliver) {
      const deliveredOrder = await executeOrderDelivery(
        verifiedOrder.orderNumber,
        {
          req,
          triggeredBy: "AUTO_ON_PAYMENT_VERIFIED",
        }
      );
      return deliveredOrder;
    }

    return formatOrderResponse(verifiedOrder, true);
  }

  // খ) যদি অ্যাডমিন পেমেন্ট REJECTED করেন
  if (status === "REJECTED") {
    const rejectedOrder = await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: order.payment.id },
        data: {
          status: "REJECTED",
          rejectionReason:
            rejectionReason || "ভুল Transaction ID অথবা পেমেন্ট পাওয়া যায়নি।",
          verifiedBy: adminUserId,
          verifiedAt: now,
        },
      });

      return tx.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: "REJECTED",
          orderStatus: "FAILED",
          ...(adminNote !== undefined ? { adminNote } : {}),
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
      userId: adminUserId,
      action: "PAYMENT_REJECTED",
      entityType: "PAYMENT",
      entityId: rejectedOrder.orderNumber,
      metadata: {
        orderId: rejectedOrder.id,
        orderNumber: rejectedOrder.orderNumber,
        transactionReference: rejectedOrder.payment.transactionReference,
        rejectionReason,
      },
    });

    logger.warn(
      `Payment REJECTED by Admin for Order ${rejectedOrder.orderNumber} — Reason: ${rejectionReason}`,
      null,
      "PAYMENT_SERVICE"
    );

    return formatOrderResponse(rejectedOrder, true);
  }

  // গ) যদি অ্যাডমিন পেমেন্ট REFUNDED করেন
  const refundedOrder = await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: order.payment.id },
      data: {
        status: "REFUNDED",
        verifiedBy: adminUserId,
        verifiedAt: now,
      },
    });

    return tx.order.update({
      where: { id: order.id },
      data: {
        paymentStatus: "REFUNDED",
        orderStatus: "REFUNDED",
        ...(adminNote !== undefined ? { adminNote } : {}),
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
    userId: adminUserId,
    action: "PAYMENT_REFUNDED",
    entityType: "PAYMENT",
    entityId: refundedOrder.orderNumber,
    metadata: {
      orderId: refundedOrder.id,
      orderNumber: refundedOrder.orderNumber,
      amount: refundedOrder.payableAmount,
    },
  });

  return formatOrderResponse(refundedOrder, true);
}

/**
 * ৩. নির্দিষ্ট অর্ডারের পেমেন্ট স্ট্যাটাস ও বিস্তারিত তথ্য চেক করা (GET /api/payments/:orderNumber)
 */
export async function getPaymentByOrderIdentifier(
  identifier,
  currentUser = null
) {
  const order = await findOrderWithPayment(identifier);
  const isAdmin = currentUser?.role === "ADMIN";

  return {
    orderNumber: order.orderNumber,
    orderStatus: order.orderStatus,
    payableAmount: order.payableAmount,
    playerUid: order.playerUid,
    playerName: order.playerName,
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
          ...(isAdmin ? { verifiedBy: order.payment.verifiedBy } : {}),
        }
      : null,
  };
}

/**
 * ৪. অ্যাডমিন প্যানেলের জন্য সকল পেমেন্ট তালিকা, ফিল্টারিং এবং TrxID সার্চ (GET /api/payments)
 */
export async function getAllPaymentsForAdmin(query = {}) {
  const page = Math.max(1, Number(query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(query.limit || 20)));
  const skip = (page - 1) * limit;

  const whereClause = {};

  if (query.status) {
    whereClause.status = query.status;
  }

  if (query.paymentMethod) {
    whereClause.paymentMethod = query.paymentMethod;
  }

  if (query.search) {
    const cleanSearch = String(query.search).trim();
    whereClause.OR = [
      { transactionReference: { contains: cleanSearch, mode: "insensitive" } },
      { senderNumber: { contains: cleanSearch, mode: "insensitive" } },
      {
        order: {
          orderNumber: { contains: cleanSearch, mode: "insensitive" },
        },
      },
      {
        order: {
          playerUid: { contains: cleanSearch, mode: "insensitive" },
        },
      },
    ];
  }

  const [payments, totalCount] = await Promise.all([
    prisma.payment.findMany({
      where: whereClause,
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            playerUid: true,
            playerName: true,
            server: true,
            payableAmount: true,
            orderStatus: true,
            createdAt: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.payment.count({ where: whereClause }),
  ]);

  return {
    payments,
    meta: {
      page,
      limit,
      total: totalCount,
      totalPages: Math.ceil(totalCount / limit) || 1,
    },
  };
}
