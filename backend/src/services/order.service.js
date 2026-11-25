const prisma = require('../config/prisma');
const env = require('../config/env');
const { AppError } = require('../middlewares/error.middleware');
const { getClientIp } = require('../middlewares/rateLimiter.middleware');
const { generateUniqueOrderNumber } = require('../utils/orderIdGenerator');
const {
  ORDER_STATUS,
  PAYMENT_STATUS,
  DELIVERY_STATUS,
  buildStatusHistoryPayload,
} = require('../utils/stateMachine');
const { sanitizeOrderForPublicTracking } = require('../utils/mask');
const { createAuditLog } = require('./audit.service');
const {
  notifyOrderCreated,
  notifyPaymentSubmitted,
  getOrderNotifications,
} = require('./notification.service');

/**
 * ১. ডাটাবেস থেকে প্রোডাক্ট যাচাই এবং সার্ভার-সাইড প্রাইস ক্যালকুলেশন
 * (ফ্রন্টএন্ড থেকে কেউ দাম কমিয়ে বা পরিবর্তন করে পাঠালে তা সাথে সাথে ব্লক করবে)
 */
const resolveAndValidateProduct = async (productIdentifier, clientSentPrice = null) => {
  const cleanId = String(productIdentifier || '').trim();

  const product = await prisma.product.findFirst({
    where: {
      OR: [
        { id: cleanId },
        { slug: cleanId.toLowerCase() },
        { sku: cleanId.toUpperCase() },
      ],
    },
  });

  if (!product) {
    throw new AppError(
      'সিলেক্ট করা ডায়মন্ড প্যাকেজটি ডাটাবেসে খুঁজে পাওয়া যায়নি।',
      404,
      'PRODUCT_NOT_FOUND'
    );
  }

  if (!product.isActive) {
    throw new AppError(
      `দুঃখিত, "${product.name}" প্যাকেজটি বর্তমানে স্টকে নেই বা সাময়িকভাবে বন্ধ রয়েছে।`,
      400,
      'PRODUCT_INACTIVE'
    );
  }

  const unitPrice = Number(product.unitPrice ?? product.price ?? 0);
  const discountAmount = Number(product.discountAmount ?? 0);
  const finalPayableAmount = Number(
    product.finalPayableAmount ?? Math.max(0, unitPrice - discountAmount)
  );
  const diamondQuantity = Number(
    product.diamondQuantity ??
      Number(product.baseDiamonds || 0) + Number(product.bonusDiamonds || 0)
  );

  if (finalPayableAmount <= 0 || diamondQuantity <= 0) {
    throw new AppError(
      'প্রোডাক্টের মূল্য বা ডায়মন্ড সংখ্যা সঠিক নয়। অনুগ্রহ করে অ্যাডমিনের সাথে যোগাযোগ করুন।',
      500,
      'INVALID_PRODUCT_CONFIGURATION'
    );
  }

  // সার্ভার-সাইড প্রাইস ট্যাম্পারিং চেক (Part 3 & Part 14)
  if (clientSentPrice !== null && clientSentPrice !== undefined) {
    const numericClientPrice = Number(clientSentPrice);
    if (Math.abs(numericClientPrice - finalPayableAmount) > 0.01) {
      throw new AppError(
        `প্রোডাক্টের মূল্য পরিবর্তন (Price Mismatch) শনাক্ত হয়েছে! প্যাকেজের আসল মূল্য ৳${finalPayableAmount}, কিন্তু পাঠানো হয়েছে ৳${numericClientPrice}।`,
        400,
        'PRICE_TAMPERING_DETECTED'
      );
    }
  }

  return {
    product,
    unitPrice,
    discountAmount,
    finalPayableAmount,
    diamondQuantity,
  };
};

/**
 * ২. কাস্টমারের জন্য ৫-ধাপের লাইভ অর্ডার ট্র্যাকিং টাইমলাইন তৈরি করা (Part 8)
 */
const buildFiveStepTrackingTimeline = (order) => {
  const orderStatus = order.orderStatus;
  const paymentStatus = order.paymentStatus;
  const deliveryStatus = order.deliveryStatus;

  const isPaymentSubmitted = [
    PAYMENT_STATUS.SUBMITTED,
    PAYMENT_STATUS.VERIFYING,
    PAYMENT_STATUS.VERIFIED,
    PAYMENT_STATUS.REFUNDED,
  ].includes(paymentStatus);

  const isPaymentVerified = [
    PAYMENT_STATUS.VERIFIED,
    PAYMENT_STATUS.REFUNDED,
  ].includes(paymentStatus);

  const isDeliveryStarted = [
    DELIVERY_STATUS.QUEUED,
    DELIVERY_STATUS.PROCESSING,
    DELIVERY_STATUS.RETRY_PENDING,
    DELIVERY_STATUS.COMPLETED,
  ].includes(deliveryStatus);

  const isCompleted =
    orderStatus === ORDER_STATUS.COMPLETED &&
    deliveryStatus === DELIVERY_STATUS.COMPLETED;

  const steps = [
    {
      stepNumber: 1,
      key: 'ORDER_CREATED',
      title: 'অর্ডার গ্রহণ করা হয়েছে',
      description: `অর্ডার আইডি ${order.orderNumber} সফলভাবে তৈরি হয়েছে।`,
      status: 'COMPLETED',
      timestamp: order.createdAt,
    },
    {
      stepNumber: 2,
      key: 'PAYMENT_SUBMITTED',
      title: 'পেমেন্ট তথ্য জমা',
      description:
        paymentStatus === PAYMENT_STATUS.REJECTED
          ? 'প্রদত্ত পেমেন্ট ট্রানজেকশন (TrxID) গ্রহণ করা যায়নি।'
          : isPaymentSubmitted
          ? `${order.paymentMethod} পেমেন্ট তথ্য যাচাইয়ের জন্য জমা হয়েছে।`
          : 'বিকাশ/নগদ/রকেট পেমেন্টের TrxID জমা দেওয়ার অপেক্ষায় রয়েছে।',
      status:
        paymentStatus === PAYMENT_STATUS.REJECTED
          ? 'FAILED'
          : isPaymentSubmitted
          ? 'COMPLETED'
          : orderStatus === ORDER_STATUS.CANCELLED
          ? 'CANCELLED'
          : 'CURRENT',
      timestamp: order.payment?.submittedAt || null,
    },
    {
      stepNumber: 3,
      key: 'PAYMENT_VERIFIED',
      title: 'পেমেন্ট যাচাই সম্পন্ন',
      description: isPaymentVerified
        ? 'অ্যাডমিন কর্তৃক আপনার পেমেন্ট সফলভাবে ভেরিফাই হয়েছে।'
        : paymentStatus === PAYMENT_STATUS.REJECTED
        ? 'পেমেন্ট ভেরিফিকেশন ব্যর্থ হয়েছে।'
        : 'অ্যাডমিন আপনার TrxID যাচাই করছেন।',
      status: isPaymentVerified
        ? 'COMPLETED'
        : paymentStatus === PAYMENT_STATUS.REJECTED
        ? 'FAILED'
        : isPaymentSubmitted
        ? 'CURRENT'
        : 'PENDING',
      timestamp: order.payment?.verifiedAt || null,
    },
    {
      stepNumber: 4,
      key: 'DELIVERY_PROCESSING',
      title: 'ডায়মন্ড ডেলিভারি প্রসেসিং',
      description:
        deliveryStatus === DELIVERY_STATUS.COMPLETED
          ? 'সাপ্লায়ার সার্ভার থেকে ডায়মন্ড প্রেরণ সম্পন্ন হয়েছে।'
          : deliveryStatus === DELIVERY_STATUS.FAILED
          ? 'স্বয়ংক্রিয় ডেলিভারি বিঘ্নিত হয়েছে, অ্যাডমিন টিম পরীক্ষা করছেন।'
          : deliveryStatus === DELIVERY_STATUS.RETRY_PENDING
          ? 'সাপ্লায়ার সার্ভারে পুনরায় ডেলিভারি চেষ্টা (Retry) চলছে।'
          : isDeliveryStarted
          ? 'আপনার ফ্রি ফায়ার ইউআইডিতে ডায়মন্ড পাঠানো হচ্ছে...'
          : 'পেমেন্ট ভেরিফাই হওয়ার পর ডেলিভারি শুরু হবে।',
      status:
        deliveryStatus === DELIVERY_STATUS.COMPLETED
          ? 'COMPLETED'
          : deliveryStatus === DELIVERY_STATUS.FAILED
          ? 'FAILED'
          : isDeliveryStarted || isPaymentVerified
          ? 'CURRENT'
          : 'PENDING',
      timestamp: order.delivery?.updatedAt || null,
    },
    {
      stepNumber: 5,
      key: 'ORDER_COMPLETED',
      title: 'ডেলিভারি সম্পন্ন',
      description: isCompleted
        ? `${order.diamondQuantity} ডায়মন্ড সফলভাবে আপনার অ্যাকাউন্টে যুক্ত হয়েছে!`
        : orderStatus === ORDER_STATUS.REFUNDED
        ? 'অর্ডারটি রিফান্ড করা হয়েছে।'
        : orderStatus === ORDER_STATUS.CANCELLED
        ? 'অর্ডারটি বাতিল করা হয়েছে।'
        : 'ডায়মন্ড ডেলিভারি সম্পন্ন হওয়ার অপেক্ষায়।',
      status: isCompleted
        ? 'COMPLETED'
        : [ORDER_STATUS.FAILED, ORDER_STATUS.CANCELLED, ORDER_STATUS.REFUNDED].includes(
            orderStatus
          )
        ? 'FAILED'
        : 'PENDING',
      timestamp: order.completedAt || order.delivery?.completedAt || null,
    },
  ];

  return {
    currentOrderStatus: orderStatus,
    currentPaymentStatus: paymentStatus,
    currentDeliveryStatus: deliveryStatus,
    isTerminalState: [
      ORDER_STATUS.COMPLETED,
      ORDER_STATUS.CANCELLED,
      ORDER_STATUS.REFUNDED,
    ].includes(orderStatus),
    steps,
  };
};

/**
 * ৩. নতুন স্মার্ট অর্ডার তৈরি করা (POST /api/orders)
 * অ্যাটমিক ডাটাবেস ট্রানজেকশনের মাধ্যমে Order, Payment, Delivery, History ও AuditLog তৈরি করে।
 */
const createOrder = async ({
  validatedOrder,
  user = null,
  guestId = null,
  idempotencyKey = null,
  req = null,
}) => {
  const {
    playerUid,
    verifiedPlayerName,
    gameServer,
    productId,
    paymentMethod,
    customerPhone,
    customerEmail,
    transactionReference,
    senderNumber,
    clientSentPrice,
    notes,
  } = validatedOrder;

  // ধাপ ১: ডাটাবেস থেকে প্রোডাক্ট ও আসল দাম যাচাই করা
  const {
    product,
    unitPrice,
    discountAmount,
    finalPayableAmount,
    diamondQuantity,
  } = await resolveAndValidateProduct(productId, clientSentPrice);

  // ধাপ ২: যদি অর্ডারের সাথেই TrxID পাঠানো হয়ে থাকে, তবে সেটি আগে ব্যবহৃত হয়েছে কি না তা যাচাই করা
  if (transactionReference) {
    const existingTrx = await prisma.payment.findUnique({
      where: { transactionReference },
      select: { id: true },
    });

    if (existingTrx) {
      throw new AppError(
        'এই Transaction ID (TrxID) ইতিমধ্যে অন্য একটি অর্ডারে ব্যবহার করা হয়েছে। অনুগ্রহ করে সঠিক TrxID দিন।',
        409,
        'DUPLICATE_TRANSACTION_REFERENCE'
      );
    }
  }

  const hasImmediatePaymentInfo = Boolean(transactionReference);
  const initialOrderStatus = hasImmediatePaymentInfo
    ? ORDER_STATUS.PAYMENT_REVIEW
    : ORDER_STATUS.PENDING;
  const initialPaymentStatus = hasImmediatePaymentInfo
    ? PAYMENT_STATUS.SUBMITTED
    : PAYMENT_STATUS.UNPAID;
  const initialDeliveryStatus = DELIVERY_STATUS.NOT_STARTED;

  const clientIp = req ? getClientIp(req) : null;
  const userAgent =
    req?.headers?.['user-agent']
      ? String(req.headers['user-agent']).slice(0, 300)
      : null;

  // ধাপ ৩: অ্যাটমিক ডাটাবেস ট্রানজেকশন
  const createdData = await prisma.$transaction(async (tx) => {
    const orderNumber = await generateUniqueOrderNumber(tx);

    // Order তৈরি
    const newOrder = await tx.order.create({
      data: {
        orderNumber,
        userId: user?.id || null,
        guestId: guestId || null,
        playerUid,
        verifiedPlayerName,
        gameServer: gameServer || 'BD',
        productId: product.id,
        productName: product.name,
        diamondQuantity,
        unitPrice,
        discountAmount,
        finalPayableAmount,
        currency: product.currency || 'BDT',
        paymentMethod,
        paymentReference: transactionReference || null,
        orderStatus: initialOrderStatus,
        paymentStatus: initialPaymentStatus,
        deliveryStatus: initialDeliveryStatus,
        customerPhone: customerPhone || user?.phone || null,
        customerEmail: customerEmail || user?.email || null,
        idempotencyKey: idempotencyKey || null,
        ipAddress: clientIp,
        userAgent,
        notes,
      },
    });

    // Payment রেকর্ড তৈরি
    const newPayment = await tx.payment.create({
      data: {
        orderId: newOrder.id,
        method: paymentMethod,
        status: initialPaymentStatus,
        amount: finalPayableAmount,
        currency: product.currency || 'BDT',
        senderNumber: senderNumber || customerPhone || null,
        transactionReference: transactionReference || null,
        submittedAt: hasImmediatePaymentInfo ? new Date() : null,
      },
    });

    // Delivery রেকর্ড প্রস্তুত রাখা (পেমেন্ট ভেরিফাই না হওয়া পর্যন্ত NOT_STARTED অবস্থায় থাকবে)
    const newDelivery = await tx.delivery.create({
      data: {
        orderId: newOrder.id,
        status: initialDeliveryStatus,
        deliveryMode: env.DELIVERY_MODE === 'LIVE' ? 'LIVE' : 'DEMO',
        attemptCount: 0,
        maxRetries: env.MAX_DELIVERY_RETRIES || 3,
      },
    });

    // OrderStatusHistory রেকর্ড তৈরি
    await tx.orderStatusHistory.create({
      data: buildStatusHistoryPayload({
        orderId: newOrder.id,
        previousOrderStatus: null,
        newOrderStatus: initialOrderStatus,
        previousPaymentStatus: null,
        newPaymentStatus: initialPaymentStatus,
        previousDeliveryStatus: null,
        newDeliveryStatus: initialDeliveryStatus,
        changedBy: user?.email || (guestId ? `GUEST:${guestId}` : 'CUSTOMER'),
        reason: hasImmediatePaymentInfo
          ? 'Order created with manual payment transaction reference submitted.'
          : 'Order created and awaiting payment submission.',
      }),
    });

    // AuditLog রেকর্ড তৈরি
    await createAuditLog(
      {
        actor: user,
        actorEmail: user?.email || customerEmail || 'CUSTOMER',
        actorRole: user?.role || 'CUSTOMER',
        action: 'ORDER_CREATED',
        entityType: 'ORDER',
        entityId: newOrder.id,
        orderId: newOrder.id,
        previousState: null,
        newState: {
          orderNumber: newOrder.orderNumber,
          orderStatus: initialOrderStatus,
          paymentStatus: initialPaymentStatus,
          deliveryStatus: initialDeliveryStatus,
          finalPayableAmount,
        },
        req,
      },
      tx
    );

    return {
      order: {
        ...newOrder,
        payment: newPayment,
        delivery: newDelivery,
      },
      payment: newPayment,
      delivery: newDelivery,
    };
  });

  // ধাপ ৪: নোটিফিকেশন ডিসপ্যাচ করা
  await notifyOrderCreated(createdData.order);
  if (hasImmediatePaymentInfo) {
    await notifyPaymentSubmitted(createdData.order, createdData.payment);
  }

  return {
    order: createdData.order,
    timeline: buildFiveStepTrackingTimeline(createdData.order),
  };
};

/**
 * ৪. পাবলিক অর্ডার ট্র্যাকিং সার্ভিস (GET /api/orders/track/:orderId)
 * সংবেদনশীল তথ্য (Player UID ও TrxID) মাস্ক করে নিরাপদ ট্র্যাকিং ডেটা রিটার্ন করে।
 */
const trackOrderPublic = async (orderIdentifier) => {
  const cleanId = String(orderIdentifier || '').trim();

  const order = await prisma.order.findFirst({
    where: {
      OR: [{ orderNumber: cleanId.toUpperCase() }, { id: cleanId }],
    },
    include: {
      payment: true,
      delivery: true,
      statusHistory: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          newOrderStatus: true,
          newPaymentStatus: true,
          newDeliveryStatus: true,
          reason: true,
          createdAt: true,
        },
      },
    },
  });

  if (!order) {
    throw new AppError(
      `প্রদত্ত অর্ডার আইডি (${cleanId}) দিয়ে কোনো অর্ডার খুঁজে পাওয়া যায়নি। অনুগ্রহ করে সঠিক Order ID লিখুন।`,
      404,
      'ORDER_NOT_FOUND'
    );
  }

  const publicOrderView = sanitizeOrderForPublicTracking(order);
  const timeline = buildFiveStepTrackingTimeline(order);
  const notifications = await getOrderNotifications(order.id);

  return {
    order: publicOrderView,
    timeline,
    statusHistory: order.statusHistory,
    notifications,
  };
};

/**
 * ৫. নির্দিষ্ট অর্ডারের বিস্তারিত তথ্য (GET /api/orders/:orderId)
 * অর্ডারের প্রকৃত মালিক বা অ্যাডমিন হলে সম্পূর্ণ তথ্য দেখাবে, অন্যথায় মাস্কড পাবলিক ভিউ দেখাবে।
 */
const getOrderByIdentifier = async ({
  orderIdentifier,
  user = null,
  guestId = null,
}) => {
  const cleanId = String(orderIdentifier || '').trim();

  const order = await prisma.order.findFirst({
    where: {
      OR: [{ id: cleanId }, { orderNumber: cleanId.toUpperCase() }],
    },
    include: {
      payment: true,
      delivery: true,
      statusHistory: {
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!order) {
    throw new AppError('অর্ডারটি খুঁজে পাওয়া যায়নি।', 404, 'ORDER_NOT_FOUND');
  }

  const isAdmin =
    user && ['ADMIN', 'SUPER_ADMIN'].includes(String(user.role).toUpperCase());
  const isOwnerUser = Boolean(user && order.userId && order.userId === user.id);
  const isOwnerGuest = Boolean(
    guestId && order.guestId && order.guestId === guestId
  );

  const timeline = buildFiveStepTrackingTimeline(order);
  const notifications = await getOrderNotifications(order.id);

  if (isAdmin || isOwnerUser || isOwnerGuest) {
    return {
      isFullAccess: true,
      order,
      timeline,
      notifications,
    };
  }

  // আনঅথরাইজড ভিজিটরের ক্ষেত্রে সংবেদনশীল ডেটা মাস্ক করে দেখানো হবে
  return {
    isFullAccess: false,
    order: sanitizeOrderForPublicTracking(order),
    timeline,
    notifications,
  };
};

/**
 * ৬. কাস্টমার বা গেস্ট ইউজারের নিজস্ব অর্ডার হিস্ট্রি লিস্ট (GET /api/orders/my-orders)
 */
const getCustomerOrders = async ({
  user = null,
  guestId = null,
  playerUid = null,
  page = 1,
  limit = 15,
}) => {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 15));
  const skip = (safePage - 1) * safeLimit;

  const orConditions = [];

  if (user?.id) {
    orConditions.push({ userId: user.id });
  }

  if (guestId) {
    orConditions.push({ guestId: String(guestId).trim() });
  }

  if (playerUid && /^\d{5,15}$/.test(String(playerUid).trim())) {
    orConditions.push({ playerUid: String(playerUid).trim() });
  }

  if (orConditions.length === 0) {
    return {
      orders: [],
      pagination: {
        page: safePage,
        limit: safeLimit,
        totalCount: 0,
        totalPages: 1,
      },
    };
  }

  const where = { OR: orConditions };

  const [orders, totalCount] = await Promise.all([
    prisma.order.findMany({
      where,
      include: {
        payment: {
          select: {
            method: true,
            status: true,
            transactionReference: true,
            submittedAt: true,
            verifiedAt: true,
          },
        },
        delivery: {
          select: {
            status: true,
            deliveryMode: true,
            deliveryReference: true,
            completedAt: true,
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

module.exports = {
  resolveAndValidateProduct,
  buildFiveStepTrackingTimeline,
  createOrder,
  trackOrderPublic,
  getOrderByIdentifier,
  getCustomerOrders,
};
