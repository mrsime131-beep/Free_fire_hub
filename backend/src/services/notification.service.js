const https = require('https');
const prisma = require('../config/prisma');
const env = require('../config/env');
const {
  maskPlayerUid,
  maskPhoneNumber,
  maskTransactionReference,
} = require('../utils/mask');

/**
 * Node.js-এর বিল্ট-ইন https মডিউল দিয়ে টেলিগ্রাম বট এপিআই-তে মেসেজ পাঠানোর হেল্পার
 * (কোনো এক্সটার্নাল প্যাকেজ ছাড়াই শতভাগ ক্র্যাশ-প্রুফ)
 */
const sendTelegramMessageRaw = (botToken, chatId, text) => {
  return new Promise((resolve) => {
    if (!botToken || !chatId) {
      return resolve({
        sent: false,
        reason: 'Telegram Bot Token বা Chat ID কনফিগার করা নেই (Skipped)',
      });
    }

    const payload = JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });

    const options = {
      hostname: 'api.telegram.org',
      port: 443,
      path: `/bot${botToken}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: 8000,
    };

    const req = https.request(options, (res) => {
      let rawData = '';
      res.on('data', (chunk) => {
        rawData += chunk;
      });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ sent: true });
        } else {
          resolve({
            sent: false,
            reason: `Telegram HTTP ${res.statusCode}: ${rawData.slice(0, 150)}`,
          });
        }
      });
    });

    req.on('error', (err) => {
      resolve({ sent: false, reason: err.message });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ sent: false, reason: 'Telegram API request timeout' });
    });

    req.write(payload);
    req.end();
  });
};

/**
 * অপশনাল ইমেইল প্রেরণকারী হেল্পার (SMTP কনফিগার করা থাকলে পাঠাবে, না থাকলে স্কিপ করবে)
 */
const sendEmailRaw = async (toEmail, subject, textMessage) => {
  if (!toEmail || !env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
    return {
      sent: false,
      reason: 'SMTP Email কনফিগার করা নেই অথবা কাস্টমার ইমেইল নেই',
    };
  }

  try {
    let nodemailer;
    try {
      nodemailer = require('nodemailer');
    } catch (e) {
      return { sent: false, reason: 'nodemailer package not installed' };
    }

    const transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT || 587,
      secure: Number(env.SMTP_PORT) === 465,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from: env.EMAIL_FROM || 'noreply@freefirehub.com',
      to: toEmail,
      subject,
      text: textMessage,
    });

    return { sent: true };
  } catch (error) {
    return { sent: false, reason: error.message };
  }
};

/**
 * ১. ডাটাবেসে নোটিফিকেশন সেভ এবং নির্দিষ্ট চ্যানেলে (WEBSITE, TELEGRAM, EMAIL) ডিসপ্যাচ করার কোর ফাংশন
 */
const dispatchNotification = async ({
  order,
  eventType,
  title,
  message,
  telegramHtml = null,
  includeTelegram = true,
  includeEmail = false,
  metadata = {},
}) => {
  if (!order || !order.id) return [];

  const results = [];

  try {
    // চ্যানেল ১: WEBSITE (সবসময় ডাটাবেসে SENT হিসেবে সেভ হবে যাতে ট্র্যাকিং ও ড্যাশবোর্ডে সাথে সাথে দেখা যায়)
    const webNotif = await prisma.notification.create({
      data: {
        orderId: order.id,
        userId: order.userId || null,
        channel: 'WEBSITE',
        eventType,
        recipient: order.customerPhone || order.customerEmail || order.playerUid,
        title,
        message,
        status: 'SENT',
        sentAt: new Date(),
        metadata,
      },
    });
    results.push(webNotif);

    // চ্যানেল ২: TELEGRAM (অ্যাডমিনের টেলিগ্রামে তাৎক্ষণিক অর্ডার ও পেমেন্ট অ্যালার্ট)
    if (includeTelegram && env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
      const tgText = telegramHtml || `<b>${title}</b>\n${message}`;
      const tgResult = await sendTelegramMessageRaw(
        env.TELEGRAM_BOT_TOKEN,
        env.TELEGRAM_CHAT_ID,
        tgText
      );

      const tgNotif = await prisma.notification.create({
        data: {
          orderId: order.id,
          userId: order.userId || null,
          channel: 'TELEGRAM',
          eventType,
          recipient: env.TELEGRAM_CHAT_ID,
          title,
          message,
          status: tgResult.sent ? 'SENT' : 'FAILED',
          errorMessage: tgResult.sent ? null : tgResult.reason,
          sentAt: tgResult.sent ? new Date() : null,
          metadata,
        },
      });
      results.push(tgNotif);
    }

    // চ্যানেল ৩: EMAIL (যদি কাস্টমারের ইমেইল থাকে এবং ইমেইল নোটিফিকেশন চালু থাকে)
    if (includeEmail && order.customerEmail && env.SMTP_HOST) {
      const emailResult = await sendEmailRaw(order.customerEmail, title, message);

      const emailNotif = await prisma.notification.create({
        data: {
          orderId: order.id,
          userId: order.userId || null,
          channel: 'EMAIL',
          eventType,
          recipient: order.customerEmail,
          title,
          message,
          status: emailResult.sent ? 'SENT' : 'FAILED',
          errorMessage: emailResult.sent ? null : emailResult.reason,
          sentAt: emailResult.sent ? new Date() : null,
          metadata,
        },
      });
      results.push(emailNotif);
    }
  } catch (error) {
    console.error('⚠️ Notification dispatch non-fatal warning:', error.message);
  }

  return results;
};

/**
 * ২. অর্ডার তৈরি হওয়ার নোটিফিকেশন (ORDER_CREATED)
 */
const notifyOrderCreated = async (order) => {
  const maskedUid = maskPlayerUid(order.playerUid);
  const title = `নতুন অর্ডার তৈরি হয়েছে (${order.orderNumber})`;
  const message = `আপনার ${order.productName} (${order.diamondQuantity} Diamonds) অর্ডারটি গ্রহণ করা হয়েছে। প্রদেয় টাকা: ৳${order.finalPayableAmount}।`;

  const telegramHtml = [
    `🆕 <b>নতুন ডায়মন্ড অর্ডার!</b>`,
    `🆔 <b>Order ID:</b> <code>${order.orderNumber}</code>`,
    `🎮 <b>Player:</b> ${order.verifiedPlayerName} (UID: <code>${maskedUid}</code>)`,
    `💎 <b>Package:</b> ${order.productName} (${order.diamondQuantity} 💎)`,
    `💰 <b>Amount:</b> ৳${order.finalPayableAmount} (${order.paymentMethod})`,
    `📌 <b>Status:</b> ${order.orderStatus}`,
  ].join('\n');

  return dispatchNotification({
    order,
    eventType: 'ORDER_CREATED',
    title,
    message,
    telegramHtml,
    includeTelegram: true,
    includeEmail: false,
  });
};

/**
 * ৩. কাস্টমার ম্যানুয়াল পেমেন্ট (TrxID) সাবমিট করার নোটিফিকেশন (PAYMENT_SUBMITTED)
 */
const notifyPaymentSubmitted = async (order, payment) => {
  const maskedTrx = maskTransactionReference(
    payment?.transactionReference || order.paymentReference
  );
  const maskedSender = maskPhoneNumber(payment?.senderNumber);

  const title = `পেমেন্ট ভেরিফিকেশনের জন্য জমা হয়েছে (${order.orderNumber})`;
  const message = `আপনার ${payment?.method || order.paymentMethod} পেমেন্ট (TrxID: ${maskedTrx}) জমা হয়েছে। অ্যাডমিন যাচাই করার সাথে সাথেই ডায়মন্ড ডেলিভারি শুরু হবে।`;

  const telegramHtml = [
    `💳 <b>পেমেন্ট যাচাইয়ের অপেক্ষায় (Admin Approval Needed)</b>`,
    `🆔 <b>Order ID:</b> <code>${order.orderNumber}</code>`,
    `💎 <b>Package:</b> ${order.productName}`,
    `🏦 <b>Method:</b> ${payment?.method || order.paymentMethod}`,
    `🔢 <b>TrxID:</b> <code>${payment?.transactionReference || 'N/A'}</code>`,
    `📱 <b>Sender:</b> ${maskedSender || 'N/A'}`,
    `💰 <b>Amount:</b> ৳${order.finalPayableAmount}`,
  ].join('\n');

  return dispatchNotification({
    order,
    eventType: 'PAYMENT_SUBMITTED',
    title,
    message,
    telegramHtml,
    includeTelegram: true,
    includeEmail: false,
  });
};

/**
 * ৪. অ্যাডমিন পেমেন্ট অ্যাপ্রুভ (VERIFIED) করার নোটিফিকেশন (PAYMENT_VERIFIED)
 */
const notifyPaymentVerified = async (order) => {
  const title = `পেমেন্ট সফলভাবে ভেরিফাই হয়েছে (${order.orderNumber})`;
  const message = `আপনার পেমেন্টটি অ্যাডমিন কর্তৃক অনুমোদিত হয়েছে। এখন স্বয়ংক্রিয় ডায়মন্ড ডেলিভারি প্রসেস হচ্ছে।`;

  const telegramHtml = [
    `✅ <b>পেমেন্ট ভেরিফাইড! ডেলিভারি শুরু হচ্ছে...</b>`,
    `🆔 <b>Order ID:</b> <code>${order.orderNumber}</code>`,
    `🎮 <b>Player:</b> ${order.verifiedPlayerName}`,
    `💎 <b>Package:</b> ${order.productName}`,
  ].join('\n');

  return dispatchNotification({
    order,
    eventType: 'PAYMENT_VERIFIED',
    title,
    message,
    telegramHtml,
    includeTelegram: true,
    includeEmail: true,
  });
};

/**
 * ৫. পেমেন্ট রিজেক্ট হওয়ার নোটিফিকেশন (PAYMENT_REJECTED)
 */
const notifyPaymentRejected = async (order, reason) => {
  const cleanReason = reason || 'ট্রানজেকশন আইডি (TrxID) অথবা টাকার পরিমাণ সঠিক নয়।';
  const title = `পেমেন্ট ভেরিফিকেশন ব্যর্থ হয়েছে (${order.orderNumber})`;
  const message = `দুঃখিত, আপনার পেমেন্টটি গ্রহণ করা যায়নি। কারণ: ${cleanReason}। প্রয়োজনে সাপোর্টে (${env.SUPPORT_WHATSAPP}) যোগাযোগ করুন।`;

  const telegramHtml = [
    `❌ <b>পেমেন্ট রিজেক্ট করা হয়েছে</b>`,
    `🆔 <b>Order ID:</b> <code>${order.orderNumber}</code>`,
    `📝 <b>Reason:</b> ${cleanReason}`,
  ].join('\n');

  return dispatchNotification({
    order,
    eventType: 'PAYMENT_REJECTED',
    title,
    message,
    telegramHtml,
    includeTelegram: true,
    includeEmail: true,
  });
};

/**
 * ৬. ডায়মন্ড ডেলিভারি সফল হওয়ার নোটিফিকেশন (DELIVERY_COMPLETED)
 */
const notifyDeliveryCompleted = async (order, delivery) => {
  const isDemo = (delivery?.deliveryMode || env.DELIVERY_MODE) === 'DEMO';
  const modeLabel = isDemo ? ' [DEMO MODE]' : '';
  const deliveryRef = delivery?.deliveryReference || 'N/A';

  const title = `ডায়মন্ড ডেলিভারি সম্পন্ন হয়েছে!${modeLabel} (${order.orderNumber})`;
  const message = `অভিনন্দন! আপনার ফ্রি ফায়ার অ্যাকাউন্টে (${order.verifiedPlayerName}) ${order.diamondQuantity} ডায়মন্ড সফলভাবে ডেলিভারি করা হয়েছে। Ref: ${deliveryRef}${modeLabel}`;

  const telegramHtml = [
    `🎉 <b>ডায়মন্ড ডেলিভারি সম্পন্ন!${modeLabel}</b>`,
    `🆔 <b>Order ID:</b> <code>${order.orderNumber}</code>`,
    `🎮 <b>Player:</b> ${order.verifiedPlayerName} (<code>${maskPlayerUid(order.playerUid)}</code>)`,
    `💎 <b>Diamonds:</b> ${order.diamondQuantity} 💎`,
    `🔖 <b>Delivery Ref:</b> <code>${deliveryRef}</code>`,
  ].join('\n');

  return dispatchNotification({
    order,
    eventType: 'DELIVERY_COMPLETED',
    title,
    message,
    telegramHtml,
    includeTelegram: true,
    includeEmail: true,
    metadata: {
      deliveryReference: deliveryRef,
      deliveryMode: delivery?.deliveryMode || 'DEMO',
    },
  });
};

/**
 * ৭. ডেলিভারি ব্যর্থ বা রিট্রাই কিউতে যাওয়ার নোটিফিকেশন (DELIVERY_FAILED)
 */
const notifyDeliveryFailed = async (order, errorMessage, willRetry = false) => {
  const title = willRetry
    ? `ডেলিভারি পুনরায় চেষ্টা করা হচ্ছে (${order.orderNumber})`
    : `ডেলিভারি সাময়িকভাবে বিঘ্নিত হয়েছে (${order.orderNumber})`;

  const message = willRetry
    ? `সাপ্লায়ার সার্ভারে সাময়িক বিলম্বের কারণে আপনার অর্ডারটি স্বয়ংক্রিয় রিট্রাই কিউতে রয়েছে।`
    : `আপনার ডায়মন্ড ডেলিভারিটি স্বয়ংক্রিয়ভাবে সম্পন্ন করা যায়নি। আমাদের অ্যাডমিন টিম এটি দ্রুত ম্যানুয়ালি সমাধান করছেন। হেল্পলাইন: ${env.SUPPORT_WHATSAPP}`;

  const telegramHtml = [
    `⚠️ <b>ডেলিভারি সতর্কবার্তা (${willRetry ? 'RETRY QUEUED' : 'FAILED'})</b>`,
    `🆔 <b>Order ID:</b> <code>${order.orderNumber}</code>`,
    `🎮 <b>Player:</b> ${order.verifiedPlayerName}`,
    `❗ <b>Error:</b> ${errorMessage || 'Unknown supplier error'}`,
  ].join('\n');

  return dispatchNotification({
    order,
    eventType: willRetry ? 'DELIVERY_RETRY_QUEUED' : 'DELIVERY_FAILED',
    title,
    message,
    telegramHtml,
    includeTelegram: true,
    includeEmail: false,
  });
};

/**
 * ৮. নির্দিষ্ট অর্ডারের সব ওয়েবসাইট নোটিফিকেশন পাওয়ার ফাংশন (কাস্টমার ট্র্যাকিং পেজের জন্য)
 */
const getOrderNotifications = async (orderId) => {
  if (!orderId) return [];

  return prisma.notification.findMany({
    where: {
      orderId,
      channel: 'WEBSITE',
    },
    orderBy: {
      createdAt: 'desc',
    },
    select: {
      id: true,
      eventType: true,
      title: true,
      message: true,
      status: true,
      createdAt: true,
    },
  });
};

module.exports = {
  dispatchNotification,
  notifyOrderCreated,
  notifyPaymentSubmitted,
  notifyPaymentVerified,
  notifyPaymentRejected,
  notifyDeliveryCompleted,
  notifyDeliveryFailed,
  getOrderNotifications,
};
