const prisma = require('../../config/prisma');
const env = require('../../config/env');
const { AppError } = require('../../middlewares/error.middleware');
const {
  ORDER_STATUS,
  PAYMENT_STATUS,
  DELIVERY_STATUS,
  assertValidStatusTransition,
  buildStatusHistoryPayload,
} = require('../../utils/stateMachine');
const DemoSupplierAdapter = require('./adapters/demo.adapter');
const HttpSupplierAdapter = require('./adapters/http.adapter');
const {
  handleDeliveryFailure,
  getDueRetryDeliveries,
} = require('./retry.manager');
const { notifyDeliveryCompleted } = require('../notification.service');

// ডেলিভারি লক টাইমআউট (২ মিনিট) - কোনো প্রসেস ক্র্যাশ করলেও যেন অর্ডার চিরতরে লক হয়ে না থাকে
const DELIVERY_LOCK_TIMEOUT_MS = 2 * 60 * 1000;

/**
 * ১. সাপ্লায়ার কনফিগারেশন অনুযায়ী সঠিক Adapter (DEMO অথবা LIVE HTTP) নির্বাচন করা
 */
const createSupplierAdapter = (supplier) => {
  const effectiveMode =
    env.DELIVERY_MODE === 'LIVE' && supplier?.adapterType === 'LIVE'
      ? 'LIVE'
      : 'DEMO';

  if (effectiveMode === 'LIVE') {
    return new HttpSupplierAdapter(supplier);
  }

  return new DemoSupplierAdapter(
    supplier || {
      id: null,
      code: 'DEMO_SUPPLIER',
      name: 'FreeFireHub Safe Demo Supplier Engine',
      adapterType: 'DEMO',
      isActive: true,
      timeoutMs: env.SUPPLIER_TIMEOUT_MS || 12000,
    }
  );
};

/**
 * ২. অর্ডারের প্রোডাক্টের জন্য সক্রিয় সাপ্লায়ার এবং প্রোডাক্ট ম্যাপিং খুঁজে বের করা
 */
const resolveActiveSupplierAndMapping = async (order) => {
  const preferredMode = env.DELIVERY_MODE === 'LIVE' ? 'LIVE' : 'DEMO';

  // প্রথমে প্রোডাক্টের সাথে ম্যাপ করা অ্যাক্টিভ সাপ্লায়ার খোঁজা
  const supplierProduct = await prisma.supplierProduct.findFirst({
    where: {
      productId: order.productId,
      isActive: true,
      supplier: {
        isActive: true,
      },
    },
    include: {
      supplier: true,
    },
    orderBy: {
      supplier: {
        priority: 'asc',
      },
    },
  });

  if (supplierProduct && supplierProduct.supplier) {
    return {
      supplier: supplierProduct.supplier,
      supplierProduct,
    };
  }

  // যদি নির্দিষ্ট প্রোডাক্ট ম্যাপিং না থাকে, তবে ডিফল্ট অ্যাক্টিভ সাপ্লায়ার খোঁজা
  const fallbackSupplier = await prisma.supplier.findFirst({
    where: {
      isActive: true,
      ...(preferredMode === 'DEMO' ? { adapterType: 'DEMO' } : {}),
    },
    orderBy: {
      priority: 'asc',
    },
  });

  if (fallbackSupplier) {
    return {
      supplier: fallbackSupplier,
      supplierProduct: null,
    };
  }

  // যদি ডাটাবেসে এখনো কোনো সাপ্লায়ার সিড করা না থাকে এবং সিস্টেম DEMO মোডে থাকে
  if (preferredMode === 'DEMO') {
    const autoDemoSupplier = await prisma.supplier.upsert({
      where: { code: 'DEMO_SUPPLIER' },
      update: { isActive: true },
      create: {
        code: 'DEMO_SUPPLIER',
        name: 'FreeFireHub Safe Demo Supplier Engine (DEMO MODE)',
        adapterType: 'DEMO',
        isActive: true,
        priority: 1,
      },
    });

    return {
      supplier: autoDemoSupplier,
      supplierProduct: null,
    };
  }

  throw new AppError(
    'ডেলিভারি করার জন্য কোনো সক্রিয় Supplier কনফিগারেশন খুঁজে পাওয়া যায়নি।',
    503,
    'NO_ACTIVE_SUPPLIER_FOUND'
  );
};

/**
 * ৩. ডুপ্লিকেট ডেলিভারি রিকোয়েস্ট প্রতিরোধের জন্য অ্যাটমিক ডাটাবেস লক অর্জন করা (Part 6)
 */
const acquireDeliveryLock = async (order, triggeredBy = 'SYSTEM') => {
  const now = new Date();
  const expiredLockThreshold = new Date(now.getTime() - DELIVERY_LOCK_TIMEOUT_MS);
  const workerId = `${triggeredBy}_${process.pid}_${Date.now()}`;

  return prisma.$transaction(async (tx) => {
    const freshOrder = await tx.order.findUnique({
      where: { id: order.id },
      include: {
        delivery: {
          include: {
            attempts: {
              orderBy: { attemptNumber: 'desc' },
              take: 1,
            },
          },
        },
      },
    });

    if (!freshOrder) {
      throw new AppError('অর্ডারটি খুঁজে পাওয়া যায়নি।', 404, 'ORDER_NOT_FOUND');
    }

    // নিরাপত্তা চেক ১: পেমেন্ট VERIFIED না হলে কখনোই ডেলিভারি প্রসেস হবে না
    if (freshOrder.paymentStatus !== PAYMENT_STATUS.VERIFIED) {
      throw new AppError(
        `পেমেন্ট ভেরিফাইড (VERIFIED) না হওয়া পর্যন্ত ডায়মন্ড ডেলিভারি করা যাবে না। বর্তমান পেমেন্ট স্ট্যাটাস: ${freshOrder.paymentStatus}`,
        400,
        'UNVERIFIED_PAYMENT_DELIVERY_BLOCKED'
      );
    }

    // নিরাপত্তা চেক ২: অর্ডার বা ডেলিভারি ইতিমধ্যে COMPLETED হয়ে থাকলে দ্বিতীয়বার ডেলিভারি সম্পূর্ণ ব্লক
    if (
      freshOrder.orderStatus === ORDER_STATUS.COMPLETED ||
      freshOrder.deliveryStatus === DELIVERY_STATUS.COMPLETED ||
      freshOrder.delivery?.status === DELIVERY_STATUS.COMPLETED ||
      freshOrder.delivery?.deliveryReference
    ) {
      return {
        alreadyCompleted: true,
        isLockedByAnother: false,
        order: freshOrder,
        delivery: freshOrder.delivery,
      };
    }

    // নিরাপত্তা চেক ৩: অর্ডার ইতিমধ্যে অন্য কোনো প্রসেসে লকড (Processing) আছে কি না যাচাই
    const existingDelivery = freshOrder.delivery;
    if (
      existingDelivery?.lockedAt &&
      new Date(existingDelivery.lockedAt) > expiredLockThreshold
    ) {
      return {
        alreadyCompleted: false,
        isLockedByAnother: true,
        order: freshOrder,
        delivery: existingDelivery,
      };
    }

    // স্টেট মেশিন ট্রানজিশন যাচাই
    assertValidStatusTransition({
      currentOrderStatus: freshOrder.orderStatus,
      currentPaymentStatus: freshOrder.paymentStatus,
      currentDeliveryStatus: freshOrder.deliveryStatus,
      nextOrderStatus: ORDER_STATUS.PROCESSING,
      nextPaymentStatus: freshOrder.paymentStatus,
      nextDeliveryStatus: DELIVERY_STATUS.PROCESSING,
    });

    const effectiveMode = env.DELIVERY_MODE === 'LIVE' ? 'LIVE' : 'DEMO';

    // ডেলিভারি রেকর্ড লক এবং স্ট্যাটাস PROCESSING-এ উন্নীত করা
    const lockedDelivery = await tx.delivery.upsert({
      where: { orderId: freshOrder.id },
      update: {
        status: DELIVERY_STATUS.PROCESSING,
        lockedAt: now,
        lockedBy: workerId,
      },
      create: {
        orderId: freshOrder.id,
        status: DELIVERY_STATUS.PROCESSING,
        deliveryMode: effectiveMode,
        attemptCount: 0,
        maxRetries: env.MAX_DELIVERY_RETRIES || 3,
        lockedAt: now,
        lockedBy: workerId,
      },
    });

    const updatedOrder = await tx.order.update({
      where: { id: freshOrder.id },
      data: {
        orderStatus: ORDER_STATUS.PROCESSING,
        deliveryStatus: DELIVERY_STATUS.PROCESSING,
      },
    });

    if (
      freshOrder.orderStatus !== ORDER_STATUS.PROCESSING ||
      freshOrder.deliveryStatus !== DELIVERY_STATUS.PROCESSING
    ) {
      await tx.orderStatusHistory.create({
        data: buildStatusHistoryPayload({
          orderId: freshOrder.id,
          previousOrderStatus: freshOrder.orderStatus,
          newOrderStatus: ORDER_STATUS.PROCESSING,
          previousPaymentStatus: freshOrder.paymentStatus,
          newPaymentStatus: freshOrder.paymentStatus,
          previousDeliveryStatus: freshOrder.deliveryStatus,
          newDeliveryStatus: DELIVERY_STATUS.PROCESSING,
          changedBy: triggeredBy,
          reason: 'Order locked and queued for automatic diamond delivery processing.',
        }),
      });
    }

    return {
      alreadyCompleted: false,
      isLockedByAnother: false,
      order: updatedOrder,
      delivery: lockedDelivery,
      lastAttempt: existingDelivery?.attempts?.[0] || null,
    };
  });
};

/**
 * ৪. ডেলিভারি সফল হওয়ার পর অ্যাটমিক ট্রানজেকশনে ডাটাবেস আপডেট ও অর্ডার COMPLETED করা
 */
const finalizeSuccessfulDelivery = async ({
  order,
  delivery,
  supplier,
  adapterResult,
  attemptNumber,
  triggeredBy,
}) => {
  const completedAt = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const updatedDelivery = await tx.delivery.update({
      where: { id: delivery.id },
      data: {
        supplierId: supplier?.id || null,
        status: DELIVERY_STATUS.COMPLETED,
        deliveryMode: adapterResult.deliveryMode,
        deliveryReference: adapterResult.deliveryReference,
        externalOrderId: adapterResult.externalOrderId,
        attemptCount: attemptNumber,
        nextRetryAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        lockedAt: null,
        lockedBy: null,
        completedAt,
        metadata: {
          isRealDelivery: adapterResult.isRealDelivery,
          deliveryMode: adapterResult.deliveryMode,
          supplierCode: supplier?.code || 'DEMO_SUPPLIER',
        },
      },
    });

    const updatedOrder = await tx.order.update({
      where: { id: order.id },
      data: {
        orderStatus: ORDER_STATUS.COMPLETED,
        deliveryStatus: DELIVERY_STATUS.COMPLETED,
        completedAt,
      },
    });

    await tx.orderStatusHistory.create({
      data: buildStatusHistoryPayload({
        orderId: order.id,
        previousOrderStatus: order.orderStatus,
        newOrderStatus: ORDER_STATUS.COMPLETED,
        previousPaymentStatus: order.paymentStatus,
        newPaymentStatus: order.paymentStatus,
        previousDeliveryStatus: order.deliveryStatus,
        newDeliveryStatus: DELIVERY_STATUS.COMPLETED,
        changedBy: triggeredBy,
        reason:
          adapterResult.deliveryMode === 'DEMO'
            ? `[DEMO MODE] ডায়মন্ড ডেলিভারি সিমুলেশন সম্পন্ন হয়েছে। Ref: ${adapterResult.deliveryReference}`
            : `ডায়মন্ড ডেলিভারি সফলভাবে সম্পন্ন হয়েছে। Ref: ${adapterResult.deliveryReference}`,
        metadata: {
          deliveryReference: adapterResult.deliveryReference,
          deliveryMode: adapterResult.deliveryMode,
          isRealDelivery: adapterResult.isRealDelivery,
          attemptNumber,
        },
      }),
    });

    return {
      order: updatedOrder,
      delivery: updatedDelivery,
    };
  });

  // কাস্টমার ও অ্যাডমিনকে ডেলিভারি সম্পন্ন হওয়ার নোটিফিকেশন পাঠানো
  await notifyDeliveryCompleted(result.order, result.delivery);

  return {
    success: true,
    alreadyCompleted: false,
    deliveryMode: adapterResult.deliveryMode,
    isRealDelivery: adapterResult.isRealDelivery,
    deliveryReference: adapterResult.deliveryReference,
    order: result.order,
    delivery: result.delivery,
  };
};

/**
 * ৫. মূল অটোমেটিক ডেলিভারি প্রসেসর (Part 5, Part 6 & Part 7 Workflow)
 * পেমেন্ট ভেরিফাই হওয়ার পর অথবা রিট্রাই কিউ থেকে এই ফাংশনটি কল হবে।
 */
const processOrderDelivery = async (
  orderIdentifier,
  { triggeredBy = 'SYSTEM' } = {}
) => {
  // ধাপ ১: অর্ডার খুঁজে বের করা
  const targetOrder = await prisma.order.findFirst({
    where: {
      OR: [{ id: orderIdentifier }, { orderNumber: orderIdentifier }],
    },
  });

  if (!targetOrder) {
    throw new AppError(
      'ডেলিভারি প্রসেস করার জন্য অর্ডারটি খুঁজে পাওয়া যায়নি।',
      404,
      'ORDER_NOT_FOUND'
    );
  }

  // ধাপ ২: অ্যাটমিক লক অর্জন ও ডুপ্লিকেট প্রসেসিং প্রতিরোধ
  const lockState = await acquireDeliveryLock(targetOrder, triggeredBy);

  if (lockState.alreadyCompleted) {
    return {
      success: true,
      alreadyCompleted: true,
      message: 'এই অর্ডারের ডায়মন্ড ডেলিভারি ইতিমধ্যে সম্পন্ন হয়েছে।',
      deliveryMode: lockState.delivery?.deliveryMode || 'DEMO',
      deliveryReference: lockState.delivery?.deliveryReference || null,
      order: lockState.order,
      delivery: lockState.delivery,
    };
  }

  if (lockState.isLockedByAnother) {
    throw new AppError(
      'এই অর্ডারের ডেলিভারি ইতিমধ্যে প্রসেসিং অবস্থায় রয়েছে। ডুপ্লিকেট রিকোয়েস্ট প্রতিরোধ করা হয়েছে।',
      409,
      'DELIVERY_ALREADY_IN_PROGRESS'
    );
  }

  const { order, delivery, lastAttempt } = lockState;

  try {
    // ধাপ ৩: সাপ্লায়ার কনফিগারেশন ও অ্যাডাপ্টার লোড করা
    const { supplier, supplierProduct } =
      await resolveActiveSupplierAndMapping(order);
    const adapter = createSupplierAdapter(supplier);

    // ধাপ ৪: (Part 6) যদি আগের চেষ্টায় টাইমআউট হয়ে থাকে, তবে নতুন ডেলিভারি পাঠানোর আগে আগের ফলাফল যাচাই করা
    if (lastAttempt) {
      const prevCheck = await adapter.checkPreviousAttemptStatus({
        order,
        delivery,
        lastAttempt,
      });

      if (prevCheck.alreadyDelivered && prevCheck.deliveryReference) {
        return finalizeSuccessfulDelivery({
          order,
          delivery,
          supplier,
          adapterResult: {
            deliveryMode: prevCheck.deliveryMode || adapter.adapterType,
            isRealDelivery: Boolean(prevCheck.isRealDelivery),
            deliveryReference: prevCheck.deliveryReference,
            externalOrderId: prevCheck.externalOrderId || null,
          },
          attemptNumber: delivery.attemptCount || lastAttempt.attemptNumber,
          triggeredBy,
        });
      }

      if (prevCheck.status === 'STILL_PROCESSING') {
        // সাপ্লায়ার এখনো আগের রিকোয়েস্ট প্রসেস করছে, তাই নতুন রিকোয়েস্ট না পাঠিয়ে অপেক্ষা করা হবে
        return handleDeliveryFailure({
          order,
          delivery,
          adapterResult: {
            status: 'RETRY_PENDING',
            errorCode: 'PREVIOUS_ATTEMPT_STILL_PROCESSING',
            errorMessage:
              'সাপ্লায়ার সার্ভারে পূর্ববর্তী রিকোয়েস্টটি এখনো প্রসেসিং অবস্থায় রয়েছে। ডুপ্লিকেট ডেলিভারি রোধে নতুন রিকোয়েস্ট পাঠানো হয়নি।',
          },
          currentAttemptCount: delivery.attemptCount || 1,
          triggeredBy,
        });
      }
    }

    // ধাপ ৫: নতুন ডেলিভারি অ্যাটেম্পট নাম্বার ও ইউনিক Idempotency Key তৈরি করা
    const attemptNumber = Number(delivery.attemptCount || 0) + 1;
    const attemptIdempotencyKey = `DELIV-${order.orderNumber}-ATT-${attemptNumber}`;

    // ধাপ ৬: সাপ্লায়ার অ্যাডাপ্টারে ডায়মন্ড টপ-আপ রিকোয়েস্ট পাঠানো
    const adapterResult = await adapter.executeTopUp({
      order,
      supplierProduct,
      attemptNumber,
      idempotencyKey: attemptIdempotencyKey,
    });

    // ধাপ ৭: DeliveryAttempt টেবিলে সাপ্লায়ার রিকোয়েস্ট ও রেসপন্স লগ সংরক্ষণ করা
    await prisma.deliveryAttempt.create({
      data: {
        deliveryId: delivery.id,
        orderId: order.id,
        supplierId: supplier?.id || null,
        attemptNumber,
        deliveryMode: adapterResult.deliveryMode,
        idempotencyKey: attemptIdempotencyKey,
        requestPayload: adapterResult.requestPayload,
        responsePayload: adapterResult.responsePayload,
        httpStatus: adapterResult.httpStatus,
        status: adapterResult.success
          ? DELIVERY_STATUS.COMPLETED
          : adapterResult.status === 'RETRY_PENDING'
          ? DELIVERY_STATUS.RETRY_PENDING
          : DELIVERY_STATUS.FAILED,
        deliveryRef: adapterResult.deliveryReference,
        errorCode: adapterResult.errorCode,
        errorMessage: adapterResult.errorMessage,
        durationMs: adapterResult.durationMs,
        triggeredBy,
      },
    });

    // ধাপ ৮: সাপ্লায়ার রেসপন্স সফল হলে ডেলিভারি রেফারেন্স সেভ ও অর্ডার COMPLETED করা
    if (adapterResult.success && adapterResult.deliveryReference) {
      return finalizeSuccessfulDelivery({
        order,
        delivery,
        supplier,
        adapterResult,
        attemptNumber,
        triggeredBy,
      });
    }

    // ধাপ ৯: ডেলিভারি ব্যর্থ হলে রিট্রাই ম্যানেজারের মাধ্যমে রিট্রাই কিউ অথবা FAILED স্ট্যাটাস সেট করা
    const failureOutcome = await handleDeliveryFailure({
      order,
      delivery,
      adapterResult,
      currentAttemptCount: attemptNumber,
      triggeredBy,
    });

    return {
      success: false,
      alreadyCompleted: false,
      willRetry: failureOutcome.willRetry,
      nextRetryAt: failureOutcome.nextRetryAt,
      errorCode: adapterResult.errorCode,
      errorMessage: adapterResult.errorMessage,
      order: failureOutcome.order,
      delivery: failureOutcome.delivery,
    };
  } catch (unexpectedError) {
    // অপ্রত্যাশিত এরর হলে লক রিলিজ করে নিরাপদভাবে ফেইলিওর হ্যান্ডেল করা
    const fallbackAttempt = Number(delivery.attemptCount || 0) + 1;
    const failureOutcome = await handleDeliveryFailure({
      order,
      delivery,
      adapterResult: {
        status: 'RETRY_PENDING',
        errorCode: unexpectedError.errorCode || 'DELIVERY_ENGINE_EXCEPTION',
        errorMessage: unexpectedError.message,
      },
      currentAttemptCount: fallbackAttempt,
      triggeredBy,
    });

    return {
      success: false,
      alreadyCompleted: false,
      willRetry: failureOutcome.willRetry,
      errorCode: unexpectedError.errorCode || 'DELIVERY_ENGINE_EXCEPTION',
      errorMessage: unexpectedError.message,
      order: failureOutcome.order,
      delivery: failureOutcome.delivery,
    };
  }
};

/**
 * ৬. রিট্রাই কিউতে থাকা অর্ডারগুলো ব্যাচ আকারে প্রসেস করার ফাংশন
 */
const processRetryQueue = async (limit = 10) => {
  const dueDeliveries = await getDueRetryDeliveries(limit);
  const results = [];

  for (const item of dueDeliveries) {
    try {
      const outcome = await processOrderDelivery(item.orderId, {
        triggeredBy: 'RETRY_WORKER',
      });
      results.push({
        orderId: item.orderId,
        orderNumber: item.order?.orderNumber,
        success: outcome.success,
        status: outcome.order?.deliveryStatus,
      });
    } catch (err) {
      results.push({
        orderId: item.orderId,
        orderNumber: item.order?.orderNumber,
        success: false,
        error: err.message,
      });
    }
  }

  return {
    processedCount: results.length,
    results,
  };
};

/**
 * ৭. নির্দিষ্ট অর্ডারের ডেলিভারি স্ট্যাটাস ও বিস্তারিত তথ্য পাওয়ার ফাংশন (GET /api/delivery/:orderId)
 */
const getDeliveryDetailsByOrder = async (orderIdentifier) => {
  const order = await prisma.order.findFirst({
    where: {
      OR: [{ id: orderIdentifier }, { orderNumber: orderIdentifier }],
    },
    include: {
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
    },
  });

  if (!order) {
    throw new AppError('অর্ডারটি খুঁজে পাওয়া যায়নি।', 404, 'ORDER_NOT_FOUND');
  }

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    playerUid: order.playerUid,
    verifiedPlayerName: order.verifiedPlayerName,
    productName: order.productName,
    diamondQuantity: order.diamondQuantity,
    orderStatus: order.orderStatus,
    paymentStatus: order.paymentStatus,
    deliveryStatus: order.deliveryStatus,
    delivery: order.delivery || null,
  };
};

/**
 * ৮. অ্যাডমিনের জন্য সব ডেলিভারি ও সাপ্লায়ার অ্যাটেম্পট লগ দেখার ফাংশন (GET /api/delivery/logs)
 */
const getDeliveryLogs = async ({
  page = 1,
  limit = 25,
  status = null,
  deliveryMode = null,
  orderId = null,
} = {}) => {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 25));
  const skip = (safePage - 1) * safeLimit;

  const where = {};

  if (status) {
    where.status = String(status).trim().toUpperCase();
  }

  if (deliveryMode) {
    where.deliveryMode = String(deliveryMode).trim().toUpperCase();
  }

  if (orderId) {
    where.OR = [
      { orderId: String(orderId).trim() },
      { order: { orderNumber: String(orderId).trim().toUpperCase() } },
    ];
  }

  const [attempts, totalCount] = await Promise.all([
    prisma.deliveryAttempt.findMany({
      where,
      include: {
        order: {
          select: {
            orderNumber: true,
            playerUid: true,
            verifiedPlayerName: true,
            productName: true,
            diamondQuantity: true,
          },
        },
        supplier: {
          select: {
            code: true,
            name: true,
            adapterType: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: safeLimit,
    }),
    prisma.deliveryAttempt.count({ where }),
  ]);

  return {
    logs: attempts,
    pagination: {
      page: safePage,
      limit: safeLimit,
      totalCount,
      totalPages: Math.ceil(totalCount / safeLimit) || 1,
    },
  };
};

module.exports = {
  createSupplierAdapter,
  resolveActiveSupplierAndMapping,
  acquireDeliveryLock,
  processOrderDelivery,
  processRetryQueue,
  getDeliveryDetailsByOrder,
  getDeliveryLogs,
};
