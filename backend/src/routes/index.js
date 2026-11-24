import { Router } from "express";
import { prisma } from "../config/db.js";
import { env } from "../config/env.js";
import { sendSuccess, asyncHandler } from "../utils/apiResponse.js";
import { requireAdmin } from "../middlewares/auth.middleware.js";

import authRoutes from "./auth.routes.js";
import categoryRoutes from "./category.routes.js";
import productRoutes from "./product.routes.js";
import playerRoutes from "./player.routes.js";
import orderRoutes from "./order.routes.js";
import paymentRoutes from "./payment.routes.js";
import deliveryRoutes from "./delivery.routes.js";
import couponRoutes from "./coupon.routes.js";

const router = Router();

/**
 * ১. GET /api/health
 * সার্ভার, ডাটাবেস কানেকশন এবং ডেলিভারি ইঞ্জিনের লাইভ হেলথ-চেক এন্ডপয়েন্ট (Render/Railway মনিটরিংয়ের জন্য)
 */
router.get(
  "/health",
  asyncHandler(async (req, res) => {
    let dbStatus = "CONNECTED";
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      dbStatus = "DISCONNECTED";
    }

    return sendSuccess(res, {
      statusCode: dbStatus === "CONNECTED" ? 200 : 503,
      message: "FreeFireHub BD Backend API is running",
      data: {
        status: dbStatus === "CONNECTED" ? "OK" : "DEGRADED",
        environment: env.NODE_ENV,
        database: dbStatus,
        deliveryMode: env.DELIVERY_MODE,
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
      },
    });
  })
);

/**
 * ২. GET /api/admin/summary (Admin Only)
 * অ্যাডমিন ড্যাশবোর্ডের মূল ওভারভিউ: মোট রেভিনিউ, পেন্ডিং পেমেন্ট রিভিউ, সম্পন্ন অর্ডার, মোট ইউজার এবং সাম্প্রতিক অডিট লগ
 */
router.get(
  "/admin/summary",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const [
      totalOrders,
      pendingPaymentReviews,
      completedOrders,
      failedDeliveries,
      totalUsers,
      activeProducts,
      revenueAggregation,
      recentOrders,
      recentAuditLogs,
    ] = await Promise.all([
      prisma.order.count(),
      prisma.payment.count({ where: { status: "UNDER_REVIEW" } }),
      prisma.order.count({ where: { orderStatus: "COMPLETED" } }),
      prisma.delivery.count({ where: { status: "FAILED" } }),
      prisma.user.count(),
      prisma.product.count({ where: { isActive: true } }),
      prisma.order.aggregate({
        where: { paymentStatus: "VERIFIED" },
        _sum: { payableAmount: true },
      }),
      prisma.order.findMany({
        take: 10,
        orderBy: { createdAt: "desc" },
        include: {
          items: true,
          payment: true,
          delivery: true,
        },
      }),
      prisma.auditLog.findMany({
        take: 15,
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
        },
      }),
    ]);

    const totalRevenue = Number(
      revenueAggregation._sum?.payableAmount || 0
    );

    return sendSuccess(res, {
      statusCode: 200,
      message: "Admin dashboard summary retrieved successfully",
      data: {
        metrics: {
          totalOrders,
          pendingPaymentReviews,
          completedOrders,
          failedDeliveries,
          totalUsers,
          activeProducts,
          totalRevenue,
          deliveryMode: env.DELIVERY_MODE,
        },
        recentOrders,
        recentAuditLogs,
      },
    });
  })
);

/**
 * ৩. সকল মডিউল রাউট মাউন্ট করা (/api/...)
 */
router.use("/auth", authRoutes);
router.use("/categories", categoryRoutes);
router.use("/products", productRoutes);
router.use("/player", playerRoutes);
router.use("/orders", orderRoutes);
router.use("/payments", paymentRoutes);
router.use("/deliveries", deliveryRoutes);
router.use("/coupons", couponRoutes);

export default router;
