const { AppError } = require('../../../middlewares/error.middleware');

/**
 * BaseSupplierAdapter
 * Adapter Pattern-এর মূল ভিত্তি। প্রতিটি সাপ্লায়ার অ্যাডাপ্টার (Demo বা Live HTTP API)
 * এই ক্লাসটিকে এক্সটেন্ড করবে এবং একই স্ট্যান্ডার্ড ফরম্যাটে রেসপন্স রিটার্ন করবে।
 */
class BaseSupplierAdapter {
  constructor(supplierConfig = {}) {
    this.supplier = supplierConfig;
    this.supplierId = supplierConfig.id || null;
    this.supplierCode = supplierConfig.code || 'UNKNOWN_SUPPLIER';
    this.supplierName = supplierConfig.name || 'Unnamed Supplier';
    this.adapterType = supplierConfig.adapterType || 'DEMO';
    this.timeoutMs = Number(supplierConfig.timeoutMs) || 15000;
  }

  /**
   * ১. সাপ্লায়ার অ্যাক্টিভ এবং কনফিগারেশন সঠিক আছে কি না তা যাচাই করা
   */
  validateSupplierConfig() {
    if (!this.supplier || !this.supplier.isActive) {
      throw new AppError(
        `সাপ্লায়ার (${this.supplierCode}) বর্তমানে নিষ্ক্রিয় (Inactive) অবস্থায় রয়েছে।`,
        503,
        'SUPPLIER_INACTIVE'
      );
    }
    return true;
  }

  /**
   * ২. সাপ্লায়ার রিকোয়েস্টের জন্য স্ট্যান্ডার্ড পেলোড তৈরি করা
   */
  buildStandardRequestPayload({
    order,
    supplierProduct,
    attemptNumber,
    idempotencyKey,
  }) {
    if (!order || !order.playerUid) {
      throw new AppError(
        'ডেলিভারি রিকোয়েস্টের জন্য অর্ডার এবং Player UID আবশ্যক।',
        400,
        'INVALID_DELIVERY_ORDER_DATA'
      );
    }

    return {
      idempotencyKey,
      orderNumber: order.orderNumber,
      orderId: order.id,
      playerUid: String(order.playerUid).trim(),
      verifiedPlayerName: order.verifiedPlayerName,
      gameServer: order.gameServer || 'BD',
      productCode:
        supplierProduct?.externalProductCode || `EXT_${order.productId}`,
      diamondQuantity: Number(order.diamondQuantity),
      attemptNumber: Number(attemptNumber) || 1,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * ৩. ডাটাবেসে (DeliveryAttempt টেবিলে) লগ সেভ করার আগে API Key বা Secret লুকিয়ে ফেলা
   */
  sanitizePayloadForLog(payload) {
    if (!payload || typeof payload !== 'object') return payload || null;

    try {
      const cloned = JSON.parse(JSON.stringify(payload));
      const secretKeys = [
        'apikey',
        'api_key',
        'apisecret',
        'api_secret',
        'secret',
        'token',
        'authorization',
        'password',
        'signature',
      ];

      const maskSecrets = (obj) => {
        if (Array.isArray(obj)) return obj.map(maskSecrets);
        if (obj && typeof obj === 'object') {
          const out = {};
          for (const [k, v] of Object.entries(obj)) {
            if (secretKeys.includes(k.toLowerCase())) {
              out[k] = '[REDACTED_SECRET]';
            } else {
              out[k] = maskSecrets(v);
            }
          }
          return out;
        }
        return obj;
      };

      return maskSecrets(cloned);
    } catch (e) {
      return { note: 'Payload log omitted' };
    }
  }

  /**
   * ৪. সব সাপ্লায়ারের রেসপন্স একটি অভিন্ন (Normalized) স্ট্রাকচারে রূপান্তর করা
   */
  normalizeAdapterResponse({
    success = false,
    isRealDelivery = false,
    deliveryMode = this.adapterType,
    status = 'FAILED',
    deliveryReference = null,
    externalOrderId = null,
    httpStatus = 200,
    requestPayload = null,
    responsePayload = null,
    errorCode = null,
    errorMessage = null,
    isTimeout = false,
    requiresStatusCheck = false,
    durationMs = 0,
  }) {
    return {
      success: Boolean(success),
      isRealDelivery: Boolean(isRealDelivery),
      deliveryMode: deliveryMode === 'LIVE' ? 'LIVE' : 'DEMO',
      status, // 'COMPLETED' | 'PROCESSING' | 'RETRY_PENDING' | 'FAILED'
      deliveryReference: deliveryReference || null,
      externalOrderId: externalOrderId || null,
      httpStatus: Number(httpStatus) || 500,
      requestPayload: this.sanitizePayloadForLog(requestPayload),
      responsePayload: this.sanitizePayloadForLog(responsePayload),
      errorCode: errorCode || null,
      errorMessage: errorMessage || null,
      isTimeout: Boolean(isTimeout),
      requiresStatusCheck: Boolean(requiresStatusCheck),
      durationMs: Number(durationMs) || 0,
    };
  }

  /**
   * ৫. ডায়মন্ড টপ-আপ রিকোয়েস্ট পাঠানোর মেথড (Child Adapter এটি ইমপ্লিমেন্ট করবে)
   */
  async executeTopUp(/* { order, supplierProduct, attemptNumber, idempotencyKey } */) {
    throw new AppError(
      `executeTopUp() মেথডটি ${this.constructor.name} অ্যাডাপ্টারে ইমপ্লিমেন্ট করা হয়নি।`,
      500,
      'ADAPTER_METHOD_NOT_IMPLEMENTED'
    );
  }

  /**
   * ৬. আগের রিকোয়েস্ট টাইমআউট হলে পুনরায় ডায়মন্ড পাঠানোর আগে স্ট্যাটাস যাচাই করার মেথড
   * (ডুপ্লিকেট ডায়মন্ড ডেলিভারি প্রতিরোধের জন্য আবশ্যক - Part 6)
   */
  async checkPreviousAttemptStatus(/* { order, delivery, lastAttempt } */) {
    throw new AppError(
      `checkPreviousAttemptStatus() মেথডটি ${this.constructor.name} অ্যাডাপ্টারে ইমপ্লিমেন্ট করা হয়নি।`,
      500,
      'ADAPTER_STATUS_CHECK_NOT_IMPLEMENTED'
    );
  }
}

module.exports = BaseSupplierAdapter;
