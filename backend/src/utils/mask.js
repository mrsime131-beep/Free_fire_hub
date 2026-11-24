/**
 * ফ্রি ফায়ার প্লেয়ার ইউআইডি (Player UID) আংশিক মাস্ক করার ফাংশন
 * উদাহরণ: "1829374650" -> "182****650"
 */
const maskPlayerUid = (uid) => {
  if (!uid) return 'N/A';
  const cleanUid = String(uid).trim();

  if (cleanUid.length <= 4) {
    return `${cleanUid[0] || '*'}***`;
  }

  if (cleanUid.length <= 7) {
    const start = cleanUid.slice(0, 2);
    const end = cleanUid.slice(-2);
    return `${start}${'*'.repeat(cleanUid.length - 4)}${end}`;
  }

  const start = cleanUid.slice(0, 3);
  const end = cleanUid.slice(-3);
  const middleLength = Math.max(3, cleanUid.length - 6);
  return `${start}${'*'.repeat(middleLength)}${end}`;
};

/**
 * মোবাইল নাম্বার মাস্ক করার ফাংশন (কাস্টমারের গোপনীয়তা রক্ষার জন্য)
 * উদাহরণ: "01623759878" -> "016*****878"
 */
const maskPhoneNumber = (phone) => {
  if (!phone) return null;
  const cleanPhone = String(phone).trim();

  if (cleanPhone.length < 7) {
    return '****';
  }

  const start = cleanPhone.slice(0, 3);
  const end = cleanPhone.slice(-3);
  return `${start}*****${end}`;
};

/**
 * ইমেইল অ্যাড্রেস মাস্ক করার ফাংশন
 * উদাহরণ: "customer@gmail.com" -> "cu****er@gmail.com"
 */
const maskEmail = (email) => {
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return null;
  }

  const [localPart, domainPart] = email.trim().split('@');
  if (!domainPart) return '****';

  if (localPart.length <= 2) {
    return `${localPart[0] || '*'}***@${domainPart}`;
  }

  const start = localPart.slice(0, 2);
  const end = localPart.length > 4 ? localPart.slice(-1) : '';
  return `${start}****${end}@${domainPart}`;
};

/**
 * পেমেন্ট ট্রানজেকশন রেফারেন্স (TrxID) আংশিক মাস্ক করার ফাংশন
 * উদাহরণ: "BKS98237492" -> "BKS****492"
 */
const maskTransactionReference = (trxId) => {
  if (!trxId) return null;
  const cleanTrx = String(trxId).trim();

  if (cleanTrx.length <= 5) {
    return `${cleanTrx.slice(0, 2)}***`;
  }

  const start = cleanTrx.slice(0, 3);
  const end = cleanTrx.slice(-3);
  return `${start}****${end}`;
};

/**
 * পাবলিক অর্ডার ট্র্যাকিং ও নোটিফিকেশনের জন্য অর্ডারের সংবেদনশীল তথ্য নিরাপদভাবে মাস্ক করার হেল্পার
 */
const sanitizeOrderForPublicTracking = (order) => {
  if (!order) return null;

  return {
    orderId: order.orderNumber,
    playerUid: maskPlayerUid(order.playerUid),
    verifiedPlayerName: order.verifiedPlayerName,
    gameServer: order.gameServer || 'BD',
    productName: order.productName,
    diamondQuantity: order.diamondQuantity,
    finalPayableAmount: Number(order.finalPayableAmount || 0),
    currency: order.currency || 'BDT',
    paymentMethod: order.paymentMethod,
    paymentReference: maskTransactionReference(
      order.payment?.transactionReference || order.paymentReference
    ),
    orderStatus: order.orderStatus,
    paymentStatus: order.paymentStatus,
    deliveryStatus: order.deliveryStatus,
    deliveryMode: order.delivery?.deliveryMode || 'DEMO',
    deliveryReference: order.delivery?.deliveryReference || null,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    completedAt: order.completedAt || order.delivery?.completedAt || null,
  };
};

module.exports = {
  maskPlayerUid,
  maskPhoneNumber,
  maskEmail,
  maskTransactionReference,
  sanitizeOrderForPublicTracking,
};
