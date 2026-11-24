import dotenv from "dotenv";
import { z } from "zod";

// Load environment variables from .env file (if present in local development)
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z
    .string()
    .default("5000")
    .transform((val) => parseInt(val, 10))
    .refine((val) => !isNaN(val) && val > 0, {
      message: "PORT must be a valid positive number",
    }),

  DATABASE_URL: z
    .string({
      required_error: "DATABASE_URL is required in environment variables",
    })
    .min(10, "DATABASE_URL cannot be empty"),

  FRONTEND_URL: z
    .string()
    .url("FRONTEND_URL must be a valid URL")
    .default("https://free-fire-hub-12.onrender.com"),

  ALLOWED_ORIGINS: z
    .string()
    .default("https://free-fire-hub-12.onrender.com,http://localhost:3000"),

  JWT_SECRET: z
    .string({
      required_error: "JWT_SECRET is required in environment variables",
    })
    .min(16, "JWT_SECRET must be at least 16 characters long for security"),

  JWT_EXPIRES_IN: z.string().default("7d"),

  PLAYER_LOOKUP_API_URL: z
    .string()
    .url("PLAYER_LOOKUP_API_URL must be a valid URL")
    .default("https://auraffxserverinfocheckerapi.onrender.com/api/player"),

  PLAYER_LOOKUP_TIMEOUT_MS: z
    .string()
    .default("10000")
    .transform((val) => parseInt(val, 10))
    .refine((val) => !isNaN(val) && val >= 2000, {
      message: "PLAYER_LOOKUP_TIMEOUT_MS must be at least 2000ms",
    }),

  BKASH_MERCHANT_NUMBER: z.string().default("01700000000"),
  NAGAD_MERCHANT_NUMBER: z.string().default("01800000000"),
  ROCKET_MERCHANT_NUMBER: z.string().default("01900000000"),

  DELIVERY_MODE: z.enum(["DEMO", "LIVE"]).default("DEMO"),
  SUPPLIER_API_BASE_URL: z.string().optional().default(""),
  SUPPLIER_API_KEY: z.string().optional().default(""),
  SUPPLIER_API_SECRET: z.string().optional().default(""),

  ADMIN_DEFAULT_EMAIL: z
    .string()
    .email("ADMIN_DEFAULT_EMAIL must be a valid email")
    .default("admin@freefirehub.bd"),
  ADMIN_DEFAULT_PASSWORD: z
    .string()
    .min(8, "ADMIN_DEFAULT_PASSWORD must be at least 8 characters")
    .default("ChangeThisAdminPassword123!"),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error("❌ Invalid or Missing Environment Variables:");
  const formattedErrors = parsedEnv.error.format();
  Object.keys(formattedErrors).forEach((key) => {
    if (key !== "_errors" && formattedErrors[key]?._errors?.length) {
      console.error(`   -> ${key}: ${formattedErrors[key]._errors.join(", ")}`);
    }
  });
  process.exit(1);
}

const allowedOriginsList = parsedEnv.data.ALLOWED_ORIGINS.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

export const env = Object.freeze({
  ...parsedEnv.data,
  ALLOWED_ORIGINS_LIST: allowedOriginsList,
  IS_PRODUCTION: parsedEnv.data.NODE_ENV === "production",
});
