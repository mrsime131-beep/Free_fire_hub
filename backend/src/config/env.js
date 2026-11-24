const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env file if available
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const parseNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseBoolean = (value, fallback = false) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  }
  return fallback;
};

const env = {
  // Server & Environment
  NODE_ENV: process.env.NODE_ENV || 'production',
  PORT: parseNumber(process.env.PORT, 5000),
  SERVICE_NAME: process.env.SERVICE_NAME || 'freefirehub-bd-backend',
  APP_VERSION: process.env.APP_VERSION || '1.0.0',

  // Database
  DATABASE_URL: process.env.DATABASE_URL || '',

  // Frontend & CORS Configuration
  FRONTEND_URL: process.env.FRONTEND_URL || 'https://free-fire-hub.onrender.com',
  BACKEND_URL: process.env.BACKEND_URL || 'https://free-fire-hub-main.onrender.com',
  CORS_ORIGINS: (
    process.env.CORS_ORIGINS ||
    'https://free-fire-hub.onrender.com,http://localhost:3000,http://127.0.0.1:3000'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),

  // JWT & Authentication Security
  JWT_SECRET:
    process.env.JWT_SECRET || 'ffh_smart_order_delivery_jwt_secret_key_2026_v1',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',

  // Admin & Support Contact Configuration
  ADMIN_EMAIL: (process.env.ADMIN_EMAIL || 'mrsadhin131@gmail.com')
    .trim()
    .toLowerCase(),
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || '7681573669',
  ADMIN_PHONE: process.env.ADMIN_PHONE || '01623759878',
  SUPPORT_WHATSAPP: process.env.SUPPORT_WHATSAPP || '01623759878',
  SUPPORT_TELEGRAM: process.env.SUPPORT_TELEGRAM || '01623759878',

  // Manual Payment Numbers (v1.0 Manual Admin Approval Mode)
  MANUAL_PAYMENT_ENABLED: parseBoolean(process.env.MANUAL_PAYMENT_ENABLED, true),
  BKASH_NUMBER: process.env.BKASH_NUMBER || '01623759878',
  NAGAD_NUMBER: process.env.NAGAD_NUMBER || '01623759878',
  ROCKET_NUMBER: process.env.ROCKET_NUMBER || '01623759878',

  // Smart Delivery Engine & Supplier Configuration
  DELIVERY_MODE:
    (process.env.DELIVERY_MODE || 'DEMO').toUpperCase() === 'LIVE'
      ? 'LIVE'
      : 'DEMO',
  SUPPLIER_API_URL: process.env.SUPPLIER_API_URL || '',
  SUPPLIER_API_KEY: process.env.SUPPLIER_API_KEY || '',
  SUPPLIER_API_SECRET: process.env.SUPPLIER_API_SECRET || '',
  SUPPLIER_WEBHOOK_SECRET: process.env.SUPPLIER_WEBHOOK_SECRET || '',
  SUPPLIER_TIMEOUT_MS: parseNumber(process.env.SUPPLIER_TIMEOUT_MS, 15000),

  // Smart Retry & Idempotency Settings
  MAX_DELIVERY_RETRIES: parseNumber(process.env.MAX_DELIVERY_RETRIES, 3),
  RETRY_BASE_DELAY_MS: parseNumber(process.env.RETRY_BASE_DELAY_MS, 30000),
  IDEMPOTENCY_TTL_HOURS: parseNumber(process.env.IDEMPOTENCY_TTL_HOURS, 24),

  // Player UID Lookup API
  PLAYER_LOOKUP_API_URL: process.env.PLAYER_LOOKUP_API_URL || '',

  // Notification Channels (Telegram & Email)
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || '',
  SMTP_HOST: process.env.SMTP_HOST || '',
  SMTP_PORT: parseNumber(process.env.SMTP_PORT, 587),
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  EMAIL_FROM: process.env.EMAIL_FROM || 'noreply@freefirehub.com',
};

// Startup validation check
if (!env.DATABASE_URL) {
  console.warn(
    '⚠️ WARNING: DATABASE_URL is not set in environment variables. Database operations will fail until configured.'
  );
}

module.exports = env;
