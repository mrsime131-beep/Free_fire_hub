const jwt = require('jsonwebtoken');
const env = require('../config/env');
const prisma = require('../config/prisma');

/**
 * Request Header বা Cookie থেকে JWT Token বের করার হেল্পার ফাংশন
 */
const extractToken = (req) => {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }

  if (req.headers['x-access-token']) {
    return String(req.headers['x-access-token']).trim();
  }

  if (req.cookies && (req.cookies.ffh_token || req.cookies.token)) {
    return req.cookies.ffh_token || req.cookies.token;
  }

  return null;
};

/**
 * ইউজারের জন্য নতুন JWT Token তৈরি করার হেল্পার ফাংশন
 */
const generateToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
    },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN }
  );
};

/**
 * ১. কঠোর অথেনটিকেশন মিডলওয়্যার (লগইন করা ইউজার ও অ্যাডমিনের জন্য)
 */
const authenticate = async (req, res, next) => {
  try {
    const token = extractToken(req);

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'অ্যাক্সেস অনুমোদিত নয়। অনুগ্রহ করে লগইন করুন।',
      });
    }

    const decoded = jwt.verify(token, env.JWT_SECRET);

    // ডাটাবেস থেকে ইউজার যাচাই করা
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        isActive: true,
      },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'USER_NOT_FOUND',
        message: 'ইউজার অ্যাকাউন্টটি খুঁজে পাওয়া যায়নি। আবার লগইন করুন।',
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        error: 'ACCOUNT_DISABLED',
        message: 'আপনার অ্যাকাউন্টটি সাময়িকভাবে স্থগিত করা হয়েছে।',
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'TOKEN_EXPIRED',
        message: 'আপনার লগইন সেশনের মেয়াদ শেষ হয়েছে। অনুগ্রহ করে পুনরায় লগইন করুন।',
      });
    }

    return res.status(401).json({
      success: false,
      error: 'INVALID_TOKEN',
      message: 'অবৈধ লগইন টোকেন। অনুগ্রহ করে পুনরায় লগইন করুন।',
    });
  }
};

/**
 * ২. অপশনাল অথেনটিকেশন মিডলওয়্যার (কাস্টমার ও গেস্ট উভয়ের চেকআউটের জন্য)
 * টোকেন থাকলে req.user সেট করবে, না থাকলে Guest হিসেবে অর্ডার করতে দেবে।
 */
const optionalAuth = async (req, res, next) => {
  try {
    const token = extractToken(req);
    const guestHeader = req.headers['x-guest-id'];
    req.guestId = guestHeader ? String(guestHeader).trim() : null;

    if (!token) {
      req.user = null;
      return next();
    }

    const decoded = jwt.verify(token, env.JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        isActive: true,
      },
    });

    req.user = user && user.isActive ? user : null;
    next();
  } catch (error) {
    // টোকেন ভুল বা মেয়াদোত্তীর্ণ হলেও গেস্ট চেকআউট ব্লক করবে না
    req.user = null;
    next();
  }
};

/**
 * ৩. সার্ভার-সাইড অ্যাডমিন অথরাইজেশন মিডলওয়্যার (শুধুমাত্র ADMIN ও SUPER_ADMIN)
 */
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'অ্যাডমিন প্যানেলে প্রবেশের জন্য প্রথমে লগইন করুন।',
    });
  }

  const allowedRoles = ['ADMIN', 'SUPER_ADMIN'];
  if (!allowedRoles.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      error: 'FORBIDDEN_ADMIN_ACCESS',
      message: 'এই অ্যাকশনটি শুধুমাত্র অনুমোদিত অ্যাডমিনের জন্য সংরক্ষিত।',
    });
  }

  next();
};

/**
 * ৪. কাস্টম রোল অথরাইজেশন মিডলওয়্যার
 */
const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN_ROLE',
        message: 'আপনার এই রিসোর্সটি ব্যবহারের অনুমতি নেই।',
      });
    }
    next();
  };
};

module.exports = {
  extractToken,
  generateToken,
  authenticate,
  optionalAuth,
  requireAdmin,
  authorizeRoles,
  // আগের কোডের সাথে সামঞ্জস্য রাখার জন্য Aliases
  protect: authenticate,
  verifyToken: authenticate,
  adminOnly: requireAdmin,
  isAdmin: requireAdmin,
};
