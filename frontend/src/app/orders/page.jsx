'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  fetchMyOrders,
  fetchOrderDetails,
  getRecentOrdersLocally,
} from '../../lib/orderApi';
import OrderTimeline, {
  StatusBadge,
  formatDateTime,
} from '../../components/order/OrderTimeline';

export default function CustomerOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 12,
    totalCount: 0,
    totalPages: 1,
  });

  const [playerUidFilter, setPlayerUidFilter] = useState('');
  const [appliedUid, setAppliedUid] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  // নির্দিষ্ট অর্ডারের বিস্তারিত ৫-ধাপের টাইমলাইন মডাল বা ড্রয়ারে দেখার স্টেট
  const [selectedOrderData, setSelectedOrderData] = useState(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  // ব্যাকএন্ড থেকে কাস্টমার/গেস্টের অর্ডার তালিকা লোড করা
  const loadOrders = useCallback(
    async (pageNumber = 1, uidToSearch = appliedUid) => {
      setIsLoading(true);
      setErrorMsg('');

      try {
        const res = await fetchMyOrders({
          page: pageNumber,
          limit: 12,
          playerUid: uidToSearch,
        });

        const serverOrders = res?.orders || res?.data?.orders || [];
        const serverPagination = res?.pagination ||
          res?.data?.pagination || {
            page: pageNumber,
            limit: 12,
            totalCount: serverOrders.length,
            totalPages: 1,
          };

        if (serverOrders.length > 0) {
          setOrders(serverOrders);
          setPagination(serverPagination);
        } else if (!uidToSearch && pageNumber === 1) {
          // যদি সার্ভারে গেস্ট আইডির বিপরীতে কিছু না পাওয়া যায়, তবে লোকাল স্টোরেজে থাকা সাম্প্রতিক অর্ডার দেখানো
          const localFallback = getRecentOrdersLocally();
          setOrders(localFallback);
          setPagination({
            page: 1,
            limit: 12,
            totalCount: localFallback.length,
            totalPages: 1,
          });
        } else {
          setOrders([]);
          setPagination(serverPagination);
        }
      } catch (err) {
        // নেটওয়ার্ক এরর হলেও লোকাল ক্যাশ থেকে অর্ডার দেখানোর ফলব্যাক
        const localFallback = getRecentOrdersLocally();
        if (localFallback.length > 0 && !uidToSearch) {
          setOrders(localFallback);
        } else {
          setErrorMsg(
            err.message || 'অর্ডার তালিকা লোড করতে সমস্যা হয়েছে। আবার চেষ্টা করুন।'
          );
        }
      } finally {
        setIsLoading(false);
      }
    },
    [appliedUid]
  );

  useEffect(() => {
    loadOrders(1, appliedUid);
  }, [loadOrders, appliedUid]);

  // Player UID দিয়ে অর্ডার সার্চ হ্যান্ডলার
  const handleUidSearchSubmit = (e) => {
    e.preventDefault();
    const cleanUid = playerUidFilter.replace(/\D/g, '').trim();
    setAppliedUid(cleanUid);
  };

  // নির্দিষ্ট অর্ডারের বিস্তারিত ৫-ধাপের টাইমলাইন ওপেন করা
  const handleOpenOrderDetails = async (orderNumber) => {
    setIsLoadingDetails(true);
    try {
      const res = await fetchOrderDetails(orderNumber);
      const data = res?.data || res;
      setSelectedOrderData({
        order: data.order,
        timeline: data.timeline,
        notifications: data.notifications || [],
      });
    } catch (err) {
      setErrorMsg(
        err.message || 'অর্ডারের বিস্তারিত তথ্য লোড করতে সমস্যা হয়েছে।'
      );
    } finally {
      setIsLoadingDetails(false);
    }
  };

  // ক্লায়েন্ট-সাইড স্ট্যাটাস ফিল্টারিং
  const filteredOrders = orders.filter((ord) => {
    if (statusFilter === 'ALL') return true;
    return String(ord.orderStatus || '').toUpperCase() === statusFilter;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* ১. পেজ হেডার ও কুইক অ্যাকশন বাটন */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white flex items-center gap-2.5">
              <span>📦</span>
              <span>আমার অর্ডার হিস্ট্রি</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              আপনার সকল ডায়মন্ড টপ-আপ অর্ডার, পেমেন্ট স্ট্যাটাস ও ডেলিভারি রেফারেন্স এখানে সংরক্ষিত থাকে
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <Link
              href="/track"
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 transition"
            >
              🛰️ অর্ডার আইডি দিয়ে ট্র্যাক করুন
            </Link>
            <Link
              href="/"
              className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition"
            >
              + নতুন ডায়মন্ড টপ-আপ
            </Link>
          </div>
        </div>

        {/* ২. Player UID সার্চ ও স্ট্যাটাস ফিল্টার বার */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <form
              onSubmit={handleUidSearchSubmit}
              className="flex flex-1 gap-2.5"
            >
              <input
                type="text"
                inputMode="numeric"
                value={playerUidFilter}
                onChange={(e) =>
                  setPlayerUidFilter(e.target.value.replace(/\D/g, '').slice(0, 15))
                }
                placeholder="আপনার Free Fire Player UID দিয়ে অর্ডার খুঁজুন..."
                className="flex-1 px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-amber-400 focus:outline-none text-xs sm:text-sm text-white font-mono"
              />
              <button
                type="submit"
                className="px-4 py-2.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition shrink-0"
              >
                UID খুঁজুন
              </button>
              {appliedUid && (
                <button
                  type="button"
                  onClick={() => {
                    setPlayerUidFilter('');
                    setAppliedUid('');
                  }}
                  className="px-3 py-2.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition shrink-0"
                >
                  রিসেট
                </button>
              )}
            </form>

            <button
              type="button"
              onClick={() => loadOrders(pagination.page, appliedUid)}
              disabled={isLoading}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition disabled:opacity-50 self-start md:self-auto"
            >
              {isLoading ? 'লোড হচ্ছে...' : '↻ তালিকা রিফ্রেশ করুন'}
            </button>
          </div>

          {/* স্ট্যাটাস ফিল্টার ট্যাব */}
          <div className="flex flex-wrap gap-2 pt-3 border-t border-slate-800/80">
            {[
              { code: 'ALL', label: 'সব অর্ডার' },
              { code: 'PENDING', label: 'পেমেন্ট বাকি' },
              { code: 'PAYMENT_REVIEW', label: 'পেমেন্ট রিভিউতে' },
              { code: 'PROCESSING', label: 'ডেলিভারি প্রসেসিং' },
              { code: 'COMPLETED', label: 'ডেলিভারি সম্পন্ন' },
              { code: 'FAILED', label: 'ব্যর্থ / রিফান্ড' },
            ].map((tab) => (
              <button
                key={tab.code}
                type="button"
                onClick={() => setStatusFilter(tab.code)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                  statusFilter === tab.code
                    ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                    : 'bg-slate-950 hover:bg-slate-800 border-slate-800 text-slate-400'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* এরর মেসেজ */}
        {errorMsg && (
          <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-xs sm:text-sm text-red-300">
            ⚠️ {errorMsg}
          </div>
        )}

        {/* ৩. অর্ডার তালিকা গ্রিড */}
        {isLoading ? (
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-12 text-center text-sm text-slate-400">
            আপনার অর্ডার তালিকা লোড হচ্ছে...
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-10 text-center space-y-3">
            <p className="text-base font-bold text-white">
              কোনো অর্ডার খুঁজে পাওয়া যায়নি
            </p>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              আপনি যদি অন্য ব্রাউজার বা ডিভাইস থেকে অর্ডার করে থাকেন, তবে উপরে আপনার Free Fire Player UID লিখে সার্চ করুন অথবা Order ID দিয়ে ট্র্যাকিং পেজে দেখুন।
            </p>
            <div className="pt-2 flex items-center justify-center gap-3">
              <Link
                href="/track"
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
              >
                Order ID দিয়ে ট্র্যাক করুন
              </Link>
              <Link
                href="/"
                className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition"
              >
                প্রথম অর্ডার করুন
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredOrders.map((ord) => {
              const deliveryRef =
                ord.delivery?.deliveryReference || ord.deliveryReference || null;
              const deliveryMode =
                ord.delivery?.deliveryMode || ord.deliveryMode || 'DEMO';
              const trxRef =
                ord.payment?.transactionReference || ord.paymentReference || null;

              return (
                <div
                  key={ord.orderNumber || ord.id}
                  className="bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 shadow-lg transition flex flex-col justify-between gap-4"
                >
                  <div className="space-y-3">
                    {/* অর্ডার নাম্বার ও স্ট্যাটাস */}
                    <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-800">
                      <div>
                        <span className="text-sm font-bold text-amber-400 font-mono block">
                          {ord.orderNumber}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {formatDateTime(ord.createdAt)}
                        </span>
                      </div>
                      <StatusBadge status={ord.orderStatus} />
                    </div>

                    {/* প্যাকেজ ও প্লেয়ার তথ্য */}
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
                        <span className="text-slate-400 block">প্যাকেজ</span>
                        <span className="text-white font-semibold block mt-0.5 truncate">
                          {ord.productName}
                        </span>
                        <span className="text-amber-400 font-bold block mt-0.5">
                          💎 {ord.diamondQuantity} Diamonds
                        </span>
                      </div>

                      <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
                        <span className="text-slate-400 block">প্লেয়ার</span>
                        <span className="text-white font-semibold block mt-0.5 truncate">
                          {ord.verifiedPlayerName || 'Verified Player'}
                        </span>
                        <span className="text-slate-300 font-mono block mt-0.5">
                          UID: {ord.playerUid}
                        </span>
                      </div>
                    </div>

                    {/* মূল্য, TrxID ও ডেলিভারি রেফারেন্স */}
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-1">
                      <div>
                        <span className="text-slate-400">মূল্য: </span>
                        <strong className="text-emerald-400 text-sm">
                          ৳{ord.finalPayableAmount}
                        </strong>
                        {ord.paymentMethod && (
                          <span className="text-slate-300 ml-1.5">
                            ({ord.paymentMethod}
                            {trxRef ? ` • ${trxRef}` : ''})
                          </span>
                        )}
                      </div>

                      {deliveryRef && (
                        <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-mono text-[11px]">
                          Ref: {deliveryRef} ({deliveryMode})
                        </span>
                      )}
                    </div>

                    {/* সাব-স্ট্যাটাস ব্যাজ */}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <StatusBadge status={ord.paymentStatus} prefix="পেমেন্ট" />
                      <StatusBadge
                        status={ord.deliveryStatus}
                        prefix="ডেলিভারি"
                      />
                    </div>
                  </div>

                  {/* অ্যাকশন বাটনসমূহ */}
                  <div className="flex items-center gap-2.5 pt-3 border-t border-slate-800/80">
                    <button
                      type="button"
                      onClick={() => handleOpenOrderDetails(ord.orderNumber)}
                      disabled={isLoadingDetails}
                      className="flex-1 py-2 px-3 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition text-center"
                    >
                      ৫-ধাপের টাইমলাইন দেখুন
                    </button>
                    <Link
                      href={`/track?orderId=${encodeURIComponent(
                        ord.orderNumber
                      )}`}
                      className="py-2 px-3.5 rounded-xl text-xs font-bold bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 transition text-center"
                    >
                      লাইভ ট্র্যাক →
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ৪. পেজিনেশন কন্ট্রোল */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 pt-4">
            <button
              type="button"
              disabled={pagination.page <= 1 || isLoading}
              onClick={() => loadOrders(pagination.page - 1, appliedUid)}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 disabled:opacity-40 transition"
            >
              ← পূর্ববর্তী পেজ
            </button>
            <span className="text-xs text-slate-400">
              পেজ {pagination.page} / {pagination.totalPages}
            </span>
            <button
              type="button"
              disabled={pagination.page >= pagination.totalPages || isLoading}
              onClick={() => loadOrders(pagination.page + 1, appliedUid)}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 disabled:opacity-40 transition"
            >
              পরবর্তী পেজ →
            </button>
          </div>
        )}

        {/* ৫. বিস্তারিত ৫-ধাপের টাইমলাইন পপআপ মডাল */}
        {selectedOrderData?.order && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
            <div className="w-full max-w-3xl my-8 bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
              <div className="flex items-center justify-between px-5 py-4 bg-slate-900 border-b border-slate-800">
                <h3 className="text-base font-bold text-white">
                  অর্ডার বিবরণ ও লাইভ টাইমলাইন ({selectedOrderData.order.orderNumber})
                </h3>
                <button
                  type="button"
                  onClick={() => setSelectedOrderData(null)}
                  className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center"
                >
                  ✕
                </button>
              </div>
              <div className="p-5 max-h-[80vh] overflow-y-auto">
                <OrderTimeline
                  order={selectedOrderData.order}
                  timeline={selectedOrderData.timeline}
                  notifications={selectedOrderData.notifications}
                  onRefresh={() =>
                    handleOpenOrderDetails(selectedOrderData.order.orderNumber)
                  }
                  isRefreshing={isLoadingDetails}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
