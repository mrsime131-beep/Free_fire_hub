/**
 * Free Fire Hub - Centralized Frontend API Client
 * অর্ডার তৈরি, পেমেন্ট সাবমিশন, ৫-ধাপের লাইভ ট্র্যাকিং, ইডেমপোটেন্সি কী এবং অ্যাডমিন কন্ট্রোল এপিআই।
 */

const getApiBaseUrl = () => {
  const rawUrl =
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    'http://localhost:5000/api';

  const trimmed = String(rawUrl).trim().replace(/\/+$/, '');
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
};

export const API_BASE_URL = getApiBaseUrl();

/**
 * ১. ব্রাউজারে গেস্ট ইউজারের জন্য একটি স্থায়ী Guest ID তৈরি ও সংরক্ষণ করা
 * যাতে লগইন না করেও কাস্টমার নিজের ব্রাউজার থেকে আগের সব অর্ডার দেখতে পারেন।
 */
export const getOrCreateGuestId = () => {
  if (typeof window === 'undefined') return null;

  const STORAGE_KEY = 'ffh_guest_id';
  let guestId = window.localStorage.getItem(STORAGE_KEY);

  if (!guestId) {
    const randomPart = Math.random().toString(36).substring(2, 10).toUpperCase();
    const timePart = Date.now().toString(36).toUpperCase();
    guestId = `GUEST_${timePart}_${randomPart}`;
    window.localStorage.setItem(STORAGE_KEY, guestId);
  }

  return guestId;
};

/**
 * ২. ডাবল ক্লিক বা ডুপ্লিকেট অর্ডার প্রতিরোধের জন্য ইউনিক Idempotency Key তৈরি করা
 */
export const generateIdempotencyKey = (prefix = 'FFH_REQ') => {
  const randomPart = Math.random().toString(36).substring(2, 12);
  const timePart = Date.now().toString(36);
  return `${prefix}_${timePart}_${randomPart}`.toUpperCase();
};

/**
 * ৩. লোকাল স্টোরেজ থেকে JWT Auth Token পড়া ও সেভ করা
 */
export const getStoredAuthToken = () => {
  if (typeof window === 'undefined') return null;
  return (
    window.localStorage.getItem('ffh_token') ||
    window.localStorage.getItem('adminToken') ||
    window.localStorage.getItem('token') ||
    null
  );
};

export const setStoredAuthToken = (token, user = null) => {
  if (typeof window === 'undefined') return;
  if (token) {
    window.localStorage.setItem('ffh_token', token);
    window.localStorage.setItem('token', token);
  }
  if (user) {
    window.localStorage.setItem('ffh_user', JSON.stringify(user));
  }
};

export const clearStoredAuth = () => {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem('ffh_token');
  window.localStorage.removeItem('adminToken');
  window.localStorage.removeItem('token');
  window.localStorage.removeItem('ffh_user');
};

/**
 * ৪. লোকাল স্টোরেজে কাস্টমারের সাম্প্রতিক অর্ডার আইডি ক্যাশ রাখা (দ্রুত ট্র্যাকিংয়ের সুবিধার্থে)
 */
export const saveRecentOrderLocally = (orderSummary) => {
  if (typeof window === 'undefined' || !orderSummary?.orderNumber) return;

  try {
    const STORAGE_KEY = 'ffh_recent_orders';
    const existingRaw = window.localStorage.getItem(STORAGE_KEY);
    const existingList = existingRaw ? JSON.parse(existingRaw) : [];

    const filtered = existingList.filter(
      (item) => item.orderNumber !== orderSummary.orderNumber
    );

    const updated = [
      {
        orderNumber: orderSummary.orderNumber,
        id: orderSummary.id,
        productName: orderSummary.productName,
        diamondQuantity: orderSummary.diamondQuantity,
        finalPayableAmount: orderSummary.finalPayableAmount,
        playerUid: orderSummary.playerUid,
        verifiedPlayerName: orderSummary.verifiedPlayerName,
        orderStatus: orderSummary.orderStatus,
        paymentStatus: orderSummary.paymentStatus,
        deliveryStatus: orderSummary.deliveryStatus,
        createdAt: orderSummary.createdAt || new Date().toISOString(),
      },
      ...filtered,
    ].slice(0, 20);

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    // ignore storage quota errors
  }
};

export const getRecentOrdersLocally = () => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem('ffh_recent_orders');
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
};

/**
 * ৫. স্ট্যান্ডার্ড HTTP রিকোয়েস্ট র‍্যাপার (টাইমআউট, গেস্ট আইডি, টোকেন ও এরর হ্যান্ডলিংসহ)
 */
export const apiRequest = async (
  endpoint,
  {
    method = 'GET',
    body = null,
    headers = {},
    idempotencyKey = null,
    timeoutMs = 25000,
  } = {}
) => {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = `${API_BASE_URL}${cleanEndpoint}`;

  const token = getStoredAuthToken();
  const guestId = getOrCreateGuestId();

  const requestHeaders = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(guestId ? { 'X-Guest-Id': guestId } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(idempotencyKey
      ? {
          'Idempotency-Key': idempotencyKey,
          'X-Idempotency-Key': idempotencyKey,
        }
      : {}),
    ...headers,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method,
      headers: requestHeaders,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      cache: 'no-store',
    });

    clearTimeout(timer);

    let payload = null;
    try {
      payload = await response.json();
    } catch (e) {
      payload = null;
    }

    if (!response.ok) {
      const errorMessage =
        payload?.message ||
        payload?.error ||
        `সার্ভারের সাথে যোগাযোগে সমস্যা হয়েছে (HTTP ${response.status})।`;

      const err = new Error(errorMessage);
      err.status = response.status;
      err.code = payload?.error || 'API_ERROR';
      err.details = payload?.details || null;
      throw err;
    }

    return payload;
  } catch (error) {
    clearTimeout(timer);
    if (error.name === 'AbortError') {
      const timeoutErr = new Error(
        'সার্ভার রেসপন্স করতে বেশি সময় নিচ্ছে। অনুগ্রহ করে ইন্টারনেট সংযোগ চেক করে আবার চেষ্টা করুন।'
      );
      timeoutErr.status = 408;
      timeoutErr.code = 'REQUEST_TIMEOUT';
      throw timeoutErr;
    }
    throw error;
  }
};

/* ==========================================================================
 * ৬. কাস্টমার ও পাবলিক এপিআই ফাংশনসমূহ (Customer & Public APIs)
 * ========================================================================== */

// সক্রিয় ডায়মন্ড প্যাকেজ তালিকা লোড করা
export const fetchProducts = async () => {
  return apiRequest('/products', { method: 'GET' });
};

// ফ্রি ফায়ার Player UID যাচাই করা
export const verifyPlayerUid = async (playerUid, gameServer = 'BD') => {
  return apiRequest('/player/verify', {
    method: 'POST',
    body: {
      playerUid: String(playerUid).trim(),
      gameServer,
    },
  });
};

// বিকাশ/নগদ/রকেট পেমেন্ট নাম্বার ও নির্দেশনা লোড করা
export const fetchPaymentInstructions = async () => {
  return apiRequest('/orders/payment-instructions', { method: 'GET' });
};

// নতুন অর্ডার তৈরি করা
export const createOrder = async (orderPayload, idempotencyKey = null) => {
  const key = idempotencyKey || generateIdempotencyKey('CREATE_ORD');
  const guestId = getOrCreateGuestId();

  const res = await apiRequest('/orders', {
    method: 'POST',
    idempotencyKey: key,
    body: {
      ...orderPayload,
      guestId,
    },
  });

  if (res?.order) {
    saveRecentOrderLocally(res.order);
  }

  return res;
};

// অর্ডারের বিপরীতে ম্যানুয়াল পেমেন্ট (TrxID ও Sender Number) জমা দেওয়া
export const submitOrderPayment = async (
  orderId,
  paymentPayload,
  idempotencyKey = null
) => {
  const key = idempotencyKey || generateIdempotencyKey('SUBMIT_PAY');
  const encodedId = encodeURIComponent(String(orderId).trim());

  const res = await apiRequest(`/orders/${encodedId}/payment`, {
    method: 'POST',
    idempotencyKey: key,
    body: paymentPayload,
  });

  if (res?.order) {
    saveRecentOrderLocally(res.order);
  }

  return res;
};

// পাবলিক অর্ডার ট্র্যাকিং (মাস্কড UID ও ৫-ধাপের লাইভ টাইমলাইন)
export const trackOrderPublic = async (orderId) => {
  const encodedId = encodeURIComponent(String(orderId).trim());
  return apiRequest(`/orders/track/${encodedId}`, { method: 'GET' });
};

// নির্দিষ্ট অর্ডারের বিস্তারিত তথ্য
export const fetchOrderDetails = async (orderId) => {
  const encodedId = encodeURIComponent(String(orderId).trim());
  return apiRequest(`/orders/${encodedId}`, { method: 'GET' });
};

// কাস্টমার বা গেস্টের নিজস্ব অর্ডার হিস্ট্রি লোড করা
export const fetchMyOrders = async ({
  page = 1,
  limit = 15,
  playerUid = '',
} = {}) => {
  const guestId = getOrCreateGuestId();
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });

  if (guestId) params.set('guestId', guestId);
  if (playerUid) params.set('playerUid', String(playerUid).trim());

  return apiRequest(`/orders/my-orders?${params.toString()}`, {
    method: 'GET',
  });
};

/* ==========================================================================
 * ৭. অ্যাডমিন কন্ট্রোল প্যানেল এপিআই ফাংশনসমূহ (Admin Panel APIs)
 * ========================================================================== */

// অ্যাডমিন বা ইউজার লগইন
export const loginWithEmailPassword = async (email, password) => {
  const res = await apiRequest('/auth/login', {
    method: 'POST',
    body: { email, password },
  });

  if (res?.token) {
    setStoredAuthToken(res.token, res.user);
  }

  return res;
};

// অ্যাডমিন ড্যাশবোর্ড মেট্রিক্স
export const fetchAdminDashboardMetrics = async () => {
  return apiRequest('/admin/dashboard/metrics', { method: 'GET' });
};

// অ্যাডমিন অর্ডার লিস্ট, সার্চ ও ফিল্টারিং
export const fetchAdminOrders = async (filters = {}) => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== null && value !== undefined && String(value).trim() !== '') {
      params.set(key, String(value).trim());
    }
  });

  return apiRequest(`/admin/orders?${params.toString()}`, { method: 'GET' });
};

// অ্যাডমিনের জন্য নির্দিষ্ট অর্ডারের ৩৬০-ডিগ্রি ভিউ
export const fetchAdminOrderDetails = async (orderId) => {
  const encodedId = encodeURIComponent(String(orderId).trim());
  return apiRequest(`/admin/orders/${encodedId}`, { method: 'GET' });
};

// অ্যাডমিন কর্তৃক পেমেন্ট ভেরিফিকেশন (VERIFIED -> Auto-Delivery / REJECTED)
export const adminVerifyOrderPayment = async (
  orderId,
  { status, reason = '', autoTriggerDelivery = true }
) => {
  const encodedId = encodeURIComponent(String(orderId).trim());
  return apiRequest(`/admin/orders/${encodedId}/verify-payment`, {
    method: 'POST',
    body: {
      status,
      reason,
      autoTriggerDelivery,
    },
  });
};

// অ্যাডমিন কর্তৃক অর্ডার/পেমেন্ট/ডেলিভারি স্ট্যাটাস আপডেট
export const adminUpdateOrderStatus = async (orderId, statusPayload) => {
  const encodedId = encodeURIComponent(String(orderId).trim());
  return apiRequest(`/admin/orders/${encodedId}/status`, {
    method: 'PATCH',
    body: statusPayload,
  });
};

// ব্যর্থ ডেলিভারির জন্য অ্যাডমিন কর্তৃক ম্যানুয়াল রিট্রাই অনুমোদন ও এক্সিকিউশন
export const adminRetryOrderDelivery = async (
  orderId,
  { reason = 'Manual retry approved by Admin', executeImmediately = true } = {}
) => {
  const encodedId = encodeURIComponent(String(orderId).trim());
  return apiRequest(`/admin/orders/${encodedId}/retry-delivery`, {
    method: 'POST',
    body: {
      reason,
      executeImmediately,
    },
  });
};

// অ্যাডমিন কর্তৃক অর্ডার বাতিল (Cancel) করা
export const adminCancelOrder = async (orderId, reason) => {
  const encodedId = encodeURIComponent(String(orderId).trim());
  return apiRequest(`/admin/orders/${encodedId}/cancel`, {
    method: 'POST',
    body: { reason },
  });
};

// অ্যাডমিন কর্তৃক অর্ডার রিফান্ড (Refund) করা
export const adminRefundOrder = async (
  orderId,
  { reason, refundReference = '' }
) => {
  const encodedId = encodeURIComponent(String(orderId).trim());
  return apiRequest(`/admin/orders/${encodedId}/refund`, {
    method: 'POST',
    body: { reason, refundReference },
  });
};

// অ্যাডমিন অডিট লগ লোড করা
export const fetchAdminAuditLogs = async (filters = {}) => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== null && value !== undefined && String(value).trim() !== '') {
      params.set(key, String(value).trim());
    }
  });

  return apiRequest(`/admin/audit-logs?${params.toString()}`, {
    method: 'GET',
  });
};

// সাপ্লায়ার ডেলিভারি অ্যাটেম্পট লগ লোড করা
export const fetchDeliveryLogs = async (filters = {}) => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== null && value !== undefined && String(value).trim() !== '') {
      params.set(key, String(value).trim());
    }
  });

  return apiRequest(`/delivery/logs?${params.toString()}`, { method: 'GET' });
};

// রিট্রাই কিউতে থাকা অর্ডারগুলো ব্যাচ প্রসেস করা
export const processRetryQueueBatch = async (limit = 10) => {
  return apiRequest('/delivery/retry-queue/process', {
    method: 'POST',
    body: { limit },
  });
};
