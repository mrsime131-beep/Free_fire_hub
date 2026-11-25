const prisma = require('../config/prisma');
const env = require('../config/env');
const { AppError } = require('../middlewares/error.middleware');
const {
  ORDER_STATUS,
  PAYMENT_STATUS,
  DELIVERY_STATUS,
  assertValidStatusTransition,
  buildStatusHistoryPayload,
} = require('../utils/stateMachine');
const {
  logAdminOrderAction,
  getOrderAuditLogs,
} = require('./audit.service');
const { dispatchNotification } = require('./notification.service');
const { approveManualRetry } = require('./delivery/retry.manager');
const { processOrderDelivery } = require('./delivery/delivery.engine');
const { buildFiveStepTrackingTimeline } = require('./order.service');

/**
 * ১. অ্যাডমিন ড্যাশবোর্ডের সারসংক্ষেপ ও রিয়েল-টাইম অ্যানালিটিক্স (GET /api/admin/dashboard/metrics)
 */
const getDashboardMetrics = async () => {
  const now = new Date();
  const startOfToday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0)
  );

  const [
    totalOrders,
    todayOrders,
    pendingPaymentReviewCount,
    completedOrdersCount,
    failedOrRetryDeliveriesCount,
    cancelledOrRefundedCount,
    revenueAgg,
    todayRevenueAgg,
  ] = await Promise.all([
    prisma.order.count(),
    prisma.order.count({
      where: { createdAt: { gte: startOfToday } },
    }),
    prisma.order.count({
      where: {
        OR: [
          { orderStatus: ORDER_STATUS.PAYMENT_REVIEW },
          { paymentStatus: PAYMENT_STATUS.SUBMITTED },
        ],
      },
    }),
    prisma.order.count({
      where: { orderStatus: ORDER_STATUS.COMPLETED },
    }),
    prisma.order.count({
      where: {
        OR: [
          { orderStatus: ORDER_STATUS.FAILED },
          { deliveryStatus: DELIVERY_STATUS.FAILED },
          { deliveryStatus: DELIVERY_STATUS.RETRY_PENDING },
        ],
      },
    }),
    prisma.order.count({
      where: {
        orderStatus: {
          in: [
            ORDER_STATUS.CANCELLED,
            ORDER_STATUS.REFUND_PENDING,
            ORDER_STATUS.REFUNDED,
          ],
        },
      },
    }),
    prisma.order.aggregate({
      where: {
        orderStatus: ORDER_STATUS.COMPLETED,
        paymentStatus: PAYMENT_STATUS.VERIFIED,
      },
      _sum: {
        finalPayableAmount: true,
        diamondQuantity: true,
      },
    }),
    prisma.order.aggregate({
      where: {
        orderStatus: ORDER_STATUS.COMPLETED,
        paymentStatus: PAYMENT_STATUS.VERIFIED,
        createdAt: { gte: startOfToday },
      },
      _sum: {
        finalPayableAmount: true,
      },
    }),
  ]);

  return {
    deliveryMode: env.DELIVERY_MODE,
    counts: {
      totalOrders,
      todayOrders,
      pendingPaymentReviewCount,
      completedOrdersCount,
      failedOrRetryDeliveriesCount,
      cancelledOrRefundedCount,
    },
    revenue: {
      currency: 'BDT',
      totalVerifiedRevenue: Number(revenueAgg._sum?.finalPayableAmount || 0),
      todayVerifiedRevenue: Number(
        todayRevenueAgg._sum?.finalPayableAmount || 0
      ),
      totalDiamondsDelivered: Number(revenueAgg._sum?.diamondQuantity || 0),
    },
    generatedAt: new Date().toISOString(),
  };
};

/**
 * ২. অ্যাডমিন অর্ডার লিস্ট, অ্যাডভান্সড সার্চ ও ফিল্টারিং (GET /api/admin/orders)
 */
const getAdminOrdersList = async ({
  page = 1,
  limit = 20,
  search = null,
  orderStatus = null,
  paymentStatus = null,
  deliveryStatus = null,
  paymentMethod = null,
  dateFrom = null,
  dateTo = null,
} = {}) => {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const skip = (safePage - 1) * safeLimit;

  const where = {};

  if (orderStatus) {
    where.orderStatus = String(orderStatus).trim().toUpperCase();
  }

  if (paymentStatus) {
    where.paymentStatus = String(paymentStatus).trim().toUpperCase();
  }

  if (deliveryStatus) {
    where.deliveryStatus = String(deliveryStatus).trim().toUpperCase();
  }

  if (paymentMethod) {
    where.paymentMethod = String(paymentMethod).trim().toUpperCase();
  }

  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom && !isNaN(Date.parse(dateFrom))) {
      where.createdAt.gte = new Date(dateFrom);
    }
    if (dateTo && !isNaN(Date.parse(dateTo))) {
      where.createdAt.lte = new Date(dateTo);
    }
  }

  if (search && String(search).trim().length > 0) {
    const q = String(search).trim();
    where.OR = [
      { orderNumber: { contains: q.toUpperCase() } },
      { playerUid: { contains: q } },
      { verifiedPlayerName: { contains: q, mode: 'insensitive' } },
      { paymentReference: { contains: q.toUpperCase() } },
      { customerPhone: { contains: q } },
      { customerEmail: { contains: q, mode: 'insensitive' } },
      {
        payment: {
          transactionReference: { contains: q.toUpperCase() },
        },
      },
      {
        payment: {
          senderNumber: { contains: q },
        },
      },
    ];
  }

  const [orders, totalCount] = await Promise.all([
    prisma.order.findMany({
      where,
      include: {
        payment: true,
        delivery: {
          include: {
            supplier: {
              select: {
                code: true,
                name: true,
                adapterType: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: safeLimit,
    }),
    prisma.order.count({ where }),
  ]);

  return {
    orders,
    pagination: {
      page: safePage,
      limit: safeLimit,
      totalCount,
      totalPages: Math.ceil(totalCount / safeLimit) || 1,
    },
  };
};

/**
 * ৩. অ্যাডমিনের জন্য নির্দিষ্ট অর্ডারের সম্পূর্ণ ৩৬০-ডিগ্রি তথ্য (GET /api/admin/orders/:orderId)
 */
const getAdminOrderDetails = async (orderIdentifier) => {
  const cleanId = String(orderIdentifier || '').trim();

  const order = await prisma.order.findFirst({
    where: {
      OR: [{ id: cleanId }, { orderNumber: cleanId.toUpperCase() }],
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
        },
      },
      product: true,
      payment: true,
      delivery: {
        include: {
          supplier: {
            select: {
              id: true,
              code: true,
              name: true,
              adapterType: true,
            },
          },
          attempts: {
            orderBy: { attemptNumber: 'desc' },
          },
        },
      },
      statusHistory: {
        orderBy: { createdAt: 'desc' },
      },
      notifications: {
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!order) {
    throw new AppError('অর্ডারটি খুঁজে পাওয়া যায়নি।', 404, 'ORDER_NOT_FOUND');
  }

  const auditLogs = await getOrderAuditLogs(order.id);
  const timeline = buildFiveStepTrackingTimeline(order);

  return {
    order,
    timeline,
    auditLogs,
  };
};

/**
 * ৪. অ্যাডমিন কর্তৃক নিয়ম মেনে অর্ডার স্ট্যাটাস আপডেট (PATCH /api/admin/orders/:orderId/status)
 */
const updateOrderStatusByAdmin = async ({
  orderIdentifier,
  orderStatus = null,
  paymentStatus = null,
  deliveryStatus = null,
  reason = 'Status updated by Admin',
  adminUser,
  req = null,
}) => {
  const cleanId = String(orderIdentifier || '').trim();

  const order = await prisma.order.findFirst({
    where: {
      OR: [{ id: cleanId }, { orderNumber: cleanId.toUpperCase() }],
    },
    include: {
      payment: true,
      delivery: true,
    },
  });

  if (!order) {
    throw new AppError('অর্ডারটি খুঁজে পাওয়া যায়নি।', 404, 'ORDER_NOT_FOUND');
  }

  // স্টেট মেশিন দিয়ে যাচাই করা (যাতে ভুয়া COMPLETED বা অবৈধ ট্রানজিশন না হয়)
  const transition = assertValidStatusTransition({
    currentOrderStatus: order.orderStatus,
    currentPaymentStatus: order.paymentStatus,
    currentDeliveryStatus: order.deliveryStatus,
    nextOrderStatus: orderStatus,
    nextPaymentStatus: paymentStatus,
    nextDeliveryStatus: deliveryStatus,
  });

  if (!transition.hasChanged) {
    return {
      changed: false,
      order,
      timeline: buildFiveStepTrackingTimeline(order),
    };
  }

  const previousState = {
    orderStatus: order.orderStatus,
    paymentStatus: order.paymentStatus,
    deliveryStatus: order.deliveryStatus,
  };

  const updatedOrder = await prisma.$transaction(async (tx) => {
    if (paymentStatus && order.payment) {
      await tx.payment.update({
        where: { orderId: order.id },
        data: {
          status: transition.paymentStatus,
          reviewNotes: reason,
        },
      });
    }

    if (deliveryStatus && order.delivery) {
      await tx.delivery.update({
        where: { orderId: order.id },
        data: {
          status: transition.deliveryStatus,
        },
      });
    }

    const savedOrder = await tx.order.update({
      where: { id: order.id },
      data: {
        orderStatus: transition.orderStatus,
        paymentStatus: transition.paymentStatus,
        deliveryStatus: transition.deliveryStatus,
        ...(transition.orderStatus === ORDER_STATUS.COMPLETED
          ? { completedAt: new Date() }
          : {}),
        ...(transition.orderStatus === ORDER_STATUS.CANCELLED
          ? { cancelledAt: new Date() }
          : {}),
        ...(transition.orderStatus === ORDER_STATUS.REFUNDED
          ? { refundedAt: new Date() }
          : {}),
      },
      include: {
        payment: true,
        delivery: true,
      },
    });

    await tx.orderStatusHistory.create({
      data: buildStatusHistoryPayload({
        orderId: order.id,
        previousOrderStatus: order.orderStatus,
        newOrderStatus: transition.orderStatus,
        previousPaymentStatus: order.paymentStatus,
        newPaymentStatus: transition.paymentStatus,
        previousDeliveryStatus: order.deliveryStatus,
        newDeliveryStatus: transition.deliveryStatus,
        changedBy: adminUser?.email || 'ADMIN',
        reason,
      }),
    });

    await logAdminOrderAction(
      {
        adminUser,
        action: 'ORDER_STATUS_UPDATED',
        order,
        previousState,
        newState: {
          orderStatus: transition.orderStatus,
          paymentStatus: transition.paymentStatus,
          deliveryStatus: transition.deliveryStatus,
        },
        reason,
        req,
      },
      tx
    );

    return savedOrder;
  });

  return {
    changed: true,
    order: updatedOrder,
    timeline: buildFiveStepTrackingTimeline(updatedOrder),
  };
};

/**
 * ৫. অ্যাডমিন কর্তৃক অর্ডার বাতিল করা (POST /api/admin/orders/:orderId/cancel)
 */
const cancelOrderByAdmin = async ({
  orderIdentifier,
  reason = 'Cancelled by Admin',
  adminUser,
  req = null,
}) => {
  const cleanId = String(orderIdentifier || '').trim();

  const order = await prisma.order.findFirst({
    where: {
      OR: [{ id: cleanId }, { orderNumber: cleanId.toUpperCase() }],
    },
    include: {
      payment: true,
      delivery: true,
    },
  });

  if (!order) {
    throw new AppError('অর্ডারটি খুঁজে পাওয়া যায়নি।', 404, 'ORDER_NOT_FOUND');
  }

  if (
    order.orderStatus === ORDER_STATUS.COMPLETED ||
    order.deliveryStatus === DELIVERY_STATUS.COMPLETED
  ) {
    throw new AppError(
      'ডায়মন্ড ডেলিভারি ইতিমধ্যে সম্পন্ন হয়ে যাওয়ায় এই অর্ডারটি বাতিল (Cancel) করা সম্ভব নয়।',
      400,
      'CANCEL_COMPLETED_ORDER_BLOCKED'
    );
  }

  if (order.orderStatus === ORDER_STATUS.CANCELLED) {
    return {
      alreadyCancelled: true,
      order,
      timeline: buildFiveStepTrackingTimeline(order),
    };
  }

  assertValidStatusTransition({
    currentOrderStatus: order.orderStatus,
    currentPaymentStatus: order.paymentStatus,
    currentDeliveryStatus: order.deliveryStatus,
    nextOrderStatus: ORDER_STATUS.CANCELLED,
    nextPaymentStatus: order.paymentStatus,
    nextDeliveryStatus: order.deliveryStatus,
  });

  const cancelledOrder = await prisma.$transaction(async (tx) => {
    const saved = await tx.order.update({
      where: { id: order.id },
      data: {
        orderStatus: ORDER_STATUS.CANCELLED,
        cancelledAt: new Date(),
      },
      include: {
        payment: true,
        delivery: true,
      },
    });

    await tx.orderStatusHistory.create({
      data: buildStatusHistoryPayload({
        orderId: order.id,
        previousOrderStatus: order.orderStatus,
        newOrderStatus: ORDER_STATUS.CANCELLED,
        previousPaymentStatus: order.paymentStatus,
        newPaymentStatus: order.paymentStatus,
        previousDeliveryStatus: order.deliveryStatus,
        newDeliveryStatus: order.deliveryStatus,
        changedBy: adminUser?.email || 'ADMIN',
        reason,
      }),
    });

    await logAdminOrderAction(
      {
        adminUser,
        action: 'ORDER_CANCELLED',
        order,
        newState: {
          orderStatus: ORDER_STATUS.CANCELLED,
        },
        reason,
        req,
      },
      tx
    );

    return saved;
  });

  await dispatchNotification({
    order: cancelledOrder,
    eventType: 'ORDER_CANCELLED',
    title: `অর্ডার বাতিল করা হয়েছে (${cancelledOrder.orderNumber})`,
    message: `আপনার অর্ডারটি বাতিল করা হয়েছে। কারণ: ${reason}। প্রয়োজনে সাপোর্টে (${env.SUPPORT_WHATSAPP}) যোগাযোগ করুন।`,
    includeTelegram: true,
    includeEmail: true,
  });

  return {
    alreadyCancelled: false,
    order: cancelledOrder,
    timeline: buildFiveStepTrackingTimeline(cancelledOrder),
  };
};

/**
 * ৬. অ্যাডমিন কর্তৃক অর্ডার রিফান্ড সম্পন্ন করা (POST /api/admin/orders/:orderId/refund)
 */
const refundOrderByAdmin = async ({
  orderIdentifier,
  reason = 'Refunded by Admin due to delivery failure',
  refundReference = null,
  adminUser,
  req = null,
}) => {
  const cleanId = String(orderIdentifier || '').trim();

  const order = await prisma.order.findFirst({
    where: {
      OR: [{ id: cleanId }, { orderNumber: cleanId.toUpperCase() }],
    },
    include: {
      payment: true,
      delivery: true,
    },
  });

  if (!order) {
    throw new AppError('অর্ডারটি খুঁজে পাওয়া যায়নি।', 404, 'ORDER_NOT_FOUND');
  }

  if (order.orderStatus === ORDER_STATUS.REFUNDED) {
    return {
      alreadyRefunded: true,
      order,
      timeline: buildFiveStepTrackingTimeline(order),
    };
  }

  if (order.paymentStatus !== PAYMENT_STATUS.VERIFIED) {
    throw new AppError(
      `যে অর্ডারের পেমেন্ট ভেরিফাইড (VERIFIED) নয়, সেটি রিফান্ড করা যাবে না। বর্তমান পেমেন্ট স্ট্যাটাস: ${order.paymentStatus}`,
      400,
      'REFUND_UNVERIFIED_PAYMENT_BLOCKED'
    );
  }

  const now = new Date();

  const refundedOrder = await prisma.$transaction(async (tx) => {
    if (order.payment) {
      await tx.payment.update({
        where: { orderId: order.id },
        data: {
          status: PAYMENT_STATUS.REFUNDED,
          refundedAt: now,
          reviewNotes: refundReference
            ? `${reason} (Refund Ref: ${refundReference})`
            : reason,
        },
      });
    }

    const saved = await tx.order.update({
      where: { id: order.id },
      data: {
        orderStatus: ORDER_STATUS.REFUNDED,
        paymentStatus: PAYMENT_STATUS.REFUNDED,
        refundedAt: now,
      },
      include: {
        payment: true,
        delivery: true,
      },
    });

    await tx.orderStatusHistory.create({
      data: buildStatusHistoryPayload({
        orderId: order.id,
        previousOrderStatus: order.orderStatus,
        newOrderStatus: ORDER_STATUS.REFUNDED,
        previousPaymentStatus: order.paymentStatus,
        newPaymentStatus: PAYMENT_STATUS.REFUNDED,
        previousDeliveryStatus: order.deliveryStatus,
        newDeliveryStatus: order.deliveryStatus,
        changedBy: adminUser?.email || 'ADMIN',
        reason: refundReference
          ? `${reason} (Refund Reference: ${refundReference})`
          : reason,
      }),
    });

    await logAdminOrderAction(
      {
        adminUser,
        action: 'ORDER_REFUNDED',
        order,
        newState: {
          orderStatus: ORDER_STATUS.REFUNDED,
          paymentStatus: PAYMENT_STATUS.REFUNDED,
          refundReference,
        },
        reason,
        req,
      },
      tx
    );

    return saved;
  });

  await dispatchNotification({
    order: refundedOrder,
    eventType: 'ORDER_REFUNDED',
    title: `অর্ডার রিফান্ড সম্পন্ন হয়েছে (${refundedOrder.orderNumber})`,
    message: `আপনার অর্ডারের ৳${refundedOrder.finalPayableAmount} রিফান্ড করা হয়েছে। কারণ: ${reason}${
      refundReference ? ` (Ref: ${refundReference})` : ''
    }।`,
    includeTelegram: true,
    includeEmail: true,
  });

  return {
    alreadyRefunded: false,
    order: refundedOrder,
    timeline: buildFiveStepTrackingTimeline(refundedOrder),
  };
};

/**
 * ৭. অ্যাডমিন কর্তৃক ব্যর্থ ডেলিভারি ম্যানুয়ালি রিট্রাই ও এক্সিকিউট করা (POST /api/admin/orders/:orderId/retry-delivery)
 */
const triggerAdminManualRetry = async ({
  orderIdentifier,
  reason = 'Manual delivery retry triggered by Admin',
  executeImmediately = true,
  adminUser,
  req = null,
}) => {
  const retryApproval = await approveManualRetry({
    orderIdentifier,
    adminUser,
    reason,
    req,
  });

  let deliveryOutcome = null;
  if (executeImmediately) {
    deliveryOutcome = await processOrderDelivery(retryApproval.order.id, {
      triggeredBy: adminUser?.email || 'ADMIN_MANUAL_RETRY',
    });
  }

  const refreshedOrder = await prisma.order.findUnique({
    where: { id: retryApproval.order.id },
    include: {
      payment: true,
      delivery: {
        include: {
          attempts: {
            orderBy: { attemptNumber: 'desc' },
          },
        },
      },
    },
  });

  return {
    retryApproved: true,
    executedImmediately: Boolean(executeImmediately),
    deliveryOutcome,
    order: refreshedOrder,
    timeline: buildFiveStepTrackingTimeline(refreshedOrder),
  };
};

module.exports = {
  getDashboardMetrics,
  getAdminOrdersList,
  getAdminOrderDetails,
  updateOrderStatusByAdmin,
  cancelOrderByAdmin,
  refundOrderByAdmin,
  triggerAdminManualRetry,
};
