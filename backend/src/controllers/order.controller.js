const { asyncHandler } = require('../middlewares/error.middleware');
const orderService = require('../services/order.service');
const paymentService = require('../services/payment.service');

/**
 * ১. ম্যানুয়াল পেমেন্ট মেথড (bKash/Nagad/Rocket) ও নির্দেশনাবলি পাওয়ার কন্ট্রোলার
 * Endpoint: GET /api/orders/payment-instructions
 */
const getPaymentInstructionsHandler = asyncHandler(async (req, res) => {
  const instructions = paymentService.getPaymentInstructions();

  return res.status(200).json({
    success: true,
    message: 'পেমেন্ট নির্দেশনাবলি সফলভাবে লোড হয়েছে।',
    data: instructions,
  });
});

/**
 * ২. নতুন স্মার্ট অর্ডার তৈরি করার কন্ট্রোলার
 * Endpoint: POST /api/orders
 */
const createOrderHandler = asyncHandler(async (req, res) => {
  const result = await orderService.createOrder({
    validatedOrder: req.validatedOrder,
    user: req.user || null,
    guestId: req.guestId || req.headers['x-guest-id'] || null,
    idempotencyKey: req.idempotencyKey || null,
    req,
  });

  const paymentInstructions = paymentService.getPaymentInstructions();
  const hasSubmittedTrx = Boolean(result.order.paymentReference);

  return res.status(201).json({
    success: true,
    message: hasSubmittedTrx
      ? `অর্ডার (${result.order.orderNumber}) এবং পেমেন্ট তথ্য সফলভাবে জমা হয়েছে! অ্যাডমিন যাচাই করার সাথে সাথেই ডায়মন্ড ডেলিভারি হবে।`
      : `অর্ডার (${result.order.orderNumber}) সফলভাবে তৈরি হয়েছে! ডায়মন্ড ডেলিভারি পেতে নির্ধারিত নাম্বারে পেমেন্ট করে TrxID জমা দিন।`,
    data: {
      orderId: result.order.orderNumber,
      internalId: result.order.id,
      order: result.order,
      timeline: result.timeline,
      paymentInstructions,
    },
    // আগের ফ্রন্টএন্ডের সাথে সামঞ্জস্য রাখার জন্য Top-level fields
    orderId: result.order.orderNumber,
    order: result.order,
    timeline: result.timeline,
  });
});

/**
 * ৩. অর্ডারের বিপরীতে ম্যানুয়াল পেমেন্ট (TrxID ও Sender Number) জমা দেওয়ার কন্ট্রোলার
 * Endpoint: POST /api/orders/:orderId/payment
 */
const submitOrderPaymentHandler = asyncHandler(async (req, res) => {
  const orderIdentifier = req.orderIdentifier || req.params.orderId;

  const result = await paymentService.submitManualPayment({
    orderIdentifier,
    validatedPayment: req.validatedPayment,
    user: req.user || null,
    guestId: req.guestId || req.headers['x-guest-id'] || null,
    req,
  });

  return res.status(200).json({
    success: true,
    message: `আপনার পেমেন্ট তথ্য (TrxID: ${result.payment.transactionReference}) সফলভাবে জমা হয়েছে। অ্যাডমিন ভেরিফাই করার সাথে সাথেই ডায়মন্ড ডেলিভারি শুরু হবে।`,
    data: {
      orderId: result.order.orderNumber,
      order: result.order,
      payment: result.payment,
      timeline: result.timeline,
    },
    order: result.order,
    payment: result.payment,
    timeline: result.timeline,
  });
});

/**
 * ৪. পাবলিক অর্ডার ট্র্যাকিং কন্ট্রোলার (মাস্কড Player UID ও ৫-ধাপের লাইভ টাইমলাইনসহ)
 * Endpoint: GET /api/orders/track/:orderId
 */
const trackOrderPublicHandler = asyncHandler(async (req, res) => {
  const orderIdentifier = req.orderIdentifier || req.params.orderId;

  const trackingData = await orderService.trackOrderPublic(orderIdentifier);

  return res.status(200).json({
    success: true,
    message: 'অর্ডার ট্র্যাকিং তথ্য সফলভাবে পাওয়া গেছে।',
    data: trackingData,
    order: trackingData.order,
    timeline: trackingData.timeline,
  });
});

/**
 * ৫. নির্দিষ্ট অর্ডারের বিস্তারিত তথ্য দেখার কন্ট্রোলার
 * Endpoint: GET /api/orders/:orderId
 */
const getOrderDetailsHandler = asyncHandler(async (req, res) => {
  const orderIdentifier = req.orderIdentifier || req.params.orderId;

  const result = await orderService.getOrderByIdentifier({
    orderIdentifier,
    user: req.user || null,
    guestId: req.guestId || req.headers['x-guest-id'] || null,
  });

  return res.status(200).json({
    success: true,
    isFullAccess: result.isFullAccess,
    data: {
      order: result.order,
      timeline: result.timeline,
      notifications: result.notifications,
    },
    order: result.order,
    timeline: result.timeline,
  });
});

/**
 * ৬. কাস্টমার বা গেস্টের নিজস্ব অর্ডার হিস্ট্রি দেখার কন্ট্রোলার
 * Endpoint: GET /api/orders/my-orders (অথবা GET /api/orders)
 */
const getMyOrdersHandler = asyncHandler(async (req, res) => {
  const { page = 1, limit = 15, playerUid = null, guestId: queryGuestId = null } = req.query;

  const resolvedGuestId =
    req.guestId || req.headers['x-guest-id'] || queryGuestId || null;

  const result = await orderService.getCustomerOrders({
    user: req.user || null,
    guestId: resolvedGuestId,
    playerUid,
    page,
    limit,
  });

  return res.status(200).json({
    success: true,
    data: {
      orders: result.orders,
      pagination: result.pagination,
    },
    orders: result.orders,
    pagination: result.pagination,
  });
});

module.exports = {
  getPaymentInstructionsHandler,
  createOrderHandler,
  submitOrderPaymentHandler,
  trackOrderPublicHandler,
  getOrderDetailsHandler,
  getMyOrdersHandler,
};
