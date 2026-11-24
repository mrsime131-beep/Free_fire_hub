import app from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./config/db.js";
import { logger } from "./utils/logger.js";

const PORT = Number(env.PORT || 5000);
let httpServer = null;
let isShuttingDown = false;

/**
 * সার্ভার ও PostgreSQL ডাটাবেস কানেকশন নিরাপদে চালু করার মূল ফাংশন
 */
async function startServer() {
  try {
    logger.info("Connecting to PostgreSQL database via Prisma...", null, "BOOTSTRAP");
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    logger.info("PostgreSQL database connected and verified successfully.", null, "BOOTSTRAP");

    // Render, Railway এবং Docker কন্টেইনারের জন্য '0.0.0.0' হোস্টে বাইন্ড করা অপরিহার্য
    httpServer = app.listen(PORT, "0.0.0.0", () => {
      logger.info(
        `FreeFireHub BD Backend Server is running on port ${PORT} [${env.NODE_ENV}]`,
        {
          port: PORT,
          environment: env.NODE_ENV,
          deliveryMode: env.DELIVERY_MODE,
          healthCheckUrl: `http://localhost:${PORT}/api/health`,
        },
        "SERVER_READY"
      );
    });

    // Keep-Alive Timeout টিউনিং (Cloud Load Balancer 502 Bad Gateway প্রতিরোধের জন্য)
    httpServer.keepAliveTimeout = 65000;
    httpServer.headersTimeout = 66000;
  } catch (error) {
    logger.error(
      "Failed to start FreeFireHub BD Backend Server. Please check DATABASE_URL and environment variables.",
      error,
      "BOOTSTRAP_FATAL"
    );
    await prisma.$disconnect().catch(() => null);
    process.exit(1);
  }
}

/**
 * সার্ভার বন্ধ হওয়ার সময় (Deploy রিস্টার্ট বা SIGTERM/SIGINT) চলমান অর্ডার ও ডাটাবেস কানেকশন নিরাপদে বন্ধ করার ফাংশন
 */
async function gracefulShutdown(signal, fatalError = null) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  if (fatalError) {
    logger.error(
      `Fatal runtime error (${signal}): ${fatalError.message || fatalError}`,
      fatalError,
      "SHUTDOWN"
    );
  } else {
    logger.info(
      `Received ${signal}. Starting graceful shutdown...`,
      null,
      "SHUTDOWN"
    );
  }

  // ১০ সেকেন্ডের মধ্যে শাটডাউন শেষ না হলে ফোর্স এক্সিট
  const forceExitTimer = setTimeout(() => {
    logger.warn("Graceful shutdown timed out. Forcing process exit.", null, "SHUTDOWN");
    process.exit(fatalError ? 1 : 0);
  }, 10000);
  forceExitTimer.unref();

  try {
    if (httpServer) {
      await new Promise((resolve) => {
        httpServer.close(() => {
          logger.info("HTTP server closed cleanly.", null, "SHUTDOWN");
          resolve();
        });
      });
    }

    await prisma.$disconnect();
    logger.info("PostgreSQL database connection closed cleanly.", null, "SHUTDOWN");
    process.exit(fatalError ? 1 : 0);
  } catch (shutdownError) {
    logger.error("Error during graceful shutdown", shutdownError, "SHUTDOWN");
    process.exit(1);
  }
}

// অপারেটিং সিস্টেম ও ক্লাউড হোস্টিং সিগন্যাল লিসেনার
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

// আনহ্যান্ডেলড প্রমিস রিজেকশন ও এক্সেপশন সুরক্ষা
process.on("unhandledRejection", (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  gracefulShutdown("UNHANDLED_REJECTION", err);
});

process.on("uncaughtException", (error) => {
  gracefulShutdown("UNCAUGHT_EXCEPTION", error);
});

// সার্ভার চালু করা
startServer();
