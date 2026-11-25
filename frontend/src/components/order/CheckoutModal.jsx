'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  fetchProducts,
  verifyPlayerUid,
  fetchPaymentInstructions,
  createOrder,
  submitOrderPayment,
  generateIdempotencyKey,
} from '../../lib/orderApi';
import OrderTimeline from './OrderTimeline';

const DEFAULT_PAYMENT_METHODS = [
  {
    code: 'BKASH',
    name: 'bKash (Send Money)',
    accountNumber: '01623759878',
    accountType: 'Personal',
    badgeColor: 'from-pink-600 to-rose-600',
    instructions: [
      'আপনার বিকাশ অ্যাপ বা *247# থেকে Send Money অপশনে যান।',
      'প্রাপক নাম্বার হিসেবে 01623759878 দিন এবং নির্ধারিত টাকার পরিমাণ পাঠান।',
      'পেমেন্ট সম্পন্ন হলে ফিরতি মেসেজ থেকে পাওয়া TrxID এবং আপনার বিকাশ নাম্বার নিচে লিখুন।',
    ],
  },
  {
    code: 'NAGAD',
    name: 'Nagad (Send Money)',
    accountNumber: '01623759878',
    accountType: 'Personal',
    badgeColor: 'from-orange-500 to-red-600',
    instructions: [
      'আপনার নগদ অ্যাপ বা *167# থেকে Send Money অপশনে যান।',
      'প্রাপক নাম্বার হিসেবে 01623759878 দিন এবং নির্ধারিত টাকা পাঠান।',
      'পেমেন্ট সফল হলে মেসেজ থেকে পাওয়া TrxID ও আপনার নগদ নাম্বার নিচে জমা দিন।',
    ],
  },
  {
    code: 'ROCKET',
    name: 'Rocket (Send Money)',
    accountNumber: '01623759878',
    accountType: 'Personal',
    badgeColor: 'from-purple-600 to-indigo-700',
    instructions: [
      'রকেট অ্যাপ বা *322# থেকে Send Money অপশনে গিয়ে নির্ধারিত টাকা পাঠান।',
      'ট্রানজেকশন সম্পন্ন হলে TrxID এবং সেন্ডার নাম্বার নিচে জমা দিন।',
    ],
  },
];

/**
 * স্মার্ট চেকআউট কম্পোনেন্ট (পপআপ মডাল অথবা সরাসরি পেজের ভেতরে উভয়ভাবেই ব্যবহারযোগ্য)
 */
export default function CheckoutModal({
  isOpen = true,
  onClose = null,
  selectedProduct = null,
  initialPlayerUid = '',
  initialVerifiedName = '',
  isModal = false,
  onOrderSuccess = null,
}) {
  // ১. প্রোডাক্ট ও পেমেন্ট মেথড স্টেট
  const [products, setProducts] = useState([]);
  const [activeProduct, setActiveProduct] = useState(selectedProduct);
  const [paymentInfo, setPaymentInfo] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('BKASH');

  // ২. প্লেয়ার ইউআইডি ভেরিফিকেশন স্টেট
  const [playerUid, setPlayerUid] = useState(initialPlayerUid || '');
  const [gameServer, setGameServer] = useState('BD');
  const [verifiedPlayerName, setVerifiedPlayerName] = useState(
    initialVerifiedName || ''
  );
  const [isVerifyingUid, setIsVerifyingUid] = useState(false);
  const [uidError, setUidError] = useState('');

  // ৩. পেমেন্ট ও কাস্টমার ইনপুট স্টেট
  const [senderNumber, setSenderNumber] = useState('');
  const [transactionReference, setTransactionReference] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [copiedAccount, setCopiedAccount] = useState(false);

  // ৪. অর্ডার সাবমিশন ও ইডেমপোটেন্সি স্টেট
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    generateIdempotencyKey('CREATE_ORD')
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [createdOrderData, setCreatedOrderData] = useState(null);

  // প্রপস থেকে প্রোডাক্ট পরিবর্তন হলে সিঙ্ক করা
  useEffect(() => {
    if (selectedProduct) {
      setActiveProduct(selectedProduct);
    }
  }, [selectedProduct]);

  // ব্যাকএন্ড থেকে প্রোডাক্ট ও পেমেন্ট নির্দেশনা লোড করা
  useEffect(() => {
    let isMounted = true;

    const loadInitialData = async () => {
      try {
        const [prodRes, payRes] = await Promise.allSettled([
          !selectedProduct ? fetchProducts() : Promise.resolve(null),
          fetchPaymentInstructions(),
        ]);

        if (!isMounted) return;

        if (
          prodRes.status === 'fulfilled' &&
          prodRes.value?.products?.length > 0
        ) {
          setProducts(prodRes.value.products);
          if (!selectedProduct) {
            setActiveProduct(prodRes.value.products[0]);
          }
        }

        if (payRes.status === 'fulfilled' && payRes.value?.data) {
          setPaymentInfo(payRes.value.data);
        }
      } catch (e) {
        // ব্যাকএন্ড স্লিপ মোডে থাকলেও ডিফল্ট পেমেন্ট মেথড দিয়ে UI সচল থাকবে
      }
    };

    if (isOpen) {
      loadInitialData();
    }

    return () => {
      isMounted = false;
    };
  }, [isOpen, selectedProduct]);

  // বর্তমান সিলেক্টেড পেমেন্ট মেথডের তথ্য বের করা
  const activeMethodConfig = useMemo(() => {
    const backendMethods = paymentInfo?.methods || [];
    const foundBackend = backendMethods.find((m) => m.code === paymentMethod);
    const foundDefault = DEFAULT_PAYMENT_METHODS.find(
      (m) => m.code === paymentMethod
    );

    return {
      ...(foundDefault || DEFAULT_PAYMENT_METHODS[0]),
      ...(foundBackend || {}),
    };
  }, [paymentInfo, paymentMethod]);

  if (isModal && !isOpen) {
    return null;
  }

  // Player UID পরিবর্তন হলে আগের ভেরিফাইড নাম রিসেট করা (নিরাপত্তা নিয়ম)
  const handleUidChange = (e) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 15);
    setPlayerUid(val);
    setVerifiedPlayerName('');
    setUidError('');
  };

  // ১. ফ্রি ফায়ার Player UID যাচাই হ্যান্ডলার
  const handleVerifyUid = async () => {
    const cleanUid = String(playerUid).trim();
    if (!/^\d{5,15}$/.test(cleanUid)) {
      setUidError('অনুগ্রহ করে ৫ থেকে ১৫ সংখ্যার সঠিক ফ্রি ফায়ার UID লিখুন।');
      return;
    }

    setIsVerifyingUid(true);
    setUidError('');

    try {
      const res = await verifyPlayerUid(cleanUid, gameServer);
      const resolvedName =
        res?.verifiedPlayerName ||
        res?.playerName ||
        res?.data?.verifiedPlayerName;

      if (resolvedName) {
        setVerifiedPlayerName(resolvedName);
      } else {
        setUidError('প্লেয়ার আইডি যাচাই করা যায়নি। আবার চেষ্টা করুন।');
      }
    } catch (err) {
      setUidError(
        err.message || 'Player UID যাচাই করতে সমস্যা হয়েছে। সঠিক UID দিন।'
      );
    } finally {
      setIsVerifyingUid(false);
    }
  };

  // পেমেন্ট নাম্বার কপি হ্যান্ডলার
  const handleCopyNumber = (num) => {
    if (!num || typeof navigator === 'undefined') return;
    navigator.clipboard.writeText(String(num));
    setCopiedAccount(true);
    setTimeout(() => setCopiedAccount(false), 2000);
  };

  // ২. অর্ডার ও পেমেন্ট সাবমিশন হ্যান্ডলার
  const handlePlaceOrder = async (e) => {
    e.preventDefault();
    setSubmitError('');

    if (!activeProduct) {
      setSubmitError('অনুগ্রহ করে একটি ডায়মন্ড প্যাকেজ নির্বাচন করুন।');
      return;
    }

    if (!/^\d{5,15}$/.test(String(playerUid).trim())) {
      setSubmitError('অনুগ্রহ করে সঠিক ফ্রি ফায়ার Player UID দিন।');
      return;
    }

    if (!verifiedPlayerName) {
      setSubmitError(
        'অর্ডার করার পূর্বে "UID যাচাই করুন" বাটনে ক্লিক করে আপনার ফ্রি ফায়ার নাম নিশ্চিত করুন।'
      );
      return;
    }

    const cleanSender = String(senderNumber).trim();
    if (!/^01[3-9]\d{8}$/.test(cleanSender)) {
      setSubmitError(
        'যে নাম্বার থেকে টাকা পাঠিয়েছেন সেই ১১ সংখ্যার সঠিক মোবাইল নাম্বার দিন (যেমন: 017XXXXXXXX)।'
      );
      return;
    }

    const cleanTrx = String(transactionReference).trim().toUpperCase();
    if (!/^[A-Z0-9]{6,20}$/.test(cleanTrx)) {
      setSubmitError(
        'অনুগ্রহ করে ৬ থেকে ২০ অক্ষরের সঠিক Transaction ID (TrxID) লিখুন।'
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const payableAmount = Number(
        activeProduct.finalPayableAmount ?? activeProduct.unitPrice ?? 0
      );

      const orderPayload = {
        playerUid: String(playerUid).trim(),
        verifiedPlayerName: String(verifiedPlayerName).trim(),
        gameServer,
        productId: activeProduct.id || activeProduct.slug || activeProduct.sku,
        paymentMethod,
        senderNumber: cleanSender,
        transactionReference: cleanTrx,
        customerPhone: customerPhone.trim() || cleanSender,
        price: payableAmount,
        notes: notes.trim() || undefined,
      };

      const result = await createOrder(orderPayload, idempotencyKey);

      setCreatedOrderData({
        order: result.order || result.data?.order,
        timeline: result.timeline || result.data?.timeline,
      });

      if (onOrderSuccess) {
        onOrderSuccess(result);
      }
    } catch (err) {
      setSubmitError(
        err.message ||
          'অর্ডার সাবমিট করতে সমস্যা হয়েছে। অনুগ্রহ করে তথ্যগুলো যাচাই করে আবার চেষ্টা করুন।'
      );
      // যদি ভ্যালিডেশন এরর হয় (৪00/৪0৯), তবে নতুন চেষ্টার জন্য নতুন ইডেমপোটেন্সি কী তৈরি করা
      if (err.status === 400 || err.status === 409) {
        setIdempotencyKey(generateIdempotencyKey('CREATE_ORD'));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // নতুন আরেকটি অর্ডার করার জন্য ফর্ম রিসেট
  const handleResetCheckout = () => {
    setCreatedOrderData(null);
    setTransactionReference('');
    setNotes('');
    setSubmitError('');
    setIdempotencyKey(generateIdempotencyKey('CREATE_ORD'));
  };

  const payableAmount = Number(
    activeProduct?.finalPayableAmount ?? activeProduct?.unitPrice ?? 0
  );
  const diamondQty = Number(
    activeProduct?.diamondQuantity ??
      Number(activeProduct?.baseDiamonds || 0) +
        Number(activeProduct?.bonusDiamonds || 0)
  );

  const content = (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden text-slate-100">
      {/* টপ হেডার */}
      <div className="flex items-center justify-between px-5 sm:px-6 py-4 bg-slate-950/80 border-b border-slate-800">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
            <span>💎</span>
            <span>স্মার্ট ডায়মন্ড টপ-আপ চেকআউট</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            তাৎক্ষণিক ভেরিফিকেশন ও স্বয়ংক্রিয় ডায়মন্ড ডেলিভারি সিস্টেম
          </p>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition"
            aria-label="Close checkout"
          >
            ✕
          </button>
        )}
      </div>

      {/* বডি কন্টেন্ট */}
      <div className="p-5 sm:p-6">
        {createdOrderData?.order ? (
          /* অর্ডার সফল হওয়ার পরের কনফার্মেশন ও ৫-ধাপের লাইভ টাইমলাইন ভিউ */
          <div className="space-y-6">
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-emerald-400">
                  ✓ আপনার অর্ডার ও পেমেন্ট তথ্য সফলভাবে জমা হয়েছে!
                </h3>
                <p className="text-xs text-slate-300 mt-1">
                  অ্যাডমিন আপনার TrxID যাচাই করার সাথে সাথেই স্বয়ংক্রিয়ভাবে আপনার ফ্রি ফায়ার অ্যাকাউন্টে ডায়মন্ড পৌঁছে যাবে।
                </p>
              </div>
              <div className="flex items-center gap-2.5 shrink-0">
                <Link
                  href={`/track?orderId=${encodeURIComponent(
                    createdOrderData.order.orderNumber
                  )}`}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition"
                >
                  লাইভ ট্র্যাকিং পেজে যান →
                </Link>
                <button
                  type="button"
                  onClick={handleResetCheckout}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                >
                  নতুন অর্ডার
                </button>
              </div>
            </div>

            <OrderTimeline
              order={createdOrderData.order}
              timeline={createdOrderData.timeline}
            />
          </div>
        ) : (
          /* চেকআউট ফর্ম */
          <form onSubmit={handlePlaceOrder} className="space-y-6">
            {/* ধাপ ১: ডায়মন্ড প্যাকেজ নির্বাচন বা সারাংশ */}
            <div className="space-y-3">
              <label className="block text-xs font-bold uppercase tracking-wider text-amber-400">
                ধাপ ১: ডায়মন্ড প্যাকেজ
              </label>

              {products.length > 0 && !selectedProduct && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {products.map((pkg) => {
                    const isSelected = activeProduct?.id === pkg.id;
                    const price = Number(
                      pkg.finalPayableAmount ?? pkg.unitPrice ?? 0
                    );
                    return (
                      <button
                        key={pkg.id}
                        type="button"
                        onClick={() => setActiveProduct(pkg)}
                        className={`p-3 rounded-xl border text-left transition ${
                          isSelected
                            ? 'bg-amber-500/15 border-amber-400 ring-2 ring-amber-400/20'
                            : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <p className="text-xs font-bold text-white truncate">
                          {pkg.name}
                        </p>
                        <p className="text-xs text-amber-400 font-semibold mt-0.5">
                          💎 {pkg.diamondQuantity} Diamonds
                        </p>
                        <p className="text-sm font-extrabold text-emerald-400 mt-1">
                          ৳{price}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}

              {activeProduct && (
                <div className="flex items-center justify-between p-4 rounded-xl bg-slate-950/80 border border-slate-800">
                  <div>
                    <p className="text-sm font-bold text-white">
                      {activeProduct.name}
                    </p>
                    <p className="text-xs text-amber-400 font-medium mt-0.5">
                      মোট ডায়মন্ড: 💎 {diamondQty} Diamonds
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-slate-400 block">
                      প্রদেয় মূল্য
                    </span>
                    <span className="text-xl font-extrabold text-emerald-400">
                      ৳{payableAmount}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* ধাপ ২: ফ্রি ফায়ার Player UID যাচাই */}
            <div className="space-y-3">
              <label className="block text-xs font-bold uppercase tracking-wider text-amber-400">
                ধাপ ২: ফ্রি ফায়ার Player UID যাচাই
              </label>

              <div className="flex flex-col sm:flex-row gap-2.5">
                <div className="flex-1">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={playerUid}
                    onChange={handleUidChange}
                    placeholder="আপনার Free Fire Player UID লিখুন (যেমন: 1829304650)"
                    className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 focus:border-amber-400 focus:outline-none text-sm text-white font-mono"
                    required
                  />
                </div>

                <select
                  value={gameServer}
                  onChange={(e) => {
                    setGameServer(e.target.value);
                    setVerifiedPlayerName('');
                  }}
                  className="px-3.5 py-3 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-200 focus:border-amber-400 focus:outline-none"
                >
                  <option value="BD">BD Server</option>
                  <option value="IND">IND Server</option>
                  <option value="SG">SG Server</option>
                </select>

                <button
                  type="button"
                  onClick={handleVerifyUid}
                  disabled={isVerifyingUid || !playerUid}
                  className="px-5 py-3 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition disabled:opacity-50 shrink-0"
                >
                  {isVerifyingUid ? 'যাচাই হচ্ছে...' : 'UID যাচাই করুন'}
                </button>
              </div>

              {uidError && (
                <p className="text-xs text-red-400 font-medium">{uidError}</p>
              )}

              {verifiedPlayerName && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs font-bold">
                      ✓
                    </span>
                    <span className="text-xs text-slate-300">
                      ভেরিফাইড প্লেয়ার নাম:
                    </span>
                    <span className="text-sm font-bold text-emerald-400 font-mono">
                      {verifiedPlayerName}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400">
                    Server: {gameServer}
                  </span>
                </div>
              )}
            </div>

            {/* ধাপ ৩: পেমেন্ট মাধ্যম নির্বাচন ও TrxID সাবমিশন */}
            <div className="space-y-4">
              <label className="block text-xs font-bold uppercase tracking-wider text-amber-400">
                ধাপ ৩: পেমেন্ট মাধ্যম ও ট্রানজেকশন তথ্য (Send Money)
              </label>

              {/* bKash / Nagad / Rocket বাটন */}
              <div className="grid grid-cols-3 gap-2.5">
                {DEFAULT_PAYMENT_METHODS.map((method) => {
                  const isSelected = paymentMethod === method.code;
                  return (
                    <button
                      key={method.code}
                      type="button"
                      onClick={() => setPaymentMethod(method.code)}
                      className={`p-3 rounded-xl border text-center transition ${
                        isSelected
                          ? 'bg-slate-800 border-amber-400 ring-2 ring-amber-400/20'
                          : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <span className="block text-sm font-extrabold text-white">
                        {method.code}
                      </span>
                      <span className="block text-[11px] text-slate-400 mt-0.5">
                        Personal
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* পেমেন্ট নাম্বার ও নির্দেশনা বক্স */}
              <div className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-slate-800">
                  <div>
                    <span className="text-xs text-slate-400 block">
                      {activeMethodConfig.name} নাম্বার (Send Money):
                    </span>
                    <span className="text-lg font-extrabold text-amber-400 font-mono">
                      {activeMethodConfig.accountNumber}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2.5 py-1 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-bold">
                      পাঠাবেন: ৳{payableAmount}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        handleCopyNumber(activeMethodConfig.accountNumber)
                      }
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                    >
                      {copiedAccount ? '✓ নাম্বার কপি হয়েছে' : 'নাম্বার কপি করুন'}
                    </button>
                  </div>
                </div>

                <ul className="space-y-1.5 text-xs text-slate-300">
                  {(activeMethodConfig.instructions || []).map((inst, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-amber-400 font-bold">•</span>
                      <span>{inst}</span>
                    </li>
                  ))}
                </ul>

                <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-[11px] text-amber-300">
                  🔒 নিরাপত্তা সতর্কবার্তা: আমরা শুধুমাত্র পেমেন্টের Transaction ID (TrxID) এবং Sender Number গ্রহণ করি। কখনোই আপনার বিকাশ/নগদ/রকেটের PIN বা OTP কারো সাথে শেয়ার করবেন না।
                </div>
              </div>

              {/* সেন্ডার নাম্বার ও TrxID ইনপুট */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs text-slate-300 mb-1.5 font-medium">
                    যে নাম্বার থেকে টাকা পাঠিয়েছেন (Sender Number) *
                  </label>
                  <input
                    type="tel"
                    value={senderNumber}
                    onChange={(e) =>
                      setSenderNumber(
                        e.target.value.replace(/\D/g, '').slice(0, 11)
                      )
                    }
                    placeholder="017XXXXXXXX"
                    className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 focus:border-amber-400 focus:outline-none text-sm text-white font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-300 mb-1.5 font-medium">
                    পেমেন্ট Transaction ID (TrxID) *
                  </label>
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
                    placeholder="যেমন: BJM89K2L1P"
                    className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 focus:border-amber-400 focus:outline-none text-sm text-amber-300 font-mono uppercase"
                    required
                  />
                </div>
              </div>
            </div>

            {/* এরর মেসেজ */}
            {submitError && (
              <div className="p-3.5 rounded-xl bg-red-500/15 border border-red-500/30 text-xs text-red-300 font-medium">
                ⚠️ {submitError}
              </div>
            )}

            {/* সাবমিট বাটন */}
            <button
              type="submit"
              disabled={isSubmitting || !activeProduct}
              className="w-full py-3.5 px-6 rounded-xl font-bold text-sm bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 shadow-lg shadow-amber-500/20 transition disabled:opacity-50"
            >
              {isSubmitting
                ? 'অর্ডার ও পেমেন্ট প্রসেস হচ্ছে...'
                : `অর্ডার কনফার্ম করুন (৳${payableAmount})`}
            </button>
          </form>
        )}
      </div>
    </div>
  );

  if (!isModal) {
    return content;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-2xl my-8">{content}</div>
    </div>
  );
}
