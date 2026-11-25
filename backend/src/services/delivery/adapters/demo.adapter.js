const crypto = require('crypto');
const BaseSupplierAdapter = require('./base.adapter');

/**
 * DemoSupplierAdapter
 * যখন কোনো বাস্তব (Live) Supplier API যুক্ত থাকবে না বা সিস্টেম DEMO মোডে থাকবে,
 * তখন এই অ্যাডাপ্টারটি অর্ডারের সম্পূর্ণ অটোমেশন ও রিট্রাই ফ্লো পরীক্ষা করার জন্য ব্যবহৃত হবে।
 * এটি কখনোই নিজেকে বাস্তব ডায়মন্ড ডেলিভারি (isRealDelivery: false) হিসেবে দাবি করবে না।
 */
class DemoSupplierAdapter extends BaseSupplierAdapter {
  constructor(supplierConfig = {}) {
    super({
      ...supplierConfig,
      adapterType: 'DEMO',
    });
  }

  /**
   * স্পষ্টভাবে DEMO চিহ্নিত ইউনিক ডেলিভারি রেফারেন্স তৈরি করা
   * উদাহরণ: DEMO-FFH-20261124-000001-A1B2C3
   */
  generateDemoReference(orderNumber, idempotencyKey) {
    const hashSuffix = crypto
      .createHash('md5')
      .update(`${orderNumber}:${idempotencyKey}`)
      .digest('hex')
      .slice(0, 6)
      .toUpperCase();

    return `DEMO-${orderNumber}-${hashSuffix}`;
  }

  /**
   * ১. DEMO মোডে ডায়মন্ড টপ-আপ সিমুলেশন এক্সিকিউট করা
   * (Part 15-এর টেস্ট কেস যেমন: Supplier Success, Supplier Failure ও Supplier Timeout সাপোর্টসহ)
   */
  async executeTopUp({
    order,
    supplierProduct = null,
    attemptNumber = 1,
    idempotencyKey,
  }) {
    const startTime = Date.now();
    this.validateSupplierConfig();

    const requestPayload = {
      ...this.buildStandardRequestPayload({
        order,
        supplierProduct,
        attemptNumber,
        idempotencyKey,
      }),
      mode: 'DEMO_SIMULATION',
    };

    const notes = String(order.notes || '').toUpperCase();
    const uid = String(order.playerUid || '').trim();

    // টেস্ট কেস ১০ (Part 15): Supplier Failure সিমুলেশন
    if (notes.includes('TEST_SUPPLIER_FAIL') || uid === '9999999991') {
      const durationMs = Date.now() - startTime;
      return this.normalizeAdapterResponse({
        success: false,
        isRealDelivery: false,
        deliveryMode: 'DEMO',
        status: 'RETRY_PENDING',
        httpStatus: 502,
        requestPayload,
        responsePayload: {
          mode: 'DEMO',
          isRealDelivery: false,
          simulatedScenario: 'SUPPLIER_FAILURE',
          message: 'DEMO Supplier simulated temporary upstream error.',
        },
        errorCode: 'DEMO_SUPPLIER_REJECTED',
        errorMessage:
          '[DEMO MODE] সাপ্লায়ার সার্ভারে সাময়িক ত্রুটি (Simulated Failure)। রিট্রাই কিউতে পাঠানো হয়েছে।',
        isTimeout: false,
        requiresStatusCheck: false,
        durationMs,
      });
    }

    // টেস্ট কেস ১১ (Part 15): Supplier Timeout সিমুলেশন
    if (notes.includes('TEST_SUPPLIER_TIMEOUT') || uid === '9999999992') {
      const durationMs = Date.now() - startTime;
      return this.normalizeAdapterResponse({
        success: false,
        isRealDelivery: false,
        deliveryMode: 'DEMO',
        status: 'RETRY_PENDING',
        httpStatus: 504,
        requestPayload,
        responsePayload: {
          mode: 'DEMO',
          isRealDelivery: false,
          simulatedScenario: 'SUPPLIER_TIMEOUT',
          message: 'DEMO Supplier request timed out before confirmation.',
        },
        errorCode: 'DEMO_SUPPLIER_TIMEOUT',
        errorMessage:
          '[DEMO MODE] সাপ্লায়ার রেসপন্স টাইমআউট হয়েছে। পুনরায় পাঠানোর পূর্বে পূর্ববর্তী স্ট্যাটাস যাচাই করা হবে।',
        isTimeout: true,
        requiresStatusCheck: true,
        durationMs,
      });
    }

    // স্বাভাবিক DEMO Success Flow (স্পষ্টভাবে DEMO হিসেবে চিহ্নিত)
    const demoDeliveryRef = this.generateDemoReference(
      order.orderNumber,
      idempotencyKey
    );
    const externalOrderId = `DEMO_EXT_${order.id.slice(0, 8).toUpperCase()}`;
    const durationMs = Date.now() - startTime;

    const responsePayload = {
      mode: 'DEMO',
      isRealDelivery: false,
      demoNotice:
        'DEMO MODE ONLY: This is a simulated delivery record. No real Free Fire diamonds were dispatched.',
      supplierCode: this.supplierCode,
      deliveryReference: demoDeliveryRef,
      externalOrderId,
      playerUid: order.playerUid,
      verifiedPlayerName: order.verifiedPlayerName,
      diamondQuantity: order.diamondQuantity,
      processedAt: new Date().toISOString(),
    };

    return this.normalizeAdapterResponse({
      success: true,
      isRealDelivery: false,
      deliveryMode: 'DEMO',
      status: 'COMPLETED',
      deliveryReference: demoDeliveryRef,
      externalOrderId,
      httpStatus: 200,
      requestPayload,
      responsePayload,
      errorCode: null,
      errorMessage: null,
      isTimeout: false,
      requiresStatusCheck: false,
      durationMs,
    });
  }

  /**
   * ২. পূর্ববর্তী টাইমআউট হওয়া রিকোয়েস্টের ফলাফল যাচাই করা (Part 6: Safe Retry Mechanism)
   * নিশ্চিত না হয়ে যাতে দ্বিতীয়বার ডুপ্লিকেট ডেলিভারি না যায়।
   */
  async checkPreviousAttemptStatus({ order, delivery, lastAttempt }) {
    this.validateSupplierConfig();

    if (!lastAttempt) {
      return {
        found: false,
        alreadyDelivered: false,
        status: 'NOT_FOUND',
        deliveryReference: null,
      };
    }

    // যদি আগের অ্যাটেম্পটে ইতিমধ্যে ডেলিভারি রেফারেন্স তৈরি হয়ে থাকে, তবে পুনরায় ডায়মন্ড পাঠাবে না
    if (lastAttempt.deliveryRef || delivery?.deliveryReference) {
      return {
        found: true,
        alreadyDelivered: true,
        status: 'COMPLETED',
        deliveryReference:
          lastAttempt.deliveryRef || delivery.deliveryReference,
        deliveryMode: 'DEMO',
        isRealDelivery: false,
      };
    }

    return {
      found: true,
      alreadyDelivered: false,
      status: 'FAILED_CONFIRMED',
      deliveryReference: null,
      deliveryMode: 'DEMO',
      isRealDelivery: false,
    };
  }
}

module.exports = DemoSupplierAdapter;
