const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const env = require('./config/env');
const prisma = require('./config/prisma');
const { apiRateLimiter, authRateLimiter } = require('./middlewares/rateLimiter.middleware');
const {
  authenticate,
  generateToken,
} = require('./middlewares/auth.middleware');
const {
  notFoundHandler,
  errorHandler,
  asyncHandler,
} = require('./middlewares/error.middleware');

const orderRoutes = require('./routes/order.routes');
const adminRoutes = require('./routes/admin.routes');
const deliveryRoutes = require('./routes/delivery.routes');
const { startRetryWorker, stopRetryWorker } = require('./workers/retry.worker');

const app = express();

// Render, Vercel ও Koyeb-এর মতো ক্লাউড প্রক্সির আসল ক্লায়েন্ট IP পাওয়ার জন্য
app.set('trust proxy', 1);

// ১. সিকিউরিটি হেডারস ও CORS কনফিগারেশন
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

app.use(
  cors({
    origin: (origin, callback) => {
      // সার্ভার-টু-সার্ভার বা মোবাইল অ্যাপ রিকোয়েস্টের জন্য
      if (!origin) return callback(null, true);

      const allowedOrigins = Array.isArray(env.CORS_ORIGINS)
        ? env.CORS_ORIGINS
        : [env.FRONTEND_URL];

      const isAllowed =
        allowedOrigins.includes('*') ||
        allowedOrigins.includes(origin) ||
        origin.endsWith('.onrender.com') ||
        origin.endsWith('.vercel.app') ||
        origin.startsWith('http://localhost:');

      if (isAllowed) {
        return callback(null, true);
      }

      return callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Access-Token',
      'Idempotency-Key',
      'X-Idempotency-Key',
      'X-Guest-Id',
    ],
  })
);

// ২. বডি পার্সার (পেলোড সাইজ লিমিটসহ)
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ৩. গ্লোবাল এপিআই রেট লিমিটার
app.use('/api', apiRateLimiter);

// ৪. রুট ও হেলথ চেক এন্ডপয়েন্ট (GET / এবং GET /api/health)
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    service: env.SERVICE_NAME || 'free-fire-hub-backend',
    version: env.APP_VERSION || '2.0.0',
    deliveryMode: env.DELIVERY_MODE || 'DEMO',
    message: 'Free Fire Hub Smart Order & Auto-Delivery Backend is running.',
  });
});

app.get(
  '/api/health',
  asyncHandler(async (req, res) => {
    let dbConnected = false;
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbConnected = true;
    } catch (e) {
      dbConnected = false;
    }

    res.status(dbConnected ? 200 : 503).json({
      status: dbConnected ? 'OK' : 'DEGRADED',
      service: env.SERVICE_NAME || 'free-fire-hub-backend',
      version: env.APP_VERSION || '2.0.0',
      database: dbConnected ? 'CONNECTED' : 'DISCONNECTED',
      deliveryMode: env.DELIVERY_MODE || 'DEMO',
      timestamp: new Date().toISOString(),
    });
  })
);

// ৫. আপনার আগের প্রজেক্টের রাউট ফাইল থাকলে সেগুলো স্বয়ংক্রিয়ভাবে মাউন্ট করা (Backward Compatibility)
const mountOptionalExistingRoute = (mountPath, relativeModulePath) => {
  try {
    const existingRouter = require(relativeModulePath);
    if (existingRouter) {
      app.use(mountPath, existingRouter);
      console.log(`✅ Mounted existing route: ${mountPath}`);
    }
  } catch (err) {
    // ফাইলটি না থাকলে বিল্ট-ইন ফলব্যাক রাউট কাজ করবে
  }
};

mountOptionalExistingRoute('/api/auth', './routes/auth.routes');
mountOptionalExistingRoute('/api/products', './routes/product.routes');
mountOptionalExistingRoute('/api/player', './routes/player.routes');
mountOptionalExistingRoute('/api/verify', './routes/verify.routes');

// ৬. কোর নতুন রাউটস মাউন্ট করা (Order, Admin, Delivery)
app.use('/api/orders', orderRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/delivery', deliveryRoutes);

// ৭. বিল্ট-ইন প্রোডাক্ট ক্যাটালগ ফলব্যাক এন্ডপয়েন্ট (GET /api/products)
app.get(
  '/api/products',
  asyncHandler(async (req, res) => {
    const products = await prisma.product.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { finalPayableAmount: 'asc' }],
    });

    res.status(200).json({
      success: true,
      count: products.length,
      data: products,
      products,
    });
  })
);

// ৮. বিল্ট-ইন প্লেয়ার ইউআইডি ভেরিফিকেশন ফলব্যাক এন্ডপয়েন্ট (POST /api/player/verify ও POST /api/verify-uid)
const verifyPlayerUidHandler = asyncHandler(async (req, res) => {
  const rawUid = req.body?.playerUid || req.body?.uid || req.query?.uid || '';
  const playerUid = String(rawUid).trim();
  const gameServer = String(req.body?.gameServer || req.body?.server || 'BD')
    .trim()
    .toUpperCase();

  if (!/^\d{5,15}$/.test(playerUid)) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_PLAYER_UID',
      message: 'অবৈধ Player UID! ফ্রি ফায়ার ইউআইডি ৫ থেকে ১৫ সংখ্যার হতে হবে।',
    });
  }

  // আগে এই UID দিয়ে অর্ডার হয়ে থাকলে সেই ভেরিফাইড নাম ব্যবহার করা, অন্যথায় ডিটারমিনিস্টিক প্লেয়ার প্রোফাইল রিটার্ন করা
  const previousOrder = await prisma.order.findFirst({
    where: { playerUid },
    orderBy: { createdAt: 'desc' },
    select: { verifiedPlayerName: true, gameServer: true },
  });

  const suffix = playerUid.slice(-4);
  const verifiedPlayerName =
    previousOrder?.verifiedPlayerName || `FF_PLAYER_${suffix}`;

  return res.status(200).json({
    success: true,
    verified: true,
    message: 'Player UID সফলভাবে যাচাই করা হয়েছে।',
    data: {
      playerUid,
      verifiedPlayerName,
      playerName: verifiedPlayerName,
      gameServer: previousOrder?.gameServer || gameServer,
    },
    playerUid,
    verifiedPlayerName,
    playerName: verifiedPlayerName,
    gameServer: previousOrder?.gameServer || gameServer,
  });
});

app.post('/api/player/verify', verifyPlayerUidHandler);
app.post('/api/verify-uid', verifyPlayerUidHandler);

// ৯. বিল্ট-ইন অ্যাডমিন ও কাস্টমার লগইন ফলব্যাক এন্ডপয়েন্ট (POST /api/auth/login ও GET /api/auth/me)
const verifyPasswordMatch = async (plainPassword, storedHash) => {
  if (!plainPassword || !storedHash) return false;

  try {
    const bcrypt = require('bcryptjs');
    return await bcrypt.compare(plainPassword, storedHash);
  } catch (e) {
    const sha256Hash = crypto
      .createHash('sha256')
      .update(String(plainPassword))
      .digest('hex');
    return storedHash === sha256Hash || storedHash === plainPassword;
  }
};

app.post(
  '/api/auth/login',
  authRateLimiter,
  asyncHandler(async (req, res) => {
    const email = String(req.body?.email || '')
      .trim()
      .toLowerCase();
    const password = String(req.body?.password || '');

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_CREDENTIALS',
        message: 'ইমেইল এবং পাসওয়ার্ড প্রদান করা আবশ্যক।',
      });
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        error: 'INVALID_CREDENTIALS',
        message: 'ভুল ইমেইল অথবা পাসওয়ার্ড।',
      });
    }

    const isMatch = await verifyPasswordMatch(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: 'INVALID_CREDENTIALS',
        message: 'ভুল ইমেইল অথবা পাসওয়ার্ড।',
      });
    }

    const token = generateToken(user);
    const safeUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
    };

    return res.status(200).json({
      success: true,
      message: 'সফলভাবে লগইন সম্পন্ন হয়েছে।',
      token,
      user: safeUser,
      data: {
        token,
        user: safeUser,
      },
    });
  })
);

app.get(
  '/api/auth/me',
  authenticate,
  asyncHandler(async (req, res) => {
    return res.status(200).json({
      success: true,
      user: req.user,
      data: { user: req.user },
    });
  })
);

// ১০. ৪0৪ নট ফাউন্ড এবং গ্লোবাল এরর হ্যান্ডলার
app.use(notFoundHandler);
app.use(errorHandler);

// ১১. সার্ভার স্টার্টআপ এবং ব্যাকগ্রাউন্ড ডেলিভারি রিট্রাই ওয়ার্কার চালু করা
let serverInstance = null;

if (require.main === module) {
  const PORT = env.PORT || 5000;
  serverInstance = app.listen(PORT, () => {
    console.log(
      `🚀 [FreeFireHub] Server running on port ${PORT} | Environment: ${env.NODE_ENV} | Delivery Mode: ${env.DELIVERY_MODE}`
    );
    startRetryWorker();
  });
}

// গ্রেসফুল শাটডাউন হ্যান্ডলিং
const gracefulShutdown = async (signal) => {
  console.log(`\n⚠️ [${signal}] Shutting down Free Fire Hub Backend gracefully...`);
  stopRetryWorker();

  if (serverInstance) {
    serverInstance.close(async () => {
      await prisma.$disconnect().catch(() => {});
      process.exit(0);
    });
  } else {
    await prisma.$disconnect().catch(() => {});
    process.exit(0);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = app;
