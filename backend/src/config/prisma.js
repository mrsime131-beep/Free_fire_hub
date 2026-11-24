const { PrismaClient } = require('@prisma/client');
const env = require('./env');

// Use global instance in development to prevent exhausting Neon PostgreSQL connection limits
const globalForPrisma = globalThis;

const createPrismaClient = () => {
  return new PrismaClient({
    log:
      env.NODE_ENV === 'development'
        ? ['query', 'info', 'warn', 'error']
        : ['warn', 'error'],
    errorFormat: 'minimal',
  });
};

const prisma = globalForPrisma.__ffhPrismaClient || createPrismaClient();

if (env.NODE_ENV !== 'production') {
  globalForPrisma.__ffhPrismaClient = prisma;
}

/**
 * Helper to verify database connectivity on server startup or health check
 */
async function checkDatabaseConnection() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { connected: true, status: 'CONNECTED' };
  } catch (error) {
    console.error('❌ Database connection check failed:', error.message);
    return {
      connected: false,
      status: 'DISCONNECTED',
      error: error.message,
    };
  }
}

// Graceful shutdown handling for Render container restarts
const handleShutdown = async (signal) => {
  try {
    console.log(`🔌 Received ${signal}. Closing Prisma database connection...`);
    await prisma.$disconnect();
  } catch (err) {
    console.error('❌ Error during Prisma disconnect:', err.message);
  }
};

process.once('SIGINT', () => handleShutdown('SIGINT'));
process.once('SIGTERM', () => handleShutdown('SIGTERM'));

// Attach self-reference and helpers so both `const prisma = require(...)`
// and `const { prisma, checkDatabaseConnection } = require(...)` work seamlessly.
prisma.prisma = prisma;
prisma.checkDatabaseConnection = checkDatabaseConnection;

module.exports = prisma;
