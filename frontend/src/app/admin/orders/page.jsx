'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  getStoredAuthToken,
  clearStoredAuth,
  loginWithEmailPassword,
  fetchAdminDashboardMetrics,
  fetchAdminOrders,
  fetchAdminOrderDetails,
  adminVerifyOrderPayment,
  adminRetryOrderDelivery,
  adminCancelOrder,
  adminRefundOrder,
  fetchAdminAuditLogs,
  fetchDeliveryLogs,
  processRetryQueueBatch,
} from '../../../lib/orderApi';
import OrderTimeline, {
  StatusBadge,
  formatDateTime,
} from '../../../components/order/OrderTimeline';

export default function AdminOrdersControlPanel() {
  // ১. অ্যাডমিন অথেনটিকেশন স্টেট
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // ২. ড্যাশবোর্ড ট্যাব ও মেট্রিক্স স্টেট
  const [activeTab, setActiveTab] = useState('ORDERS'); // 'ORDERS' | 'DELIVERY_LOGS' | 'AUDIT_LOGS'
  const [metrics, setMetrics] = useState(null);

  // ৩. অর্ডার তালিকা ও ফিল্টার স্টেট
  const [orders, setOrders] = useState([]);
  const [ordersPagination, setOrdersPagination] = useState({
    page: 1,
    limit: 20,
    totalCount: 0,
    totalPages: 1,
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('');
  const [deliveryStatusFilter, setDeliveryStatusFilter] = useState('');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState('');

  // ৪. সাপ্লায়ার ডেলিভারি লগ ও অডিট লগ স্টেট
  const [deliveryLogs, setDeliveryLogs] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);

  // ৫. লোডিং, অ্যাকশন ফিডব্যাক ও ৩৬০-ডিগ্রি মডাল স্টেট
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [feedbackBanner, setFeedbackBanner] = useState(null); // { type: 'success' | 'error', text: '' }
  const [inspectedOrderData, setInspectedOrderData] = useState(null);
  const [isLoadingInspect, setIsLoadingInspect] = useState(false);

  // অ্যাকশন মডাল স্টেট (Reject / Cancel / Refund কারণ ইনপুট নেওয়ার জন্য)
  const [actionModal, setActionModal] = useState(null); // { type: 'REJECT_PAYMENT' | 'CANCEL' | 'REFUND', order: null }
  const [actionReason, setActionReason] = useState('');
  const [refundReferenceInput, setRefundReferenceInput] = useState('');

  const showFeedback = (type, text) => {
    setFeedbackBanner({ type, text });
    setTimeout(() => {
      setFeedbackBanner((prev) => (prev?.text === text ? null : prev));
    }, 6000);
  };

  // ড্যাশবোর্ড মেট্রিক্স ও অর্ডার লোড করার কোর ফাংশন
  const loadAdminWorkspace = useCallback(
    async (page = 1) => {
      setIsLoadingData(true);
      try {
        const [metricsRes, ordersRes] = await Promise.all([
          fetchAdminDashboardMetrics(),
          fetchAdminOrders({
            page,
            limit: 20,
            search: searchQuery,
            orderStatus: orderStatusFilter,
            paymentStatus: paymentStatusFilter,
            deliveryStatus: deliveryStatusFilter,
            paymentMethod: paymentMethodFilter,
          }),
        ]);

        setMetrics(metricsRes?.metrics || metricsRes?.data || null);
        setOrders(ordersRes?.orders || ordersRes?.data?.orders || []);
        if (ordersRes?.pagination || ordersRes?.data?.pagination) {
          setOrdersPagination(
            ordersRes.pagination || ordersRes.data.pagination
          );
        }
        setIsAuthenticated(true);
      } catch (err) {
        if (err.status === 401 || err.status === 403) {
          clearStoredAuth();
          setIsAuthenticated(false);
        } else {
          showFeedback(
            'error',
            err.message || 'অ্যাডমিন ডেটা লোড করতে সমস্যা হয়েছে।'
          );
        }
      } finally {
        setIsLoadingData(false);
        setAuthChecking(false);
      }
    },
    [
      searchQuery,
      orderStatusFilter,
      paymentStatusFilter,
      deliveryStatusFilter,
      paymentMethodFilter,
    ]
  );

  // সাপ্লায়ার ডেলিভারি লগ লোড করা
  const loadDeliveryLogsTab = useCallback(async () => {
    setIsLoadingData(true);
    try {
      const res = await fetchDeliveryLogs({ page: 1, limit: 40 });
      setDeliveryLogs(res?.logs || res?.data?.logs || []);
    } catch (err) {
      showFeedback('error', err.message || 'ডেলিভারি লগ লোড করা যায়নি।');
    } finally {
      setIsLoadingData(false);
    }
  }, []);

  // অডিট লগ লোড করা
  const loadAuditLogsTab = useCallback(async () => {
    setIsLoadingData(true);
    try {
      const res = await fetchAdminAuditLogs({ page: 1, limit: 40 });
      setAuditLogs(res?.logs || res?.data?.logs || []);
    } catch (err) {
      showFeedback('error', err.message || 'অডিট লগ লোড করা যায়নি।');
    } finally {
      setIsLoadingData(false);
    }
  }, []);

  // প্রাথমিক অথেনটিকেশন চেক
  useEffect(() => {
    const token = getStoredAuthToken();
    if (!token) {
      setIsAuthenticated(false);
      setAuthChecking(false);
      return;
    }
    loadAdminWorkspace(1);
  }, [loadAdminWorkspace]);

  // ট্যাব পরিবর্তনের সাথে ডেটা লোড করা
  useEffect(() => {
    if (!isAuthenticated) return;
    if (activeTab === 'DELIVERY_LOGS') {
      loadDeliveryLogsTab();
    } else if (activeTab === 'AUDIT_LOGS') {
      loadAuditLogsTab();
    }
  }, [
    activeTab,
    isAuthenticated,
    loadDeliveryLogsTab,
    loadAuditLogsTab,
  ]);

  // অ্যাডমিন লগইন হ্যান্ডলার
  const handleAdminLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    setIsLoggingIn(true);

    try {
      const res = await loginWithEmailPassword(
        loginEmail.trim(),
        loginPassword
      );
      const role = String(res?.user?.role || '').toUpperCase();

      if (!['ADMIN', 'SUPER_ADMIN'].includes(role)) {
        clearStoredAuth();
        setLoginError(
          'এই অ্যাকাউন্টের অ্যাডমিন প্যানেলে প্রবেশের অনুমতি নেই (ADMIN রোল আবশ্যক)।'
        );
        return;
      }

      setIsAuthenticated(true);
      await loadAdminWorkspace(1);
    } catch (err) {
      setLoginError(err.message || 'লগইন ব্যর্থ হয়েছে। সঠিক ইমেইল ও পাসওয়ার্ড দিন।');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    clearStoredAuth();
    setIsAuthenticated(false);
    setMetrics(null);
    setOrders([]);
  };

  // ১. ওয়ান-ক্লিক পেমেন্ট ভেরিফাই ও অটো-ডেলিভারি ট্রিগার
  const handleApprovePayment = async (order) => {
    setActionLoadingId(order.orderNumber);
    try {
      const res = await adminVerifyOrderPayment(order.orderNumber, {
        status: 'VERIFIED',
        reason: 'Payment verified and approved by Admin',
        autoTriggerDelivery: true,
      });

      showFeedback(
        'success',
        res?.message ||
          `অর্ডার ${order.orderNumber}-এর পেমেন্ট ভেরিফাই ও ডেলিভারি প্রসেস সম্পন্ন হয়েছে!`
      );
      await loadAdminWorkspace(ordersPagination.page);

      if (inspectedOrderData?.order?.orderNumber === order.orderNumber) {
        await handleInspectOrder(order.orderNumber);
      }
    } catch (err) {
      showFeedback('error', err.message || 'পেমেন্ট ভেরিফাই করতে সমস্যা হয়েছে।');
    } finally {
      setActionLoadingId(null);
    }
  };

  // ২. ব্যর্থ ডেলিভারির ম্যানুয়াল রিট্রাই ও তাৎক্ষণিক ডেলিভারি
  const handleManualRetry = async (order) => {
    setActionLoadingId(order.orderNumber);
    try {
      const res = await adminRetryOrderDelivery(order.orderNumber, {
        reason: 'Manual retry triggered from Admin Control Panel',
        executeImmediately: true,
      });

      showFeedback(
        'success',
        res?.message ||
          `অর্ডার ${order.orderNumber}-এর ম্যানুয়াল ডেলিভারি রিট্রাই সফল হয়েছে!`
      );
      await loadAdminWorkspace(ordersPagination.page);

      if (inspectedOrderData?.order?.orderNumber === order.orderNumber) {
        await handleInspectOrder(order.orderNumber);
      }
    } catch (err) {
      showFeedback('error', err.message || 'ম্যানুয়াল রিট্রাই করতে সমস্যা হয়েছে।');
    } finally {
      setActionLoadingId(null);
    }
  };

  // ৩. রিট্রাই কিউতে থাকা সব অর্ডার ব্যাচ প্রসেস করা
  const handleProcessRetryQueueBatch = async () => {
    setActionLoadingId('BATCH_RETRY');
    try {
      const res = await processRetryQueueBatch(15);
      showFeedback(
        'success',
        res?.message || 'রিট্রাই কিউ সফলভাবে প্রসেস করা হয়েছে।'
      );
      await loadAdminWorkspace(ordersPagination.page);
    } catch (err) {
      showFeedback('error', err.message || 'রিট্রাই কিউ প্রসেস করা যায়নি।');
    } finally {
      setActionLoadingId(null);
    }
  };

  // ৪. মডাল থেকে পেমেন্ট রিজেক্ট / অর্ডার ক্যানসেল / রিফান্ড কনফার্ম করা
  const handleConfirmActionModal = async (e) => {
    e.preventDefault();
    if (!actionModal?.order) return;

    const targetOrder = actionModal.order;
    const cleanReason = actionReason.trim();
    if (cleanReason.length < 3) {
      showFeedback('error', 'অনুগ্রহ করে কমপক্ষে ৩ অক্ষরের একটি স্পষ্ট কারণ লিখুন।');
      return;
    }

    setActionLoadingId(targetOrder.orderNumber);
    try {
      if (actionModal.type === 'REJECT_PAYMENT') {
        const res = await adminVerifyOrderPayment(targetOrder.orderNumber, {
          status: 'REJECTED',
          reason: cleanReason,
          autoTriggerDelivery: false,
        });
        showFeedback(
          'success',
          res?.message || `অর্ডার ${targetOrder.orderNumber}-এর পেমেন্ট রিজেক্ট করা হয়েছে।`
        );
      } else if (actionModal.type === 'CANCEL') {
        const res = await adminCancelOrder(targetOrder.orderNumber, cleanReason);
        showFeedback(
          'success',
          res?.message || `অর্ডার ${targetOrder.orderNumber} বাতিল করা হয়েছে।`
        );
      } else if (actionModal.type === 'REFUND') {
        const res = await adminRefundOrder(targetOrder.orderNumber, {
          reason: cleanReason,
          refundReference: refundReferenceInput.trim(),
        });
        showFeedback(
          'success',
          res?.message || `অর্ডার ${targetOrder.orderNumber} রিফান্ড করা হয়েছে।`
        );
      }

      setActionModal(null);
      setActionReason('');
      setRefundReferenceInput('');
      await loadAdminWorkspace(ordersPagination.page);

      if (inspectedOrderData?.order?.orderNumber === targetOrder.orderNumber) {
        await handleInspectOrder(targetOrder.orderNumber);
      }
    } catch (err) {
      showFeedback('error', err.message || 'অ্যাকশন সম্পন্ন করা যায়নি।');
    } finally {
      setActionLoadingId(null);
    }
  };

  // ৫. নির্দিষ্ট অর্ডারের ৩৬০-ডিগ্রি বিস্তারিত তথ্য ও অডিট লগ ওপেন করা
  const handleInspectOrder = async (orderNumber) => {
    setIsLoadingInspect(true);
    try {
      const res = await fetchAdminOrderDetails(orderNumber);
      const data = res?.data || res;
      setInspectedOrderData({
        order: data.order,
        timeline: data.timeline,
        auditLogs: data.auditLogs || [],
      });
    } catch (err) {
      showFeedback(
        'error',
        err.message || 'অর্ডারের বিস্তারিত তথ্য লোড করা যায়নি।'
      );
    } finally {
      setIsLoadingInspect(false);
    }
  };

  if (authChecking) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-300 flex items-center justify-center p-6 text-sm">
        অ্যাডমিন সিকিউরিটি যাচাই করা হচ্ছে...
      </div>
    );
  }

  // অ্যাডমিন লগইন না থাকলে বিল্ট-ইন সিকিউর লগইন স্ক্রিন
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
          <div className="text-center space-y-1.5">
            <span className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-2xl">
              🛡️
            </span>
            <h1 className="text-xl font-extrabold text-white">
              অ্যাডমিন অর্ডার কন্ট্রোল প্যানেল
            </h1>
            <p className="text-xs text-slate-400">
              শুধুমাত্র অনুমোদিত অ্যাডমিন প্রবেশের জন্য (Server-Side Protected)
            </p>
          </div>

          <form onSubmit={handleAdminLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                অ্যাডমিন ইমেইল
              </label>
              <input
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="admin@freefirehub.com"
                className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 focus:border-amber-400 focus:outline-none text-sm text-white"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                পাসওয়ার্ড
              </label>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 focus:border-amber-400 focus:outline-none text-sm text-white"
                required
              />
            </div>

            {loginError && (
              <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-xs text-red-300">
                ⚠️ {loginError}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full py-3.5 rounded-xl font-bold text-sm bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 transition disabled:opacity-50"
            >
              {isLoggingIn ? 'লগইন হচ্ছে...' : 'অ্যাডমিন প্যানেলে প্রবেশ করুন'}
            </button>
          </form>

          <div className="text-center pt-2 border-t border-slate-800">
            <Link
              href="/"
              className="text-xs text-slate-400 hover:text-amber-400 transition"
            >
              ← মূল ওয়েবসাইটে ফিরে যান
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-6 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* ১. টপ হেডার ও ডেলিভারি মোড ইন্ডিকেটর */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-extrabold text-white">
                🛡️ অ্যাডমিন অর্ডার ও অটো-ডেলিভারি কন্ট্রোল প্যানেল
              </h1>
              <span
                className={`px-2.5 py-1 rounded-full text-xs font-bold border ${
                  metrics?.deliveryMode === 'LIVE'
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                    : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                }`}
              >
                Engine Mode: {metrics?.deliveryMode || 'DEMO'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              ম্যানুয়াল পেমেন্ট ভেরিফিকেশন, স্বয়ংক্রিয় ডায়মন্ড ডেলিভারি, রিট্রাই কিউ এবং অডিট লগ ম্যানেজমেন্ট
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={handleProcessRetryQueueBatch}
              disabled={actionLoadingId === 'BATCH_RETRY'}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/30 transition disabled:opacity-50"
            >
              {actionLoadingId === 'BATCH_RETRY'
                ? 'কিউ প্রসেস হচ্ছে...'
                : '⚡ রিট্রাই কিউ রান করুন'}
            </button>

            <button
              type="button"
              onClick={() => loadAdminWorkspace(ordersPagination.page)}
              disabled={isLoadingData}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
            >
              ↻ রিফ্রেশ
            </button>

            <Link
              href="/track"
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
            >
              পাবলিক ট্র্যাকার
            </Link>

            <button
              type="button"
              onClick={handleLogout}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-500/30 transition"
            >
              লগআউট
            </button>
          </div>
        </div>

        {/* ফিডব্যাক টোস্ট ব্যানার */}
        {feedbackBanner && (
          <div
            className={`p-4 rounded-2xl border text-xs sm:text-sm font-medium flex items-center justify-between ${
              feedbackBanner.type === 'success'
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                : 'bg-red-500/15 border-red-500/30 text-red-300'
            }`}
          >
            <span>
              {feedbackBanner.type === 'success' ? '✓ ' : '⚠️ '}
              {feedbackBanner.text}
            </span>
            <button
              type="button"
              onClick={() => setFeedbackBanner(null)}
              className="text-xs opacity-75 hover:opacity-100 ml-4"
            >
              ✕
            </button>
          </div>
        )}

        {/* ২. রিয়েল-টাইম ড্যাশবোর্ড মেট্রিক্স কার্ডস */}
        {metrics && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4">
              <span className="text-xs text-slate-400">মোট অর্ডার</span>
              <p className="text-xl font-extrabold text-white mt-1">
                {metrics.counts?.totalOrders || 0}
              </p>
              <span className="text-[11px] text-slate-400">
                আজ: {metrics.counts?.todayOrders || 0}টি
              </span>
            </div>

            <div className="bg-slate-900/90 border border-amber-500/30 rounded-2xl p-4">
              <span className="text-xs text-amber-300">পেমেন্ট রিভিউ বাকি</span>
              <p className="text-xl font-extrabold text-amber-400 mt-1">
                {metrics.counts?.pendingPaymentReviewCount || 0}
              </p>
              <span className="text-[11px] text-amber-300/80">
                ভেরিফিকেশনের অপেক্ষায়
              </span>
            </div>

            <div className="bg-slate-900/90 border border-emerald-500/30 rounded-2xl p-4">
              <span className="text-xs text-emerald-300">সম্পন্ন অর্ডার</span>
              <p className="text-xl font-extrabold text-emerald-400 mt-1">
                {metrics.counts?.completedOrdersCount || 0}
              </p>
              <span className="text-[11px] text-emerald-300/80">
                💎 {metrics.revenue?.totalDiamondsDelivered || 0} ডায়মন্ড
              </span>
            </div>

            <div className="bg-slate-900/90 border border-red-500/30 rounded-2xl p-4">
              <span className="text-xs text-red-300">ব্যর্থ / রিট্রাই কিউ</span>
              <p className="text-xl font-extrabold text-red-400 mt-1">
                {metrics.counts?.failedOrRetryDeliveriesCount || 0}
              </p>
              <span className="text-[11px] text-red-300/80">
                অ্যাডমিন চেক প্রয়োজন
              </span>
            </div>

            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4">
              <span className="text-xs text-slate-400">বাতিল / রিফান্ড</span>
              <p className="text-xl font-extrabold text-slate-200 mt-1">
                {metrics.counts?.cancelledOrRefundedCount || 0}
              </p>
              <span className="text-[11px] text-slate-400">
                টার্মিনেটেড অর্ডার
              </span>
            </div>

            <div className="bg-slate-900/90 border border-cyan-500/30 rounded-2xl p-4">
              <span className="text-xs text-cyan-300">মোট ভেরিফাইড রেভিনিউ</span>
              <p className="text-xl font-extrabold text-cyan-400 mt-1">
                ৳{metrics.revenue?.totalVerifiedRevenue || 0}
              </p>
              <span className="text-[11px] text-cyan-300/80">
                আজ: ৳{metrics.revenue?.todayVerifiedRevenue || 0}
              </span>
            </div>
          </div>
        )}

        {/* ৩. নেভিগেশন ট্যাব (Orders / Supplier Delivery Logs / Admin Audit Logs) */}
        <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3">
          {[
            { id: 'ORDERS', label: '📋 অর্ডার ও পেমেন্ট কন্ট্রোল' },
            { id: 'DELIVERY_LOGS', label: '⚡ সাপ্লায়ার ডেলিভারি অ্যাটেম্পট লগ' },
            { id: 'AUDIT_LOGS', label: '🔒 অ্যাডমিন অডিট ট্রেইল (Audit Logs)' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold border transition ${
                activeTab === tab.id
                  ? 'bg-amber-500 text-slate-950 border-amber-400'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* =================================================================
         * ট্যাব ১: অর্ডার ও পেমেন্ট কন্ট্রোল টেবিল
         * ================================================================= */}
        {activeTab === 'ORDERS' && (
          <div className="space-y-4">
            {/* সার্চ ও অ্যাডভান্সড ফিল্টার বার */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Order ID, UID, TrxID বা Phone খুঁজুন..."
                className="lg:col-span-2 px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:border-amber-400 focus:outline-none"
              />

              <select
                value={orderStatusFilter}
                onChange={(e) => setOrderStatusFilter(e.target.value)}
                className="px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200"
              >
                <option value="">সব অর্ডার স্ট্যাটাস</option>
                <option value="PENDING">PENDING</option>
                <option value="PAYMENT_REVIEW">PAYMENT_REVIEW</option>
                <option value="PAYMENT_VERIFIED">PAYMENT_VERIFIED</option>
                <option value="PROCESSING">PROCESSING</option>
                <option value="DELIVERY_PENDING">DELIVERY_PENDING</option>
                <option value="COMPLETED">COMPLETED</option>
                <option value="FAILED">FAILED</option>
                <option value="CANCELLED">CANCELLED</option>
                <option value="REFUNDED">REFUNDED</option>
              </select>

              <select
                value={paymentStatusFilter}
                onChange={(e) => setPaymentStatusFilter(e.target.value)}
                className="px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200"
              >
                <option value="">সব পেমেন্ট স্ট্যাটাস</option>
                <option value="UNPAID">UNPAID</option>
                <option value="SUBMITTED">SUBMITTED (TrxID জমা)</option>
                <option value="VERIFIED">VERIFIED</option>
                <option value="REJECTED">REJECTED</option>
                <option value="REFUNDED">REFUNDED</option>
              </select>

              <select
                value={deliveryStatusFilter}
                onChange={(e) => setDeliveryStatusFilter(e.target.value)}
                className="px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200"
              >
                <option value="">সব ডেলিভারি স্ট্যাটাস</option>
                <option value="NOT_STARTED">NOT_STARTED</option>
                <option value="QUEUED">QUEUED</option>
                <option value="PROCESSING">PROCESSING</option>
                <option value="RETRY_PENDING">RETRY_PENDING</option>
                <option value="COMPLETED">COMPLETED</option>
                <option value="FAILED">FAILED</option>
              </select>

              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setOrderStatusFilter('');
                  setPaymentStatusFilter('');
                  setDeliveryStatusFilter('');
                  setPaymentMethodFilter('');
                }}
                className="px-3.5 py-2.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
              >
                ফিল্টার রিসেট
              </button>
            </div>

            {/* অর্ডার তালিকা */}
            <div className="space-y-3">
              {orders.length === 0 ? (
                <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-10 text-center text-sm text-slate-400">
                  {isLoadingData
                    ? 'অর্ডার তালিকা লোড হচ্ছে...'
                    : 'ফিল্টার অনুযায়ী কোনো অর্ডার পাওয়া যায়নি।'}
                </div>
              ) : (
                orders.map((ord) => {
                  const isBusy = actionLoadingId === ord.orderNumber;
                  const trxRef =
                    ord.payment?.transactionReference ||
                    ord.paymentReference ||
                    null;
                  const senderPhone =
                    ord.payment?.senderNumber || ord.customerPhone || 'N/A';
                  const deliveryRef =
                    ord.delivery?.deliveryReference || null;
                  const attemptCount = ord.delivery?.attemptCount || 0;
                  const maxRetries = ord.delivery?.maxRetries || 3;

                  const canApprovePayment =
                    ord.paymentStatus === 'SUBMITTED' ||
                    (ord.paymentStatus === 'UNPAID' && Boolean(trxRef));

                  const canRejectPayment =
                    ['SUBMITTED', 'VERIFYING'].includes(ord.paymentStatus) &&
                    ord.orderStatus !== 'COMPLETED';

                  const canRetryDelivery =
                    ord.paymentStatus === 'VERIFIED' &&
                    ord.deliveryStatus !== 'COMPLETED' &&
                    !['COMPLETED', 'CANCELLED', 'REFUNDED'].includes(
                      ord.orderStatus
                    );

                  const canCancel = !['COMPLETED', 'CANCELLED', 'REFUNDED'].includes(
                    ord.orderStatus
                  );

                  const canRefund =
                    ord.paymentStatus === 'VERIFIED' &&
                    ord.orderStatus !== 'REFUNDED' &&
                    ord.deliveryStatus !== 'COMPLETED';

                  return (
                    <div
                      key={ord.id}
                      className="bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 shadow-lg transition space-y-4"
                    >
                      {/* কার্ডের উপরের সারি */}
                      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 pb-3.5 border-b border-slate-800">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-base font-extrabold text-amber-400 font-mono">
                            {ord.orderNumber}
                          </span>
                          <span className="text-xs text-slate-400">
                            {formatDateTime(ord.createdAt)}
                          </span>
                          <StatusBadge status={ord.orderStatus} />
                          <StatusBadge
                            status={ord.paymentStatus}
                            prefix="পেমেন্ট"
                          />
                          <StatusBadge
                            status={ord.deliveryStatus}
                            prefix="ডেলিভারি"
                          />
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-xs px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 font-mono">
                            Attempts: {attemptCount}/{maxRetries}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleInspectOrder(ord.orderNumber)}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 transition"
                          >
                            🔍 ৩৬০° বিস্তারিত ও লগ
                          </button>
                        </div>
                      </div>

                      {/* অর্ডারের বিস্তারিত ৪ কলামের গ্রিড */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                        <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3">
                          <span className="text-slate-400 block">
                            প্লেয়ার ও সার্ভার
                          </span>
                          <span className="text-white font-bold block mt-0.5">
                            {ord.verifiedPlayerName}
                          </span>
                          <span className="text-amber-300 font-mono block mt-0.5">
                            UID: {ord.playerUid} ({ord.gameServer || 'BD'})
                          </span>
                        </div>

                        <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3">
                          <span className="text-slate-400 block">
                            প্যাকেজ ও মূল্য
                          </span>
                          <span className="text-white font-bold block mt-0.5">
                            {ord.productName} (💎 {ord.diamondQuantity})
                          </span>
                          <span className="text-emerald-400 font-extrabold text-sm block mt-0.5">
                            ৳{ord.finalPayableAmount} {ord.currency || 'BDT'}
                          </span>
                        </div>

                        <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3">
                          <span className="text-slate-400 block">
                            পেমেন্ট তথ্য ({ord.paymentMethod})
                          </span>
                          <span className="text-amber-300 font-mono font-bold block mt-0.5">
                            TrxID: {trxRef || 'জমা দেওয়া হয়নি'}
                          </span>
                          <span className="text-slate-300 font-mono block mt-0.5">
                            Sender: {senderPhone}
                          </span>
                        </div>

                        <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3">
                          <span className="text-slate-400 block">
                            ডেলিভারি রেফারেন্স ও মোড
                          </span>
                          {deliveryRef ? (
                            <>
                              <span className="text-emerald-400 font-mono font-bold block mt-0.5 break-all">
                                {deliveryRef}
                              </span>
                              <span className="text-slate-400 block mt-0.5">
                                Mode: {ord.delivery?.deliveryMode || 'DEMO'}
                              </span>
                            </>
                          ) : (
                            <span className="text-slate-400 block mt-1">
                              {ord.delivery?.lastErrorMessage ||
                                'ডেলিভারি এখনো সম্পন্ন হয়নি'}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* অ্যাডমিন ওয়ান-ক্লিক অ্যাকশন বাটন বার */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                        <div className="flex flex-wrap items-center gap-2">
                          {canApprovePayment && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleApprovePayment(ord)}
                              className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-md shadow-emerald-500/10 transition disabled:opacity-50"
                            >
                              {isBusy
                                ? 'প্রসেস হচ্ছে...'
                                : '✓ পেমেন্ট ভেরিফাই ও অটো-ডেলিভারি'}
                            </button>
                          )}

                          {canRejectPayment && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => {
                                setActionReason('');
                                setActionModal({
                                  type: 'REJECT_PAYMENT',
                                  order: ord,
                                });
                              }}
                              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-500/30 transition disabled:opacity-50"
                            >
                              ✕ পেমেন্ট রিজেক্ট
                            </button>
                          )}

                          {canRetryDelivery && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleManualRetry(ord)}
                              className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition disabled:opacity-50"
                            >
                              {isBusy
                                ? 'রিট্রাই হচ্ছে...'
                                : '↻ ম্যানুয়াল ডেলিভারি রিট্রাই'}
                            </button>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {canRefund && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => {
                                setActionReason('');
                                setRefundReferenceInput('');
                                setActionModal({
                                  type: 'REFUND',
                                  order: ord,
                                });
                              }}
                              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-teal-500/15 hover:bg-teal-500/25 text-teal-300 border border-teal-500/30 transition"
                            >
                              💸 রিফান্ড মার্ক করুন
                            </button>
                          )}

                          {canCancel && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => {
                                setActionReason('');
                                setActionModal({
                                  type: 'CANCEL',
                                  order: ord,
                                });
                              }}
                              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
                            >
                              বাতিল (Cancel)
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* পেজিনেশন */}
            {ordersPagination.totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 pt-4">
                <button
                  type="button"
                  disabled={ordersPagination.page <= 1 || isLoadingData}
                  onClick={() => loadAdminWorkspace(ordersPagination.page - 1)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 disabled:opacity-40"
                >
                  ← পূর্ববর্তী
                </button>
                <span className="text-xs text-slate-400">
                  পেজ {ordersPagination.page} / {ordersPagination.totalPages}
                </span>
                <button
                  type="button"
                  disabled={
                    ordersPagination.page >= ordersPagination.totalPages ||
                    isLoadingData
                  }
                  onClick={() => loadAdminWorkspace(ordersPagination.page + 1)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 disabled:opacity-40"
                >
                  পরবর্তী →
                </button>
              </div>
            )}
          </div>
        )}

        {/* =================================================================
         * ট্যাব ২: সাপ্লায়ার ডেলিভারি অ্যাটেম্পট লগ
         * ================================================================= */}
        {activeTab === 'DELIVERY_LOGS' && (
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">
                সাপ্লায়ার ডেলিভারি অ্যাটেম্পট ও রিট্রাই লগ
              </h3>
              <button
                type="button"
                onClick={loadDeliveryLogsTab}
                className="px-3 py-1.5 rounded-lg text-xs bg-slate-800 hover:bg-slate-700 text-slate-200"
              >
                ↻ লগ রিফ্রেশ
              </button>
            </div>

            {deliveryLogs.length === 0 ? (
              <p className="text-xs text-slate-400 py-8 text-center">
                এখনো কোনো ডেলিভারি অ্যাটেম্পট রেকর্ড তৈরি হয়নি।
              </p>
            ) : (
              <div className="space-y-2.5">
                {deliveryLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-amber-400">
                          {log.order?.orderNumber || log.orderId}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                          Attempt #{log.attemptNumber}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-cyan-300 font-mono">
                          Mode: {log.deliveryMode}
                        </span>
                        <StatusBadge status={log.status} />
                      </div>
                      <p className="text-slate-300">
                        UID: {log.order?.playerUid} • 💎{' '}
                        {log.order?.diamondQuantity} • Ref:{' '}
                        <span className="font-mono text-emerald-400">
                          {log.deliveryRef || 'N/A'}
                        </span>
                      </p>
                      {log.errorMessage && (
                        <p className="text-red-400">
                          Error ({log.errorCode}): {log.errorMessage}
                        </p>
                      )}
                    </div>

                    <div className="text-right text-[11px] text-slate-400 font-mono shrink-0">
                      <div>HTTP {log.httpStatus || 200} • {log.durationMs || 0}ms</div>
                      <div>{formatDateTime(log.createdAt)}</div>
                      <div>By: {log.triggeredBy}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* =================================================================
         * ট্যাব ৩: অ্যাডমিন অডিট ট্রেইল (Audit Logs)
         * ================================================================= */}
        {activeTab === 'AUDIT_LOGS' && (
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">
                অ্যাডমিন ও সিস্টেম অডিট লগ (Audit Trail)
              </h3>
              <button
                type="button"
                onClick={loadAuditLogsTab}
                className="px-3 py-1.5 rounded-lg text-xs bg-slate-800 hover:bg-slate-700 text-slate-200"
              >
                ↻ অডিট রিফ্রেশ
              </button>
            </div>

            {auditLogs.length === 0 ? (
              <p className="text-xs text-slate-400 py-8 text-center">
                কোনো অডিট লগ পাওয়া যায়নি।
              </p>
            ) : (
              <div className="space-y-2.5">
                {auditLogs.map((audit) => (
                  <div
                    key={audit.id}
                    className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-mono font-bold">
                          {audit.action}
                        </span>
                        {audit.order?.orderNumber && (
                          <span className="font-mono font-bold text-cyan-400">
                            Order: {audit.order.orderNumber}
                          </span>
                        )}
                        <span className="text-slate-400">
                          Actor: {audit.actorEmail || 'SYSTEM'} ({audit.actorRole})
                        </span>
                      </div>
                      {audit.metadata?.reason && (
                        <p className="text-slate-300">
                          কারণ: {audit.metadata.reason}
                        </p>
                      )}
                    </div>

                    <div className="text-right text-[11px] text-slate-400 font-mono shrink-0">
                      <div>{formatDateTime(audit.createdAt)}</div>
                      {audit.ipAddress && <div>IP: {audit.ipAddress}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* =================================================================
         * মডাল ১: পেমেন্ট রিজেক্ট / অর্ডার ক্যানসেল / রিফান্ড কনফার্মেশন মডাল
         * ================================================================= */}
        {actionModal?.order && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-base font-bold text-white">
                  {actionModal.type === 'REJECT_PAYMENT' &&
                    `পেমেন্ট রিজেক্ট করুন (${actionModal.order.orderNumber})`}
                  {actionModal.type === 'CANCEL' &&
                    `অর্ডার বাতিল করুন (${actionModal.order.orderNumber})`}
                  {actionModal.type === 'REFUND' &&
                    `অর্ডার রিফান্ড করুন (${actionModal.order.orderNumber})`}
                </h3>
                <button
                  type="button"
                  onClick={() => setActionModal(null)}
                  className="text-slate-400 hover:text-white"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleConfirmActionModal} className="space-y-4">
                <div>
                  <label className="block text-xs text-slate-300 mb-1.5">
                    কারণ উল্লেখ করুন (কাস্টমারের ট্র্যাকিং পেজে ও অডিট লগে সেভ হবে) *
                  </label>
                  <textarea
                    rows={3}
                    value={actionReason}
                    onChange={(e) => setActionReason(e.target.value)}
                    placeholder="যেমন: প্রদত্ত TrxID আমাদের বিকাশ স্টেটমেন্টে পাওয়া যায়নি..."
                    className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:border-amber-400 focus:outline-none"
                    required
                  />
                </div>

                {actionModal.type === 'REFUND' && (
                  <div>
                    <label className="block text-xs text-slate-300 mb-1.5">
                      রিফান্ড ট্রানজেকশন রেফারেন্স (ঐচ্ছিক)
                    </label>
                    <input
                      type="text"
                      value={refundReferenceInput}
                      onChange={(e) => setRefundReferenceInput(e.target.value)}
                      placeholder="যেমন: REF-TRX-99281"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white font-mono"
                    />
                  </div>
                )}

                <div className="flex items-center justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setActionModal(null)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 text-slate-300"
                  >
                    বন্ধ করুন
                  </button>
                  <button
                    type="submit"
                    disabled={Boolean(actionLoadingId)}
                    className="px-5 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950"
                  >
                    কনফার্ম করুন
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* =================================================================
         * মডাল ২: অর্ডারের ৩৬০-ডিগ্রি ইন্সপেক্টর ও টাইমলাইন মডাল
         * ================================================================= */}
        {inspectedOrderData?.order && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
            <div className="w-full max-w-4xl my-8 bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
              <div className="flex items-center justify-between px-6 py-4 bg-slate-900 border-b border-slate-800">
                <div>
                  <h3 className="text-base font-bold text-white">
                    🔍 অর্ডার ৩৬০° অ্যাডমিন ভিউ ({inspectedOrderData.order.orderNumber})
                  </h3>
                  <p className="text-xs text-slate-400">
                    Internal ID: {inspectedOrderData.order.id}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setInspectedOrderData(null)}
                  className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center"
                >
                  ✕
                </button>
              </div>

              <div className="p-6 max-h-[82vh] overflow-y-auto space-y-6">
                <OrderTimeline
                  order={inspectedOrderData.order}
                  timeline={inspectedOrderData.timeline}
                  notifications={inspectedOrderData.order.notifications || []}
                  statusHistory={inspectedOrderData.order.statusHistory || []}
                  onRefresh={() =>
                    handleInspectOrder(inspectedOrderData.order.orderNumber)
                  }
                  isRefreshing={isLoadingInspect}
                />

                {/* অর্ডারের অডিট লগ সেকশন */}
                {inspectedOrderData.auditLogs?.length > 0 && (
                  <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-3">
                    <h4 className="text-sm font-bold text-white">
                      এই অর্ডারের অডিট ট্রেইল (Audit Logs)
                    </h4>
                    <div className="space-y-2">
                      {inspectedOrderData.auditLogs.map((log) => (
                        <div
                          key={log.id}
                          className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs flex items-center justify-between"
                        >
                          <div>
                            <span className="font-mono font-bold text-amber-400">
                              {log.action}
                            </span>
                            <span className="text-slate-300 ml-2">
                              by {log.actorEmail} ({log.actorRole})
                            </span>
                            {log.metadata?.reason && (
                              <p className="text-slate-400 mt-0.5">
                                কারণ: {log.metadata.reason}
                              </p>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-400 font-mono">
                            {formatDateTime(log.createdAt)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
