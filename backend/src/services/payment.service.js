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
const { createAuditLog, logAdminOrderAction } = require('./audit.service');
const {
  notifyPaymentSubmitted,
  notifyPaymentVerified,
  notifyPaymentRejected,
} = require('./notification.service');
const { processOrderDelivery } = require('./delivery/delivery.engine');
const { buildFiveStepTrackingTimeline } = require('./order.service');

/**
 * ১. কাস্টমারের চেকআউট পেজের জন্য বিকাশ/নগদ/রকেট পেমেন্ট নাম্বার ও নিরাপত্তা নির্দেশনা
 */
const getPaymentInstructions = () => {
  return {
    currency: 'BDT',
    supportWhatsapp: env.SUPPORT_WHATSAPP || '01623759878',
    securityWarning:
      'নিরাপত্তা সতর্কবার্তা: আমরা শুধুমাত্র আপনার পেমেন্টের Transaction ID (TrxID) এবং Sender Number গ্রহণ করি। কখনোই আপনার বিকাশ/নগদ/রকেটের PIN বা OTP কারো সাথে শেয়ার করবেন না।',
    methods: [
      {
        code: 'BKASH',
        name: 'bKash (Personal / Send Money)',
        accountNumber: env.BKASH_NUMBER || '01623759878',
        accountType: 'Personal',
        isActive: true,
        instructions: [
          '১. আপনার বিকাশ অ্যাপ বা *247# ডায়াল করে Send Money অপশনে যান।',
          `২. প্রাপক নাম্বার হিসেবে ${env.BKASH_NUMBER || '01623759878'} দিন এবং অর্ডারের নির্ধারিত টাকার পরিমাণ লিখুন।`,
          '৩. রেফারেন্সে আপনার Order ID লিখুন এবং পেমেন্ট সম্পন্ন করুন।',
          '৪. ফিরতি মেসেজ থেকে পাওয়া Transaction ID (TrxID) এবং যে নাম্বার থেকে টাকা পাঠিয়েছেন তা নিচের ফর্মে জমা দিন।',
        ],
      },
      {
        code: 'NAGAD',
        name: 'Nagad (Personal / Send Money)',
        accountNumber: env.NAGAD_NUMBER || '01623759878',
        accountType: 'Personal',
        isActive: true,
        instructions: [
          '১. আপনার নগদ অ্যাপ বা *167# ডায়াল করে Send Money অপশনে যান।',
          `২. প্রাপক নাম্বার হিসেবে ${env.NAGAD_NUMBER || '01623759878'} দিন এবং নির্ধারিত টাকা পাঠান।`,
          '৩. পেমেন্ট সফল হলে মেসেজ থেকে পাওয়া TrxID ও আপনার নগদ নাম্বারটি নিচে সাবমিট করুন।',
        ],
      },
      {
        code: 'ROCKET',
        name: 'Rocket (Personal / Send Money)',
        accountNumber: env.ROCKET_NUMBER || '01623759878',
        accountType: 'Personal',
        isActive: true,
        instructions: [
          '১. রকেট অ্যাপ বা *322# থেকে Send Money অপশনে গিয়ে নির্ধারিত টাকা পাঠান।',
          '২. ট্রানজেকশন সম্পন্ন হলে TrxID এবং সেন্ডার নাম্বার জমা দিন।',
        ],
      },
    ],
  };
};

/**
 * ২. কাস্টমার কর্তৃক ম্যানুয়াল পেমেন্ট (TrxID ও Sender Number) সাবমিশন (POST /api/orders/:orderId/payment)
 */
const submitManualPayment = async ({
  orderIdentifier,
  validatedPayment,
  user = null,
  guestId = null,
  req = null,
}) => {
  const {
    transactionReference,
    senderNumber,
    paymentMethod,
    paidAmount,
    proofUrl,
  } = validatedPayment;

  const cleanOrderId = String(orderIdentifier || '').trim();

  const order = await prisma.order.findFirst({
    where: {
      OR: [{ id: cleanOrderId }, { orderNumber: cleanOrderId.toUpperCase() }],
    },
    include: {
      payment: true,
      delivery: true,
    },
  });

  if (!order) {
    throw new AppError(
      'পেমেন্ট জমা দেওয়ার জন্য অর্ডারটি খুঁজে পাওয়া যায়নি।',
      404,
      'ORDER_NOT_FOUND'
    );
  }

  // নিরাপত্তা চেক ১: অর্ডার ইতিমধ্যে COMPLETED, CANCELLED বা REFUNDED হলে নতুন পেমেন্ট নেওয়া হবে না
  if (
    [
      ORDER_STATUS.COMPLETED,
      ORDER_STATUS.CANCELLED,
      ORDER_STATUS.REFUNDED,
    ].includes(order.orderStatus)
  ) {
    throw new AppError(
      `এই অর্ডারটি ইতিমধ্যে ${order.orderStatus} অবস্থায় রয়েছে। এতে নতুন পেমেন্ট তথ্য জমা দেওয়া সম্ভব নয়।`,
      400,
      'ORDER_TERMINATED_PAYMENT_BLOCKED'
    );
  }

  // নিরাপত্তা চেক ২: পেমেন্ট ইতিমধ্যে VERIFIED হয়ে থাকলে পুনরায় সাবমিট ব্লক করা
  if (order.paymentStatus === PAYMENT_STATUS.VERIFIED) {
    throw new AppError(
      'এই অর্ডারের পেমেন্ট ইতিমধ্যে ভেরিফাই (VERIFIED) করা হয়েছে।',
      409,
      'PAYMENT_ALREADY_VERIFIED'
    );
  }

  // নিরাপত্তা চেক ৩: প্রদত্ত টাকার পরিমাণ অর্ডারের নির্ধারিত মূল্যের চেয়ে কম হলে ব্লক করা
  const requiredAmount = Number(order.finalPayableAmount);
  if (
    paidAmount !== null &&
    paidAmount !== undefined &&
    Number(paidAmount) < requiredAmount
  ) {
    throw new AppError(
      `অপর্যাপ্ত পেমেন্ট অ্যামাউন্ট! অর্ডারের প্রদেয় মূল্য ৳${requiredAmount}, কিন্তু উল্লেখ করা হয়েছে ৳${paidAmount}।`,
      400,
      'INSUFFICIENT_PAYMENT_AMOUNT'
    );
  }

  // নিরাপত্তা চেক ৪: একই TrxID অন্য কোনো অর্ডারে আগে ব্যবহৃত হয়েছে কি না তা যাচাই করা
  const duplicateTrx = await prisma.payment.findFirst({
    where: {
      transactionReference,
      NOT: {
        orderId: order.id,
      },
    },
    select: {
      id: true,
      orderId: true,
    },
  });

  if (duplicateTrx) {
    throw new AppError(
      'এই Transaction ID (TrxID) ইতিমধ্যে অন্য একটি অর্ডারে ব্যবহার করা হয়েছে। অনুগ্রহ করে সঠিক TrxID প্রদান করুন।',
      409,
      'DUPLICATE_TRANSACTION_REFERENCE'
    );
  }

  // স্টেট মেশিন ট্রানজিশন যাচাই
  const targetOrderStatus = ORDER_STATUS.PAYMENT_REVIEW;
  const targetPaymentStatus = PAYMENT_STATUS.SUBMITTED;

  assertValidStatusTransition({
    currentOrderStatus: order.orderStatus,
    currentPaymentStatus: order.paymentStatus,
    currentDeliveryStatus: order.deliveryStatus,
    nextOrderStatus: targetOrderStatus,
    nextPaymentStatus: targetPaymentStatus,
    nextDeliveryStatus: order.deliveryStatus,
  });

  const resolvedMethod = paymentMethod || order.paymentMethod;
  const now = new Date();

  const updatedResult = await prisma.$transaction(async (tx) => {
    const updatedPayment = await tx.payment.upsert({
      where: { orderId: order.id },
      update: {
        method: resolvedMethod,
        status: targetPaymentStatus,
        senderNumber,
        transactionReference,
        proofUrl: proofUrl || order.payment?.proofUrl || null,
        rejectionReason: null,
        submittedAt: now,
      },
      create: {
        orderId: order.id,
        method: resolvedMethod,
        status: targetPaymentStatus,
        amount: order.finalPayableAmount,
        currency: order.currency || 'BDT',
        senderNumber,
        transactionReference,
        proofUrl: proofUrl || null,
        submittedAt: now,
      },
    });

    const updatedOrder = await tx.order.update({
      where: { id: order.id },
      data: {
        paymentMethod: resolvedMethod,
        paymentReference: transactionReference,
        orderStatus: targetOrderStatus,
        paymentStatus: targetPaymentStatus,
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
        newOrderStatus: targetOrderStatus,
        previousPaymentStatus: order.paymentStatus,
        newPaymentStatus: targetPaymentStatus,
        previousDeliveryStatus: order.deliveryStatus,
        newDeliveryStatus: order.deliveryStatus,
        changedBy: user?.email || (guestId ? `GUEST:${guestId}` : 'CUSTOMER'),
        reason: `Customer submitted ${resolvedMethod} payment reference (${transactionReference}).`,
        metadata: {
          paymentMethod: resolvedMethod,
          senderNumber,
          transactionReference,
        },
      }),
    });

    await createAuditLog(
      {
        actor: user,
        actorEmail: user?.email || order.customerEmail || 'CUSTOMER',
        actorRole: user?.role || 'CUSTOMER',
        action: 'PAYMENT_SUBMITTED',
        entityType: 'PAYMENT',
        entityId: updatedPayment.id,
        orderId: order.id,
        previousState: {
          orderStatus: order.orderStatus,
          paymentStatus: order.paymentStatus,
          paymentReference: order.paymentReference,
        },
        newState: {
          orderStatus: targetOrderStatus,
          paymentStatus: targetPaymentStatus,
          paymentReference: transactionReference,
          senderNumber,
        },
        req,
      },
      tx
    );

    return {
      order: updatedOrder,
      payment: updatedPayment,
    };
  });

  // অ্যাডমিন এবং কাস্টমারকে নোটিফিকেশন পাঠানো
  await notifyPaymentSubmitted(updatedResult.order, updatedResult.payment);

  return {
    order: updatedResult.order,
    payment: updatedResult.payment,
    timeline: buildFiveStepTrackingTimeline(updatedResult.order),
  };
};

/**
 * ৩. অ্যাডমিন কর্তৃক পেমেন্ট ভেরিফিকেশন (VERIFIED) অথবা রিজেকশন (REJECTED)
 * পেমেন্ট VERIFIED হলে স্বয়ংক্রিয়ভাবে ডায়মন্ড ডেলিভারি ইঞ্জিন ট্রিগার করে (Part 4 & Part 5)।
 */
const verifyOrRejectPayment = async ({
  orderIdentifier,
  decisionStatus,
  reason = null,
  autoTriggerDelivery = true,
  adminUser,
  req = null,
}) => {
  const cleanOrderId = String(orderIdentifier || '').trim();

  const order = await prisma.order.findFirst({
    where: {
      OR: [{ id: cleanOrderId }, { orderNumber: cleanOrderId.toUpperCase() }],
    },
    include: {
      payment: true,
      delivery: true,
    },
  });

  if (!order) {
    throw new AppError(
      'পেমেন্ট যাচাই করার জন্য অর্ডারটি খুঁজে পাওয়া যায়নি।',
      404,
      'ORDER_NOT_FOUND'
    );
  }

  // যদি ডেলিভারি ইতিমধ্যে COMPLETED হয়ে থাকে, তবে পেমেন্ট স্ট্যাটাস পরিবর্তন বা রিজেক্ট করা যাবে না
  if (
    order.orderStatus === ORDER_STATUS.COMPLETED ||
    order.deliveryStatus === DELIVERY_STATUS.COMPLETED
  ) {
    throw new AppError(
      'এই অর্ডারটির ডায়মন্ড ডেলিভারি ইতিমধ্যে সম্পন্ন হয়েছে। এর পেমেন্ট স্ট্যাটাস পরিবর্তন করা যাবে না।',
      409,
      'ORDER_ALREADY_COMPLETED'
    );
  }

  // কেস ১: অ্যাডমিন পেমেন্ট REJECTED করলে
  if (decisionStatus === PAYMENT_STATUS.REJECTED) {
    const targetOrderStatus = ORDER_STATUS.PAYMENT_REVIEW;
    const targetPaymentStatus = PAYMENT_STATUS.REJECTED;

    assertValidStatusTransition({
      currentOrderStatus: order.orderStatus,
      currentPaymentStatus: order.paymentStatus,
      currentDeliveryStatus: order.deliveryStatus,
      nextOrderStatus: targetOrderStatus,
      nextPaymentStatus: targetPaymentStatus,
      nextDeliveryStatus: order.deliveryStatus,
    });

    const rejectedResult = await prisma.$transaction(async (tx) => {
      const updatedPayment = await tx.payment.upsert({
        where: { orderId: order.id },
        update: {
          status: targetPaymentStatus,
          verifiedBy: adminUser?.id || null,
          rejectionReason: reason,
          reviewNotes: reason,
        },
        create: {
          orderId: order.id,
          method: order.paymentMethod,
          status: targetPaymentStatus,
          amount: order.finalPayableAmount,
          verifiedBy: adminUser?.id || null,
          rejectionReason: reason,
          reviewNotes: reason,
        },
      });

      const updatedOrder = await tx.order.update({
        where: { id: order.id },
        data: {
          orderStatus: targetOrderStatus,
          paymentStatus: targetPaymentStatus,
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
          newOrderStatus: targetOrderStatus,
          previousPaymentStatus: order.paymentStatus,
          newPaymentStatus: targetPaymentStatus,
          previousDeliveryStatus: order.deliveryStatus,
          newDeliveryStatus: order.deliveryStatus,
          changedBy: adminUser?.email || 'ADMIN',
          reason: `Payment rejected by Admin. Reason: ${reason}`,
        }),
      });

      await logAdminOrderAction(
        {
          adminUser,
          action: 'PAYMENT_REJECTED',
          order,
          newState: {
            orderStatus: targetOrderStatus,
            paymentStatus: targetPaymentStatus,
            rejectionReason: reason,
          },
          reason,
          req,
        },
        tx
      );

      return {
        order: updatedOrder,
        payment: updatedPayment,
      };
    });

    await notifyPaymentRejected(rejectedResult.order, reason);

    return {
      decision: 'REJECTED',
      deliveryTriggered: false,
      order: rejectedResult.order,
      payment: rejectedResult.payment,
      timeline: buildFiveStepTrackingTimeline(rejectedResult.order),
    };
  }

  // কেস ২: অ্যাডমিন পেমেন্ট VERIFIED (Approve) করলে
  const trxRef =
    order.payment?.transactionReference || order.paymentReference || null;

  if (!trxRef) {
    throw new AppError(
      'কাস্টমার এখনো কোনো Transaction ID (TrxID) জমা দেননি। TrxID ছাড়া পেমেন্ট ভেরিফাই করা যাবে না।',
      400,
      'MISSING_TRANSACTION_REFERENCE'
    );
  }

  // যদি আগে থেকেই পেমেন্ট VERIFIED হয়ে থাকে, তবে ডাবল ভেরিফিকেশন না করে ডেলিভারি বাকি থাকলে শুধু ডেলিভারি ট্রিগার করবে
  if (order.paymentStatus === PAYMENT_STATUS.VERIFIED) {
    if (
      autoTriggerDelivery &&
      order.deliveryStatus !== DELIVERY_STATUS.COMPLETED
    ) {
      const deliveryOutcome = await processOrderDelivery(order.id, {
        triggeredBy: adminUser?.email || 'ADMIN_VERIFICATION',
      });

      const refreshedOrder = await prisma.order.findUnique({
        where: { id: order.id },
        include: { payment: true, delivery: true },
      });

      return {
        decision: 'VERIFIED',
        alreadyVerified: true,
        deliveryTriggered: true,
        deliveryOutcome,
        order: refreshedOrder,
        payment: refreshedOrder.payment,
        timeline: buildFiveStepTrackingTimeline(refreshedOrder),
      };
    }

    return {
      decision: 'VERIFIED',
      alreadyVerified: true,
      deliveryTriggered: false,
      order,
      payment: order.payment,
      timeline: buildFiveStepTrackingTimeline(order),
    };
  }

  const targetOrderStatus = ORDER_STATUS.PAYMENT_VERIFIED;
  const targetPaymentStatus = PAYMENT_STATUS.VERIFIED;
  const targetDeliveryStatus = DELIVERY_STATUS.QUEUED;

  // যদি কাস্টমার UNPAID অবস্থায় থাকে কিন্তু TrxID থাকে, তবে সরাসরি VERIFIED করার অনুমতি
  if (
    order.paymentStatus !== PAYMENT_STATUS.SUBMITTED &&
    order.paymentStatus !== PAYMENT_STATUS.VERIFYING
  ) {
    throw new AppError(
      `বর্তমান পেমেন্ট স্ট্যাটাস (${order.paymentStatus}) থেকে সরাসরি VERIFIED করা যাবে না। আগে পেমেন্ট তথ্য SUBMITTED হতে হবে।`,
      400,
      'INVALID_PAYMENT_VERIFICATION_STATE'
    );
  }

  assertValidStatusTransition({
    currentOrderStatus: order.orderStatus,
    currentPaymentStatus: order.paymentStatus,
    currentDeliveryStatus: order.deliveryStatus,
    nextOrderStatus: targetOrderStatus,
    nextPaymentStatus: targetPaymentStatus,
    nextDeliveryStatus: targetDeliveryStatus,
  });

  const verifiedAt = new Date();

  const verifiedResult = await prisma.$transaction(async (tx) => {
    const updatedPayment = await tx.payment.update({
      where: { orderId: order.id },
      data: {
        status: targetPaymentStatus,
        verifiedBy: adminUser?.id || null,
        verifiedAt,
        rejectionReason: null,
        reviewNotes: reason || 'Verified by Admin',
      },
    });

    await tx.delivery.upsert({
      where: { orderId: order.id },
      update: {
        status: targetDeliveryStatus,
      },
      create: {
        orderId: order.id,
        status: targetDeliveryStatus,
        deliveryMode: env.DELIVERY_MODE === 'LIVE' ? 'LIVE' : 'DEMO',
        attemptCount: 0,
        maxRetries: env.MAX_DELIVERY_RETRIES || 3,
      },
    });

    const updatedOrder = await tx.order.update({
      where: { id: order.id },
      data: {
        orderStatus: targetOrderStatus,
        paymentStatus: targetPaymentStatus,
        deliveryStatus: targetDeliveryStatus,
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
        newOrderStatus: targetOrderStatus,
        previousPaymentStatus: order.paymentStatus,
        newPaymentStatus: targetPaymentStatus,
        previousDeliveryStatus: order.deliveryStatus,
        newDeliveryStatus: targetDeliveryStatus,
        changedBy: adminUser?.email || 'ADMIN',
        reason: reason || 'Payment verified by Admin. Queued for automatic delivery.',
        metadata: {
          transactionReference: trxRef,
          verifiedBy: adminUser?.email || 'ADMIN',
        },
      }),
    });

    await logAdminOrderAction(
      {
        adminUser,
        action: 'PAYMENT_VERIFIED',
        order,
        newState: {
          orderStatus: targetOrderStatus,
          paymentStatus: targetPaymentStatus,
          deliveryStatus: targetDeliveryStatus,
        },
        reason,
        req,
      },
      tx
    );

    return {
      order: updatedOrder,
      payment: updatedPayment,
    };
  });

  // কাস্টমারকে পেমেন্ট ভেরিফাই হওয়ার নোটিফিকেশন পাঠানো
  await notifyPaymentVerified(verifiedResult.order);

  // ধাপ ৪: পেমেন্ট ভেরিফাই হওয়ার সাথে সাথেই স্বয়ংক্রিয় ডেলিভারি ইঞ্জিন চালু করা (Part 5)
  let deliveryOutcome = null;
  let finalOrderState = verifiedResult.order;

  if (autoTriggerDelivery) {
    deliveryOutcome = await processOrderDelivery(verifiedResult.order.id, {
      triggeredBy: adminUser?.email || 'ADMIN_VERIFICATION',
    });

    finalOrderState = await prisma.order.findUnique({
      where: { id: verifiedResult.order.id },
      include: {
        payment: true,
        delivery: true,
      },
    });
  }

  return {
    decision: 'VERIFIED',
    alreadyVerified: false,
    deliveryTriggered: Boolean(autoTriggerDelivery),
    deliveryOutcome,
    order: finalOrderState,
    payment: finalOrderState.payment,
    timeline: buildFiveStepTrackingTimeline(finalOrderState),
  };
};

module.exports = {
  getPaymentInstructions,
  submitManualPayment,
  verifyOrRejectPayment,
};
