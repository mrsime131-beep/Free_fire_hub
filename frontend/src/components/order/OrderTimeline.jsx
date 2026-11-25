'use client';

import React, { useState } from 'react';

/**
 * স্ট্যাটাস অনুযায়ী রঙ ও বাংলা লেবেল নির্ধারণের হেল্পার
 */
export const STATUS_CONFIG = {
  // Order Statuses
  PENDING: {
    label: 'পেমেন্টের অপেক্ষায় (Pending)',
    bg: 'bg-amber-500/15',
    text: 'text-amber-400',
    border: 'border-amber-500/30',
  },
  PAYMENT_REVIEW: {
    label: 'পেমেন্ট যাচাই চলছে (In Review)',
    bg: 'bg-blue-500/15',
    text: 'text-blue-400',
    border: 'border-blue-500/30',
  },
  PAYMENT_VERIFIED: {
    label: 'পেমেন্ট ভেরিফাইড (Verified)',
    bg: 'bg-cyan-500/15',
    text: 'text-cyan-400',
    border: 'border-cyan-500/30',
  },
  PROCESSING: {
    label: 'ডেলিভারি প্রসেসিং (Processing)',
    bg: 'bg-indigo-500/15',
    text: 'text-indigo-400',
    border: 'border-indigo-500/30',
  },
  DELIVERY_PENDING: {
    label: 'ডেলিভারি কিউতে (Delivery Pending)',
    bg: 'bg-purple-500/15',
    text: 'text-purple-400',
    border: 'border-purple-500/30',
  },
  COMPLETED: {
    label: 'সম্পন্ন (Completed)',
    bg: 'bg-emerald-500/15',
    text: 'text-emerald-400',
    border: 'border-emerald-500/30',
  },
  FAILED: {
    label: 'ব্যর্থ (Failed)',
    bg: 'bg-red-500/15',
    text: 'text-red-400',
    border: 'border-red-500/30',
  },
  CANCELLED: {
    label: 'বাতিল (Cancelled)',
    bg: 'bg-slate-500/20',
    text: 'text-slate-300',
    border: 'border-slate-500/30',
  },
  REFUND_PENDING: {
    label: 'রিফান্ড প্রক্রিয়াধীন',
    bg: 'bg-orange-500/15',
    text: 'text-orange-400',
    border: 'border-orange-500/30',
  },
  REFUNDED: {
    label: 'রিফান্ড সম্পন্ন (Refunded)',
    bg: 'bg-teal-500/15',
    text: 'text-teal-400',
    border: 'border-teal-500/30',
  },

  // Payment Statuses
  UNPAID: {
    label: 'অপরিশোধিত (Unpaid)',
    bg: 'bg-amber-500/15',
    text: 'text-amber-400',
    border: 'border-amber-500/30',
  },
  SUBMITTED: {
    label: 'TrxID জমা হয়েছে (Submitted)',
    bg: 'bg-blue-500/15',
    text: 'text-blue-400',
    border: 'border-blue-500/30',
  },
  VERIFYING: {
    label: 'যাচাই চলছে (Verifying)',
    bg: 'bg-indigo-500/15',
    text: 'text-indigo-400',
    border: 'border-indigo-500/30',
  },
  VERIFIED: {
    label: 'পেমেন্ট ভেরিফাইড (Verified)',
    bg: 'bg-emerald-500/15',
    text: 'text-emerald-400',
    border: 'border-emerald-500/30',
  },
  REJECTED: {
    label: 'পেমেন্ট রিজেক্টেড (Rejected)',
    bg: 'bg-red-500/15',
    text: 'text-red-400',
    border: 'border-red-500/30',
  },

  // Delivery Statuses
  NOT_STARTED: {
    label: 'শুরু হয়নি (Not Started)',
    bg: 'bg-slate-500/15',
    text: 'text-slate-400',
    border: 'border-slate-500/30',
  },
  QUEUED: {
    label: 'কিউতে আছে (Queued)',
    bg: 'bg-cyan-500/15',
    text: 'text-cyan-400',
    border: 'border-cyan-500/30',
  },
  RETRY_PENDING: {
    label: 'পুনরায় চেষ্টা চলছে (Retry Pending)',
    bg: 'bg-amber-500/15',
    text: 'text-amber-400',
    border: 'border-amber-500/30',
  },
};

export const StatusBadge = ({ status, prefix = '' }) => {
  const key = String(status || '').toUpperCase();
  const cfg = STATUS_CONFIG[key] || {
    label: key || 'UNKNOWN',
    bg: 'bg-slate-700/40',
    text: 'text-slate-300',
    border: 'border-slate-600',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${cfg.bg} ${cfg.text} ${cfg.border}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {prefix ? `${prefix}: ` : ''}
      {cfg.label}
    </span>
  );
};

export const formatDateTime = (dateValue) => {
  if (!dateValue) return null;
  try {
    const d = new Date(dateValue);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleString('bn-BD', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (e) {
    return String(dateValue);
  }
};

/**
 * ৫-ধাপের লাইভ অর্ডার ট্র্যাকিং ও বিস্তারিত স্ট্যাটাস কম্পোনেন্ট
 */
export default function OrderTimeline({
  order,
  timeline,
  notifications = [],
  statusHistory = [],
  onRefresh = null,
  isRefreshing = false,
}) {
  const [copiedField, setCopiedField] = useState(null);

  if (!order) {
    return null;
  }

  const handleCopy = (text, fieldName) => {
    if (!text || typeof navigator === 'undefined') return;
    navigator.clipboard.writeText(String(text));
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const steps = timeline?.steps || [];
  const deliveryMode =
    order.delivery?.deliveryMode || order.deliveryMode || 'DEMO';
  const deliveryReference =
    order.delivery?.deliveryReference || order.deliveryReference || null;
  const paymentReference =
    order.payment?.transactionReference ||
    order.paymentReference ||
    order.maskedPaymentReference ||
    null;
  const displayPlayerUid =
    order.maskedPlayerUid || order.playerUid || 'N/A';

  return (
    <div className="space-y-6 text-slate-100">
      {/* ১. অর্ডার হেডার ও প্রধান স্ট্যাটাস কার্ড */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
                Order ID
              </span>
              <span className="text-lg sm:text-xl font-bold text-amber-400 font-mono">
                {order.orderNumber}
              </span>
              <button
                type="button"
                onClick={() => handleCopy(order.orderNumber, 'orderNumber')}
                className="text-xs px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
              >
                {copiedField === 'orderNumber' ? '✓ কপি হয়েছে' : 'কপি করুন'}
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              অর্ডারের সময়: {formatDateTime(order.createdAt) || 'পাওয়া যায়নি'}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={order.orderStatus} />
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={isRefreshing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition disabled:opacity-50"
              >
                <span className={isRefreshing ? 'animate-spin' : ''}>↻</span>
                {isRefreshing ? 'আপডেট হচ্ছে...' : 'রিফ্রেশ'}
              </button>
            )}
          </div>
        </div>

        {/* অর্ডারের মূল তথ্যের গ্রিড */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-5">
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5">
            <p className="text-xs text-slate-400">ডায়মন্ড প্যাকেজ</p>
            <p className="text-sm font-semibold text-white mt-1">
              {order.productName}
            </p>
            <p className="text-xs text-amber-400 font-medium mt-0.5">
              💎 {order.diamondQuantity} Diamonds
            </p>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5">
            <p className="text-xs text-slate-400">ফ্রি ফায়ার প্লেয়ার</p>
            <p className="text-sm font-semibold text-white mt-1">
              {order.verifiedPlayerName}
            </p>
            <p className="text-xs text-slate-300 font-mono mt-0.5">
              UID: {displayPlayerUid} ({order.gameServer || 'BD'})
            </p>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5">
            <p className="text-xs text-slate-400">পেমেন্ট ও মূল্য</p>
            <p className="text-sm font-bold text-emerald-400 mt-1">
              ৳{order.finalPayableAmount} {order.currency || 'BDT'}
            </p>
            <p className="text-xs text-slate-300 mt-0.5">
              মাধ্যম: {order.paymentMethod}{' '}
              {paymentReference ? `• TrxID: ${paymentReference}` : ''}
            </p>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5">
            <p className="text-xs text-slate-400">ডেলিভারি রেফারেন্স</p>
            {deliveryReference ? (
              <div className="mt-1">
                <p className="text-xs font-mono font-semibold text-emerald-400 break-all">
                  {deliveryReference}
                </p>
                <span className="inline-block mt-1 text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  Mode: {deliveryMode}
                </span>
              </div>
            ) : (
              <p className="text-xs text-slate-400 mt-1.5">
                ডেলিভারি সম্পন্ন হলে এখানে রেফারেন্স যুক্ত হবে
              </p>
            )}
          </div>
        </div>

        {/* পেমেন্ট ও ডেলিভারি সাব-স্ট্যাটাস বার */}
        <div className="flex flex-wrap items-center gap-2.5 mt-4 pt-4 border-t border-slate-800/80">
          <StatusBadge status={order.paymentStatus} prefix="পেমেন্ট" />
          <StatusBadge status={order.deliveryStatus} prefix="ডেলিভারি" />
          {deliveryMode === 'DEMO' && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-300 border border-amber-500/30">
              🧪 DEMO MODE (সিমুলেশন)
            </span>
          )}
        </div>

        {/* যদি পেমেন্ট রিজেক্ট বা ডেলিভারি ব্যর্থ হয়ে থাকে তার সতর্কবার্তা */}
        {order.payment?.rejectionReason && (
          <div className="mt-4 p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300">
            <p className="font-semibold text-red-400">
              পেমেন্ট ভেরিফিকেশন নোট:
            </p>
            <p className="mt-0.5">{order.payment.rejectionReason}</p>
          </div>
        )}

        {order.delivery?.lastErrorMessage &&
          order.deliveryStatus !== 'COMPLETED' && (
            <div className="mt-4 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200">
              <p className="font-semibold text-amber-400">
                ডেলিভারি স্ট্যাটাস নোট (চেষ্টা:{' '}
                {order.delivery?.attemptCount || 0}/
                {order.delivery?.maxRetries || 3}):
              </p>
              <p className="mt-0.5">{order.delivery.lastErrorMessage}</p>
            </div>
          )}
      </div>

      {/* ২. ৫-ধাপের লাইভ অর্ডার ট্র্যাকিং টাইমলাইন (Part 8) */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-white">
              লাইভ অর্ডার ট্র্যাকিং (৫-ধাপ)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              অর্ডার গ্রহণ থেকে শুরু করে ফ্রি ফায়ার অ্যাকাউন্টে ডায়মন্ড পৌঁছানো পর্যন্ত রিয়েল-টাইম অগ্রগতি
            </p>
          </div>
          {!timeline?.isTerminalState && (
            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-full">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              লাইভ আপডেট সক্রিয়
            </span>
          )}
        </div>

        <div className="relative space-y-5">
          {steps.map((step, index) => {
            const isCompleted = step.status === 'COMPLETED';
            const isCurrent = step.status === 'CURRENT';
            const isFailed =
              step.status === 'FAILED' || step.status === 'CANCELLED';
            const isLast = index === steps.length - 1;

            let circleStyle =
              'bg-slate-800 border-slate-700 text-slate-400';
            if (isCompleted) {
              circleStyle =
                'bg-emerald-500/20 border-emerald-500 text-emerald-400';
            } else if (isCurrent) {
              circleStyle =
                'bg-amber-500/20 border-amber-400 text-amber-300 ring-4 ring-amber-500/10';
            } else if (isFailed) {
              circleStyle = 'bg-red-500/20 border-red-500 text-red-400';
            }

            return (
              <div key={step.key || index} className="relative flex gap-4">
                {/* কানেক্টিং লাইন */}
                {!isLast && (
                  <div
                    className={`absolute left-4 top-9 -bottom-5 w-0.5 ${
                      isCompleted ? 'bg-emerald-500/50' : 'bg-slate-800'
                    }`}
                  />
                )}

                {/* ধাপের আইকন সার্কেল */}
                <div
                  className={`relative z-10 flex items-center justify-center w-8 h-8 rounded-full border-2 font-bold text-xs shrink-0 ${circleStyle}`}
                >
                  {isCompleted ? (
                    '✓'
                  ) : isFailed ? (
                    '✕'
                  ) : isCurrent ? (
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
                  ) : (
                    step.stepNumber || index + 1
                  )}
                </div>

                {/* ধাপের বিবরণ */}
                <div
                  className={`flex-1 pb-2 rounded-xl p-3.5 border ${
                    isCurrent
                      ? 'bg-slate-800/60 border-amber-500/40'
                      : isCompleted
                      ? 'bg-slate-950/40 border-slate-800/80'
                      : isFailed
                      ? 'bg-red-950/20 border-red-500/30'
                      : 'bg-slate-950/20 border-slate-800/40 opacity-75'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                    <h4 className="text-sm font-semibold text-white">
                      ধাপ {step.stepNumber || index + 1}: {step.title}
                    </h4>
                    {step.timestamp && (
                      <span className="text-[11px] text-slate-400 font-mono">
                        {formatDateTime(step.timestamp)}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-300 mt-1">
                    {step.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ৩. অর্ডার নোটিফিকেশন ও স্ট্যাটাস হিস্ট্রি লগ */}
      {(notifications.length > 0 || statusHistory.length > 0) && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl">
          <h4 className="text-sm font-bold text-white mb-3">
            অর্ডার আপডেট ও নোটিফিকেশন লগ
          </h4>
          <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
            {notifications.map((note) => (
              <div
                key={note.id}
                className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-amber-400">
                    {note.title}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {formatDateTime(note.createdAt)}
                  </span>
                </div>
                <p className="text-slate-300 mt-1">{note.message}</p>
              </div>
            ))}

            {notifications.length === 0 &&
              statusHistory.map((hist) => (
                <div
                  key={hist.id}
                  className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-cyan-400">
                      {hist.newOrderStatus} • {hist.newDeliveryStatus}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {formatDateTime(hist.createdAt)}
                    </span>
                  </div>
                  {hist.reason && (
                    <p className="text-slate-300 mt-1">{hist.reason}</p>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
