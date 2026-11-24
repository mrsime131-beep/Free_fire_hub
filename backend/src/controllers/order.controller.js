import {
  createNewOrder,
  getOrderByNumberOrId,
  getUserOrders,
  getAllOrdersForAdmin,
  updateOrderStatusByAdmin,
} from "../services/order.service.js";
import { sendSuccess, asyncHandler } from "../utils/apiResponse.js";

/**
 * ১. POST /api/orders
 * নতুন ডায়মন্ড বা মেম্বারশিপ অর্ডার তৈরি করার কন্ট্রোলার।
 * লগইন করা ইউজার এবং গেস্ট (Guest)—উভয়েই অর্ডার করতে পারবে।
 */
export const createOrder = asyncHandler(async (req, res) => {
  const createdOrder = await createNewOrder(req.body, req);

  // যদি Idempotency Replay হয় তবে 200, অন্যথায় নতুন অর্ডারের জন্য 201
  const hasTrxId = Boolean(createdOrder.payment?.transactionReference);
  const message = hasTrxId
    ? `আপনার অর্ডার (${createdOrder.orderNumber}) এবং পেমেন্ট তথ্য সফলভাবে জমা হয়েছে। দ্রুত ভেরিফাই করে ডায়মন্ড ডেলিভারি দেওয়া হবে।`
    : `আপনার অর্ডার (${createdOrder.orderNumber}) সফলভাবে তৈরি হয়েছে। অনুগ্রহ করে পেমেন্ট সম্পন্ন করে Transaction ID (TrxID) সাবমিট করুন।`;

  return sendSuccess(res, {
    statusCode: 201,
    message,
    data: createdOrder,
  });
});

/**
 * ২. GET /api/orders/track/:orderNumber অথবা GET /api/orders/:orderNumber
 * ইউনিক Order ID (যেমন: FFH-20261124-000001) বা UUID দিয়ে অর্ডারের লাইভ স্ট্যাটাস ও ডেলিভারি ট্র্যাক করা।
 */
export const getOrderDetails = asyncHandler(async (req, res) => {
  const { orderNumber } = req.params;
  const order = await getOrderByNumberOrId(orderNumber, req.user);

  return sendSuccess(res, {
    statusCode: 200,
    message: "Order details retrieved successfully",
    data: order,
  });
});

/**
 * ৩. GET /api/orders/my-orders (Logged-in Customer Only)
 * লগইন করা ইউজারের ড্যাশবোর্ডের জন্য তার নিজের সকল অর্ডারের তালিকা ও পেজিনেশন রিটার্ন করবে।
 */
export const getMyOrders = asyncHandler(async (req, res) => {
  const query = req.validatedQuery || req.query;
  const result = await getUserOrders(req.user.id, query);

  return sendSuccess(res, {
    statusCode: 200,
    message: "Your order history retrieved successfully",
    data: result.orders,
    meta: result.meta,
  });
});

/**
 * ৪. GET /api/orders (Admin Only)
 * অ্যাডমিন প্যানেলের জন্য সব অর্ডারের তালিকা, সার্চ (Order ID, UID, TrxID, Phone) এবং স্ট্যাটাস ফিল্টারিং।
 */
export const getAllOrders = asyncHandler(async (req, res) => {
  const query = req.validatedQuery || req.query;
  const result = await getAllOrdersForAdmin(query);

  return sendSuccess(res, {
    statusCode: 200,
    message: "All orders retrieved successfully",
    data: result.orders,
    meta: result.meta,
  });
});

/**
 * ৫. PATCH /api/orders/:orderNumber/status (Admin Only)
 * অ্যাডমিনের মাধ্যমে যেকোনো অর্ডারের স্ট্যাটাস ও অ্যাডমিন নোট আপডেট করার কন্ট্রোলার।
 */
export const updateOrderStatus = asyncHandler(async (req, res) => {
  const { orderNumber } = req.params;
  const updatedOrder = await updateOrderStatusByAdmin(
    orderNumber,
    req.body,
    req
  );

  return sendSuccess(res, {
    statusCode: 200,
    message: `Order ${updatedOrder.orderNumber} status updated to ${updatedOrder.orderStatus}`,
    data: updatedOrder,
  });
});
