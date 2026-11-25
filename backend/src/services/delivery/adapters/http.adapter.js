const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { URL } = require('url');
const BaseSupplierAdapter = require('./base.adapter');
const env = require('../../../config/env');
const { AppError } = require('../../../middlewares/error.middleware');

/**
 * HttpSupplierAdapter
 * অনুমোদিত বাস্তব (LIVE) ডায়মন্ড সাপ্লায়ার API-এর সাথে নিরাপদ যোগাযোগের অ্যাডাপ্টার।
 * বাস্তব API Endpoint ও Credentials ছাড়া এটি কখনোই কোনো ভুয়া বা Fake Success তৈরি করবে না।
 */
class HttpSupplierAdapter extends BaseSupplierAdapter {
  constructor(supplierConfig = {}) {
    super({
      ...supplierConfig,
      adapterType: 'LIVE',
    });
  }

  /**
   * এনভায়রনমেন্ট ভেরিয়েবল এবং সাপ্লায়ার কনফিগারেশন থেকে নিরাপদে API Credentials লোড করা
   */
  resolveCredentials() {
    const apiEndpoint =
      this.supplier?.apiEndpoint || env.SUPPLIER_API_URL || '';

    const apiKeyEnvName = this.supplier?.apiKeyEnvVar || 'SUPPLIER_API_KEY';
    const apiSecretEnvName =
      this.supplier?.apiSecretEnvVar || 'SUPPLIER_API_SECRET';

    const apiKey = process.env[apiKeyEnvName] || env.SUPPLIER_API_KEY || '';
    const apiSecret =
      process.env[apiSecretEnvName] || env.SUPPLIER_API_SECRET || '';

    return {
      apiEndpoint: String(apiEndpoint).trim(),
      apiKey: String(apiKey).trim(),
      apiSecret: String(apiSecret).trim(),
    };
  }

  /**
   * লাইভ সাপ্লায়ার কনফিগারেশন কঠোরভাবে যাচাই করা
   */
  validateLiveConfiguration() {
    this.validateSupplierConfig();
    const { apiEndpoint, apiKey } = this.resolveCredentials();

    if (!apiEndpoint) {
      throw new AppError(
        `লাইভ সাপ্লায়ার (${this.supplierCode})-এর API Endpoint কনফিগার করা নেই।`,
        503,
        'LIVE_SUPPLIER_ENDPOINT_MISSING'
      );
    }

    if (!apiKey) {
      throw new AppError(
        `লাইভ সাপ্লায়ার (${this.supplierCode})-এর API Key এনভায়রনমেন্ট ভেরিয়েবলে সেট করা নেই।`,
        503,
        'LIVE_SUPPLIER_CREDENTIALS_MISSING'
      );
    }

    return { apiEndpoint, apiKey };
  }

  /**
   * রিকোয়েস্টের নিরাপত্তার জন্য HMAC-SHA256 সিগনেচার তৈরি করা
   */
  generateHmacSignature(payloadString, timestamp, apiSecret) {
    if (!apiSecret) return '';
    return crypto
      .createHmac('sha256', apiSecret)
      .update(`${timestamp}.${payloadString}`)
      .digest('hex');
  }

  /**
   * Node.js-এর বিল্ট-ইন http/https মডিউল দিয়ে টাইমআউট-সুরক্ষিত নেটওয়ার্ক রিকোয়েস্ট পাঠানো
   */
  sendHttpRequest({ urlString, method = 'POST', headers = {}, bodyObj = null, timeoutMs }) {
    return new Promise((resolve) => {
      let parsedUrl;
      try {
        parsedUrl = new URL(urlString);
      } catch (err) {
        return resolve({
          ok: false,
          httpStatus: 400,
          isTimeout: false,
          networkError: `Invalid Supplier URL: ${urlString}`,
          data: null,
        });
      }

      const isHttps = parsedUrl.protocol === 'https:';
      const transport = isHttps ? https : http;
      const payloadString = bodyObj ? JSON.stringify(bodyObj) : '';

      const requestHeaders = {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': `${env.SERVICE_NAME}/${env.APP_VERSION}`,
        ...headers,
      };

      if (payloadString) {
        requestHeaders['Content-Length'] = Buffer.byteLength(payloadString);
      }

      const requestOptions = {
        protocol: parsedUrl.protocol,
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: `${parsedUrl.pathname}${parsedUrl.search}`,
        method,
        headers: requestHeaders,
        timeout: timeoutMs || this.timeoutMs || 15000,
      };

      const req = transport.request(requestOptions, (res) => {
        let rawBody = '';
        res.on('data', (chunk) => {
          rawBody += chunk;
        });

        res.on('end', () => {
          let parsedData = null;
          try {
            parsedData = rawBody ? JSON.parse(rawBody) : {};
          } catch (e) {
            parsedData = { rawResponse: rawBody.slice(0, 500) };
          }

          const httpStatus = res.statusCode || 500;
          resolve({
            ok: httpStatus >= 200 && httpStatus < 300,
            httpStatus,
            isTimeout: false,
            networkError: null,
            data: parsedData,
          });
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({
          ok: false,
          httpStatus: 504,
          isTimeout: true,
          networkError: 'Supplier API request timed out',
          data: null,
        });
      });

      req.on('error', (err) => {
        resolve({
          ok: false,
          httpStatus: 502,
          isTimeout: err.code === 'ETIMEDOUT' || err.code === 'ESOCKETTIMEDOUT',
          networkError: err.message || 'Supplier network connection error',
          data: null,
        });
      });

      if (payloadString) {
        req.write(payloadString);
      }
      req.end();
    });
  }

  /**
   * ১. অনুমোদিত লাইভ সাপ্লায়ার API-তে ডায়মন্ড ডেলিভারি রিকোয়েস্ট পাঠানো
   */
  async executeTopUp({
    order,
    supplierProduct = null,
    attemptNumber = 1,
    idempotencyKey,
  }) {
    const startTime = Date.now();
    const { apiEndpoint, apiKey, apiSecret } = this.resolveCredentials();

    // যদি লাইভ ক্রেডেনশিয়াল না থাকে, তবে কখনোই ভুয়া ডেলিভারি করবে না
    if (!apiEndpoint || !apiKey) {
      const durationMs = Date.now() - startTime;
      return this.normalizeAdapterResponse({
        success: false,
        isRealDelivery: false,
        deliveryMode: 'LIVE',
        status: 'FAILED',
        httpStatus: 503,
        requestPayload: { orderNumber: order?.orderNumber, idempotencyKey },
        responsePayload: null,
        errorCode: 'LIVE_SUPPLIER_NOT_CONFIGURED',
        errorMessage:
          'লাইভ সাপ্লায়ার API Endpoint অথবা API Key কনফিগার করা নেই। ডেলিভারি স্থগিত রাখা হয়েছে।',
        isTimeout: false,
        requiresStatusCheck: false,
        durationMs,
      });
    }

    const requestPayload = this.buildStandardRequestPayload({
      order,
      supplierProduct,
      attemptNumber,
      idempotencyKey,
    });

    const timestamp = Date.now().toString();
    const payloadString = JSON.stringify(requestPayload);
    const signature = this.generateHmacSignature(
      payloadString,
      timestamp,
      apiSecret
    );

    const headers = {
      Authorization: `Bearer ${apiKey}`,
      'X-API-Key': apiKey,
      'Idempotency-Key': idempotencyKey,
      'X-Idempotency-Key': idempotencyKey,
      'X-Request-Timestamp': timestamp,
    };

    if (signature) {
      headers['X-Supplier-Signature'] = signature;
    }

    const httpResult = await this.sendHttpRequest({
      urlString: apiEndpoint,
      method: 'POST',
      headers,
      bodyObj: requestPayload,
      timeoutMs: this.timeoutMs,
    });

    const durationMs = Date.now() - startTime;

    // কেস ১: সাপ্লায়ার টাইমআউট হলে (Part 6 অনুযায়ী স্ট্যাটাস চেক না করে পুনরায় পাঠানো যাবে না)
    if (httpResult.isTimeout) {
      return this.normalizeAdapterResponse({
        success: false,
        isRealDelivery: false,
        deliveryMode: 'LIVE',
        status: 'RETRY_PENDING',
        httpStatus: 504,
        requestPayload,
        responsePayload: httpResult.data,
        errorCode: 'SUPPLIER_REQUEST_TIMEOUT',
        errorMessage:
          'সাপ্লায়ার API নির্ধারিত সময়ের মধ্যে রেসপন্স করেনি (Timeout)। পুনরায় পাঠানোর পূর্বে আগের রিকোয়েস্টের ফলাফল যাচাই করা হবে।',
        isTimeout: true,
        requiresStatusCheck: true,
        durationMs,
      });
    }

    // কেস ২: নেটওয়ার্ক বা HTTP Error
    if (!httpResult.ok || !httpResult.data) {
      const upstreamErrorMsg =
        httpResult.data?.message ||
        httpResult.data?.error ||
        httpResult.networkError ||
        `Supplier HTTP Error ${httpResult.httpStatus}`;

      const isClientFatalError =
        httpResult.httpStatus === 400 ||
        httpResult.httpStatus === 401 ||
        httpResult.httpStatus === 403 ||
        httpResult.httpStatus === 422;

      return this.normalizeAdapterResponse({
        success: false,
        isRealDelivery: false,
        deliveryMode: 'LIVE',
        status: isClientFatalError ? 'FAILED' : 'RETRY_PENDING',
        httpStatus: httpResult.httpStatus,
        requestPayload,
        responsePayload: httpResult.data,
        errorCode:
          httpResult.data?.errorCode || `SUPPLIER_HTTP_${httpResult.httpStatus}`,
        errorMessage: String(upstreamErrorMsg).slice(0, 300),
        isTimeout: false,
        requiresStatusCheck: false,
        durationMs,
      });
    }

    // কেস ৩: সাপ্লায়ার রেসপন্স ভ্যালিডেশন (ডেলিভারি রেফারেন্স ছাড়া সাকসেস গ্রহণ করা হবে না)
    const resData = httpResult.data;
    const deliveryReference =
      resData.deliveryReference ||
      resData.transactionId ||
      resData.referenceId ||
      resData.data?.deliveryReference ||
      resData.data?.transactionId ||
      null;

    const externalOrderId =
      resData.externalOrderId ||
      resData.supplierOrderId ||
      resData.data?.orderId ||
      null;

    const isExplicitSuccess =
      resData.success === true ||
      resData.status === 'COMPLETED' ||
      resData.status === 'SUCCESS';

    if (isExplicitSuccess && deliveryReference) {
      return this.normalizeAdapterResponse({
        success: true,
        isRealDelivery: true,
        deliveryMode: 'LIVE',
        status: 'COMPLETED',
        deliveryReference: String(deliveryReference).trim(),
        externalOrderId: externalOrderId ? String(externalOrderId).trim() : null,
        httpStatus: httpResult.httpStatus,
        requestPayload,
        responsePayload: resData,
        errorCode: null,
        errorMessage: null,
        isTimeout: false,
        requiresStatusCheck: false,
        durationMs,
      });
    }

    // কেস ৪: সাপ্লায়ার রিকোয়েস্ট গ্রহণ করেছে কিন্তু ডেলিভারি এখনো পেন্ডিং/প্রসেসিং আছে
    if (resData.status === 'PROCESSING' || resData.status === 'PENDING') {
      return this.normalizeAdapterResponse({
        success: false,
        isRealDelivery: false,
        deliveryMode: 'LIVE',
        status: 'PROCESSING',
        deliveryReference: deliveryReference
          ? String(deliveryReference).trim()
          : null,
        externalOrderId: externalOrderId ? String(externalOrderId).trim() : null,
        httpStatus: httpResult.httpStatus,
        requestPayload,
        responsePayload: resData,
        errorCode: 'SUPPLIER_DELIVERY_IN_PROGRESS',
        errorMessage: 'সাপ্লায়ার সার্ভারে ডেলিভারি প্রসেসিং অবস্থায় রয়েছে।',
        isTimeout: false,
        requiresStatusCheck: true,
        durationMs,
      });
    }

    // কেস ৫: ভ্যালিড ডেলিভারি রেফারেন্স না থাকলে ব্যর্থ হিসেবে গণ্য করা
    return this.normalizeAdapterResponse({
      success: false,
      isRealDelivery: false,
      deliveryMode: 'LIVE',
      status: 'FAILED',
      httpStatus: httpResult.httpStatus,
      requestPayload,
      responsePayload: resData,
      errorCode: 'INVALID_SUPPLIER_RESPONSE',
      errorMessage:
        resData.message ||
        'সাপ্লায়ার API থেকে বৈধ Delivery Reference পাওয়া যায়নি।',
      isTimeout: false,
      requiresStatusCheck: false,
      durationMs,
    });
  }

  /**
   * ২. সাপ্লায়ার টাইমআউট হলে পুনরায় ডায়মন্ড পাঠানোর আগে পূর্ববর্তী রিকোয়েস্টের ফলাফল যাচাই করা (Part 6)
   */
  async checkPreviousAttemptStatus({ order, delivery, lastAttempt }) {
    const { apiEndpoint, apiKey } = this.resolveCredentials();

    if (!apiEndpoint || !apiKey || !lastAttempt) {
      return {
        found: false,
        alreadyDelivered: false,
        status: 'UNKNOWN',
        deliveryReference: null,
      };
    }

    const baseUrl = apiEndpoint.replace(/\/+$/, '');
    const statusCheckUrl = `${baseUrl}/status?orderNumber=${encodeURIComponent(
      order.orderNumber
    )}&idempotencyKey=${encodeURIComponent(lastAttempt.idempotencyKey)}`;

    const httpResult = await this.sendHttpRequest({
      urlString: statusCheckUrl,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'X-API-Key': apiKey,
      },
      timeoutMs: 10000,
    });

    if (!httpResult.ok || !httpResult.data) {
      return {
        found: false,
        alreadyDelivered: false,
        status: 'VERIFICATION_UNAVAILABLE',
        deliveryReference: null,
      };
    }

    const data = httpResult.data;
    const deliveryReference =
      data.deliveryReference ||
      data.transactionId ||
      data.data?.deliveryReference ||
      null;

    const isDelivered =
      (data.status === 'COMPLETED' || data.status === 'SUCCESS') &&
      Boolean(deliveryReference);

    if (isDelivered) {
      return {
        found: true,
        alreadyDelivered: true,
        status: 'COMPLETED',
        deliveryReference: String(deliveryReference).trim(),
        externalOrderId: data.externalOrderId || null,
        deliveryMode: 'LIVE',
        isRealDelivery: true,
      };
    }

    if (data.status === 'FAILED' || data.status === 'NOT_FOUND') {
      return {
        found: true,
        alreadyDelivered: false,
        status: 'FAILED_CONFIRMED',
        deliveryReference: null,
        deliveryMode: 'LIVE',
        isRealDelivery: false,
      };
    }

    return {
      found: true,
      alreadyDelivered: false,
      status: 'STILL_PROCESSING',
      deliveryReference: null,
      deliveryMode: 'LIVE',
      isRealDelivery: false,
    };
  }
}

module.exports = HttpSupplierAdapter;
