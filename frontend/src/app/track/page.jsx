'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  trackOrderPublic,
  submitOrderPayment,
  getRecentOrdersLocally,
  generateIdempotencyKey,
} from '../../lib/orderApi';
import OrderTimeline from '../../components/order/OrderTimeline';

function TrackOrderContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryOrderId = searchParams.get('orderId') || '';

  const [orderIdInput, setOrderIdInput] = useState(queryOrderId);
  const [activeOrderId, setActiveOrderId] = useState(queryOrderId);
  const [trackingData, setTrackingData] = useState(null);
  const [recentOrders, setRecentOrders] = useState([]);

  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // যদি অর্ডার UNPAID বা REJECTED থাকে, তখন ট্র্যাকিং পেজ থেকেই TrxID জমা দেওয়ার স্টেট
  const [paymentMethod, setPaymentMethod] = useState('BKASH');
  const [senderNumber, setSenderNumber] = useState('');
  const [transactionReference, setTransactionReference] = useState('');
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  const [paymentSubmitError, setPaymentSubmitError] = useState('');
  const [paymentSuccessMsg, setPaymentSuccessMsg] = useState('');

  // ব্রাউজারের লোকাল স্টোরেজ থেকে সাম্প্রতিক অর্ডারগুলো লোড করা
  useEffect(() => {
    setRecentOrders(getRecentOrdersLocally());
  }, [trackingData]);

  // অর্ডার ট্র্যাকিং ডেটা ফেচ করার ফাংশন
  const loadOrderTracking = useCallback(
    async (targetId, { silent = false } = {}) => {
      const cleanId = String(targetId || '').trim();
      if (!cleanId) return;

      if (!silent) {
        setIsLoading(true);
        setErrorMsg('');
      } else {
        setIsRefreshing(true);
      }

      try {
        const res = await trackOrderPublic(cleanId);
        const data = res?.data || res;
        setTrackingData(data);

        if (data?.order?.paymentMethod) {
          setPaymentMethod(data.order.paymentMethod);
        }
        setErrorMsg('');
      } catch (err) {
        if (!silent) {
          setTrackingData(null);
          setErrorMsg(
            err.message ||
              'প্রদত্ত অর্ডার আইডি দিয়ে কোনো অর্ডার খুঁজে পাওয়া যায়নি।'
          );
        }
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    []
  );

  // URL-এ থাকা orderId পরিবর্তন হলে স্বয়ংক্রিয়ভাবে লোড করা
  useEffect(() => {
    if (queryOrderId) {
      setOrderIdInput(queryOrderId);
      setActiveOrderId(queryOrderId);
      loadOrderTracking(queryOrderId);
    }
  }, [queryOrderId, loadOrderTracking]);

  // অর্ডার প্রসেসিং অবস্থায় থাকলে প্রতি ১২ সেকেন্ড পর পর স্বয়ংক্রিয়ভাবে লাইভ স্ট্যাটাস পোলিং করা
  useEffect(() => {
    if (!activeOrderId || !trackingData?.order) return;

    const isTerminal =
      trackingData?.timeline?.isTerminalState ||
      ['COMPLETED', 'CANCELLED', 'REFUNDED'].includes(
        trackingData.order.orderStatus
      );

    if (isTerminal) return;

    const interval = setInterval(() => {
      loadOrderTracking(activeOrderId, { silent: true });
    }, 12000);

    return () => clearInterval(interval);
  }, [activeOrderId, trackingData, loadOrderTracking]);

  // সার্চ ফর্ম সাবমিট হ্যান্ডলার
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    const cleanId = String(orderIdInput || '').trim().toUpperCase();
    if (!cleanId) {
      setErrorMsg('অনুগ্রহ করে আপনার Order ID লিখুন।');
      return;
    }

    setActiveOrderId(cleanId);
    router.replace(`/track?orderId=${encodeURIComponent(cleanId)}`, {
      scroll: false,
    });
    loadOrderTracking(cleanId);
  };

  // বকেয়া বা রিজেক্ট হওয়া পেমেন্টের TrxID পুনরায় জমা দেওয়ার হ্যান্ডলার
  const handleDelayedPaymentSubmit = async (e) => {
    e.preventDefault();
    setPaymentSubmitError('');
    setPaymentSuccessMsg('');

    const cleanSender = String(senderNumber).trim();
    if (!/^01[3-9]\d{8}$/.test(cleanSender)) {
      setPaymentSubmitError(
        'অনুগ্রহ করে ১১ সংখ্যার সঠিক সেন্ডার মোবাইল নাম্বার দিন (যেমন: 017XXXXXXXX)।'
      );
      return;
    }

    const cleanTrx = String(transactionReference).trim().toUpperCase();
    if (!/^[A-Z0-9]{6,20}$/.test(cleanTrx)) {
      setPaymentSubmitError(
        'অনুগ্রহ করে ৬ থেকে ২০ অক্ষরের সঠিক Transaction ID (TrxID) লিখুন।'
      );
      return;
    }

    setIsSubmittingPayment(true);

    try {
      const idempotencyKey = generateIdempotencyKey('TRACK_PAY');
      await submitOrderPayment(
        trackingData.order.orderNumber,
        {
          paymentMethod,
          senderNumber: cleanSender,
          transactionReference: cleanTrx,
        },
        idempotencyKey
      );

      setPaymentSuccessMsg(
        'আপনার পেমেন্ট তথ্য সফলভাবে জমা হয়েছে! অ্যাডমিন যাচাই করার সাথে সাথেই ডায়মন্ড ডেলিভারি শুরু হবে।'
      );
      setTransactionReference('');
      await loadOrderTracking(trackingData.order.orderNumber, { silent: true });
    } catch (err) {
      setPaymentSubmitError(
        err.message || 'পেমেন্ট তথ্য জমা দিতে সমস্যা হয়েছে। আবার চেষ্টা করুন।'
      );
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  const canSubmitPayment =
    trackingData?.order &&
    ['UNPAID', 'REJECTED'].includes(trackingData.order.paymentStatus) &&
    !['COMPLETED', 'CANCELLED', 'REFUNDED'].includes(
      trackingData.order.orderStatus
    );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* টপ নেভিগেশন ও শিরোনাম */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white flex items-center gap-2.5">
              <span>🛰️</span>
              <span>লাইভ অর্ডার ট্র্যাকিং</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              আপনার Order ID দিয়ে পেমেন্ট ভেরিফিকেশন ও অটো-ডেলিভারির রিয়েল-টাইম অগ্রগতি দেখুন
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <Link
              href="/orders"
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 transition"
            >
              আমার অর্ডারসমূহ
            </Link>
            <Link
              href="/"
              className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition"
            >
              + নতুন টপ-আপ
            </Link>
          </div>
        </div>

        {/* অর্ডার আইডি সার্চ বক্স */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl">
          <form
            onSubmit={handleSearchSubmit}
            className="flex flex-col sm:flex-row gap-3"
          >
            <input
              type="text"
              value={orderIdInput}
              onChange={(e) => setOrderIdInput(e.target.value.toUpperCase())}
              placeholder="আপনার Order ID লিখুন (যেমন: FFH-20261125-000001)"
              className="flex-1 px-4 py-3.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-amber-400 focus:outline-none text-sm text-white font-mono uppercase"
            />
            <button
              type="submit"
              disabled={isLoading}
              className="px-6 py-3.5 rounded-xl font-bold text-sm bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 shadow-lg shadow-amber-500/20 transition disabled:opacity-50 shrink-0"
            >
              {isLoading ? 'খোঁজা হচ্ছে...' : 'অর্ডার ট্র্যাক করুন'}
            </button>
          </form>

          {/* ব্রাউজারে সংরক্ষিত সাম্প্রতিক অর্ডার শর্টকাট চিপস */}
          {recentOrders.length > 0 && (
            <div className="mt-4 pt-3.5 border-t border-slate-800/80">
              <span className="text-[11px] text-slate-400 block mb-2">
                আপনার সাম্প্রতিক অর্ডারসমূহ (ক্লিক করে ট্র্যাক করুন):
              </span>
              <div className="flex flex-wrap gap-2">
                {recentOrders.slice(0, 5).map((item) => (
                  <button
                    key={item.orderNumber}
                    type="button"
                    onClick={() => {
                      setOrderIdInput(item.orderNumber);
                      setActiveOrderId(item.orderNumber);
                      router.replace(
                        `/track?orderId=${encodeURIComponent(item.orderNumber)}`,
                        { scroll: false }
                      );
                      loadOrderTracking(item.orderNumber);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono border transition ${
                      activeOrderId === item.orderNumber
                        ? 'bg-amber-500/20 border-amber-400 text-amber-300 font-bold'
                        : 'bg-slate-950 hover:bg-slate-800 border-slate-800 text-slate-300'
                    }`}
                  >
                    {item.orderNumber}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* এরর মেসেজ */}
        {errorMsg && (
          <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-sm text-red-300">
            ⚠️ {errorMsg}
          </div>
        )}

        {/* যদি অর্ডার UNPAID বা পেমেন্ট REJECTED হয়ে থাকে, তবে TrxID জমা দেওয়ার ফর্ম */}
        {canSubmitPayment && (
          <div className="bg-slate-900/95 border border-amber-500/40 rounded-2xl p-5 sm:p-6 shadow-xl space-y-4">
            <div>
              <h3 className="text-base font-bold text-amber-400">
                {trackingData.order.paymentStatus === 'REJECTED'
                  ? '⚠️ আপনার পূর্ববর্তী TrxID গ্রহণ করা যায়নি — সঠিক পেমেন্ট তথ্য পুনরায় জমা দিন'
                  : '💳 পেমেন্ট Transaction ID (TrxID) জমা দিন'}
              </h3>
              <p className="text-xs text-slate-300 mt-1">
                প্রদেয় মূল্য:{' '}
                <strong className="text-emerald-400">
                  ৳{trackingData.order.finalPayableAmount}
                </strong>{' '}
                • বিকাশ/নগদ/রকেট পার্সোনাল নাম্বার:{' '}
                <strong className="text-amber-300 font-mono">
                  01623759878
                </strong>
              </p>
            </div>

            <form
              onSubmit={handleDelayedPaymentSubmit}
              className="grid grid-cols-1 sm:grid-cols-4 gap-3"
            >
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="px-3.5 py-3 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:border-amber-400 focus:outline-none"
              >
                <option value="BKASH">bKash</option>
                <option value="NAGAD">Nagad</option>
                <option value="ROCKET">Rocket</option>
              </select>

              <input
                type="tel"
                value={senderNumber}
                onChange={(e) =>
                  setSenderNumber(e.target.value.replace(/\D/g, '').slice(0, 11))
                }
                placeholder="Sender Number (017XXXXXXXX)"
                className="px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white font-mono focus:border-amber-400 focus:outline-none"
                required
              />

              <input
                type="text"
                value={transactionReference}
                onChange={(e) =>
                  setTransactionReference(
                    e.target.value
                      .replace(/[^a-zA-Z0-9]/g, '')
                      .toUpperCase()
                      .slice(0, 20)
                  )
                }
                placeholder="Transaction ID (TrxID)"
                className="px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-sm text-amber-300 font-mono uppercase focus:border-amber-400 focus:outline-none"
                required
              />

              <button
                type="submit"
                disabled={isSubmittingPayment}
                className="px-5 py-3 rounded-xl font-bold text-xs bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition disabled:opacity-50"
              >
                {isSubmittingPayment ? 'জমা হচ্ছে...' : 'TrxID জমা দিন'}
              </button>
            </form>

            {paymentSubmitError && (
              <p className="text-xs text-red-400">{paymentSubmitError}</p>
            )}
            {paymentSuccessMsg && (
              <p className="text-xs text-emerald-400">{paymentSuccessMsg}</p>
            )}
          </div>
        )}

        {/* ৫-ধাপের অর্ডার ট্র্যাকিং টাইমলাইন কম্পোনেন্ট */}
        {trackingData?.order && (
          <OrderTimeline
            order={trackingData.order}
            timeline={trackingData.timeline}
            notifications={trackingData.notifications || []}
            statusHistory={trackingData.statusHistory || []}
            onRefresh={() =>
              loadOrderTracking(trackingData.order.orderNumber, {
                silent: true,
              })
            }
            isRefreshing={isRefreshing}
          />
        )}
      </div>
    </div>
  );
}

export default function TrackOrderPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 text-slate-300 flex items-center justify-center p-6 text-sm">
          অর্ডার ট্র্যাকিং পেজ লোড হচ্ছে...
        </div>
      }
    >
      <TrackOrderContent />
    </Suspense>
  );
}
