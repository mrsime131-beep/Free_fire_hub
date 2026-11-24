const prisma = require('../config/prisma');

/**
 * বাংলাদেশ সময় (Asia/Dhaka, UTC+6) অনুযায়ী আজকের তারিখের কী (YYYYMMDD) তৈরি করা
 * উদাহরণ: "20261125"
 */
const getBangladeshDateKey = (date = new Date()) => {
  // UTC সময়ের সাথে ৬ ঘণ্টা যোগ করে বাংলাদেশ সময় নির্ধারণ
  const bdTime = new Date(date.getTime() + 6 * 60 * 60 * 1000);
  const year = bdTime.getUTCFullYear();
  const month = String(bdTime.getUTCMonth() + 1).padStart(2, '0');
  const day = String(bdTime.getUTCDate()).padStart(2, '0');

  return `${year}${month}${day}`;
};

/**
 * তারিখ এবং সিরিয়াল নাম্বার থেকে নির্ধারিত ফরম্যাটে অর্ডার আইডি তৈরি করা
 * Format: FFH-20261124-000001
 */
const formatOrderNumber = (dateKey, sequenceNumber) => {
  const paddedSeq = String(sequenceNumber).padStart(6, '0');
  return `FFH-${dateKey}-${paddedSeq}`;
};

/**
 * অর্ডার আইডির ফরম্যাট সঠিক কি না তা যাচাই করার হেল্পার ফাংশন
 */
const isValidOrderNumberFormat = (orderNumber) => {
  if (typeof orderNumber !== 'string') return false;
  return /^FFH-\d{8}-\d{6,}$/.test(orderNumber.trim().toUpperCase());
};

/**
 * ডাটাবেস ট্রানজেকশনের মাধ্যমে শতভাগ ডুপ্লিকেটমুক্ত (Atomic) Order ID তৈরি করা
 * @param {object} txClient - Optional Prisma Transaction Client (prisma.$transaction এর ভেতর ব্যবহারের জন্য)
 * @returns {Promise<string>} যেমন: "FFH-20261124-000001"
 */
const generateUniqueOrderNumber = async (txClient = null) => {
  const db = txClient || prisma;
  const dateKey = getBangladeshDateKey();
  const maxAttempts = 5;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // ১. DailyOrderSequence টেবিলে অ্যাটমিক ইনক্রিমেন্ট (একই সাথে একাধিক অর্ডার আসলেও ডুপ্লিকেট হবে না)
    const sequenceRecord = await db.dailyOrderSequence.upsert({
      where: { dateKey },
      update: {
        currentSeq: {
          increment: 1,
        },
      },
      create: {
        dateKey,
        currentSeq: 1,
      },
    });

    const candidateOrderNumber = formatOrderNumber(dateKey, sequenceRecord.currentSeq);

    // ২. অতিরিক্ত নিরাপত্তা: Order টেবিলে এই আইডি আগে থেকেই আছে কি না তা যাচাই করা
    const existingOrder = await db.order.findUnique({
      where: { orderNumber: candidateOrderNumber },
      select: { id: true },
    });

    if (!existingOrder) {
      return candidateOrderNumber;
    }

    // যদি কোনো কারণে ম্যানুয়ালি ডাটাবেসে একই আইডি আগে থেকে থেকে থাকে, তবে পরের সিরিয়াল চেক করবে
    console.warn(
      `⚠️ Order ID collision detected for ${candidateOrderNumber}, retrying sequence increment (Attempt ${attempt}/${maxAttempts})...`
    );
  }

  // ৩. চরম কনকারেন্সি ফলব্যাক (Timestamp + Random Suffix) যেন অর্ডার কখনোই ব্যর্থ না হয়
  const fallbackSeq = String(Date.now()).slice(-6);
  return `FFH-${dateKey}-${fallbackSeq}`;
};

module.exports = {
  getBangladeshDateKey,
  formatOrderNumber,
  isValidOrderNumberFormat,
  generateUniqueOrderNumber,
};
