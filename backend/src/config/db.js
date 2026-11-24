import { PrismaClient } from "@prisma/client";
import { env } from "./env.js";

const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: env.IS_PRODUCTION ? ["error", "warn"] : ["query", "error", "warn"],
    datasources: {
      db: {
        url: env.DATABASE_URL,
      },
    },
  });

if (!env.IS_PRODUCTION) {
  globalForPrisma.prisma = prisma;
}

/**
 * সার্ভার চালু হওয়ার সময় PostgreSQL ডাটাবেস কানেকশন যাচাই করার ফাংশন
 */
export async function connectDatabase() {
  try {
    await prisma.$connect();
    console.log("✅ PostgreSQL Database connected successfully via Prisma.");
  } catch (error) {
    console.error("❌ Failed to connect to PostgreSQL Database:", error.message);
    process.exit(1);
  }
}

/**
 * সার্ভার বন্ধ হওয়ার সময় (Graceful Shutdown) নিরাপদে ডাটাবেস কানেকশন বন্ধ করার ফাংশন
 */
export async function disconnectDatabase() {
  try {
    await prisma.$disconnect();
    console.log("🛑 PostgreSQL Database connection closed gracefully.");
  } catch (error) {
    console.error("⚠️ Error while disconnecting database:", error.message);
  }
}

/**
 * Health Check API (/api/health)-এর জন্য ডাটাবেস লাইভ পিং চেক
 */
export async function checkDatabaseHealth() {
  try {
    const startTime = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const latencyMs = Date.now() - startTime;
    return {
      connected: true,
      latencyMs,
    };
  } catch (error) {
    return {
      connected: false,
      error: error.message,
    };
  }
}
