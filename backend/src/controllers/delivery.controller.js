import {
  executeOrderDelivery,
  getDeliveryByOrderIdentifier,
  getAllDeliveriesForAdmin,
} from "../services/delivery.service.js";
import { sendSuccess, asyncHandler } from "../utils/apiResponse.js";

/**
 * ১. POST /api/deliveries/:orderNumber/trigger অথবা POST /api/deliveries/:orderNumber/retry (Admin Only)
 * কোনো অর্ডারের পেমেন্ট VERIFIED হওয়ার পর যদি নেটওয়ার্ক বা সাপ্লায়ার সার্ভারের কারণে অটোমেটিক ডেলিভারি FAILED হয়,
 * তবে অ্যাডমিন ওয়ান-ক্লিকে এই এন্ডপয়েন্ট দিয়ে ডায়মন্ড ডেলিভারি পুনরায় ট্রিগার (Retry) করতে পারবেন।
 */
export const triggerOrRetryDelivery = asyncHandler(async (req, res) => {
  const { orderNumber } = req.params;

  const updatedOrder = await executeOrderDelivery(orderNumber, {
    req,
    triggeredBy: "ADMIN_MANUAL_TRIGGER",
  });

  const isCompleted =
    updatedOrder.orderStatus === "COMPLETED" &&
    updatedOrder.delivery?.status === "DELIVERED";

  const message = isCompleted
    ? `অর্ডার ${updatedOrder.orderNumber}-এর ডায়মন্ড ডেলিভারি সফলভাবে সম্পন্ন হয়েছে (Ref: ${updatedOrder.delivery?.deliveryReferenceId})!`
    : `অর্ডার ${updatedOrder.orderNumber}-এর ডেলিভারি চেষ্টা ব্যর্থ হয়েছে। অনুগ্রহ করে ডেলিভারি লগ চেক করুন।`;

  return sendSuccess(res, {
    statusCode: 200,
    message,
    data: updatedOrder,
  });
});

/**
 * ২. GET /api/deliveries/:orderNumber
 * নির্দিষ্ট Order Number (যেমন: FFH-20261124-000001) বা Order UUID দিয়ে ডায়মন্ড ডেলিভারির বর্তমান স্ট্যাটাস,
 * মোট ডায়মন্ড সংখ্যা এবং ডেলিভারি রেফারেন্স আইডি চেক করা।
 */
export const getDeliveryStatus = asyncHandler(async (req, res) => {
  const { orderNumber } = req.params;
  const deliveryData = await getDeliveryByOrderIdentifier(
    orderNumber,
    req.user
  );

  return sendSuccess(res, {
    statusCode: 200,
    message: "Delivery status retrieved successfully",
    data: deliveryData,
  });
});

/**
 * ৩. GET /api/deliveries (Admin Only)
 * অ্যাডমিন প্যানেলের জন্য সকল ডায়মন্ড ডেলিভারি লগ, স্ট্যাটাস ফিল্টারিং (PENDING, PROCESSING, DELIVERED, FAILED)
 * এবং Player UID অনুযায়ী সার্চ ও পেজিনেশন।
 */
export const getAllDeliveries = asyncHandler(async (req, res) => {
  const result = await getAllDeliveriesForAdmin(req.query);

  return sendSuccess(res, {
    statusCode: 200,
    message: "All delivery records retrieved successfully",
    data: result.deliveries,
    meta: result.meta,
  });
});
