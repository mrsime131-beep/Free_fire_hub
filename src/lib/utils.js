import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merges Tailwind CSS classes safely without style conflicts
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/**
 * Formats numbers into Bangladeshi Taka (BDT) currency format
 * @param {number} amount
 * @returns {string} e.g. "৳ 150"
 */
export function formatCurrency(amount) {
  if (typeof amount !== "number" || isNaN(amount)) return "৳ 0";
  return `৳ ${amount.toLocaleString("en-IN")}`;
}

/**
 * Generates a unique random Order ID for demo checkout & tracking
 * @returns {string} e.g. "FFH-482910"
 */
export function generateOrderId() {
  const randomDigits = Math.floor(100000 + Math.random() * 900000);
  return `FFH-${randomDigits}`;
}

/**
 * Validates Free Fire Player UID ( strictly 8 to 12 numeric digits )
 * @param {string} uid
 * @returns {boolean}
 */
export function validateUID(uid) {
  if (!uid) return false;
  const cleanUid = uid.trim();
  return /^\d{8,12}$/.test(cleanUid);
}

/**
 * Validates Bangladeshi Mobile Number (11 digits starting with 01)
 * @param {string} phone
 * @returns {boolean}
 */
export function validateBDPhone(phone) {
  if (!phone) return false;
  const cleanPhone = phone.trim();
  return /^01[3-9]\d{8}$/.test(cleanPhone);
}
