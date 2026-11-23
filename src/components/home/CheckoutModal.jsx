"use client";

import React, { useState } from "react";
import { CheckCircle2, Copy, Zap } from "lucide-react";
import { useTopUp } from "@/context/TopUpContext";
import { formatCurrency, validateBDPhone } from "@/lib/utils";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { StatusAlert } from "@/components/ui/StatusAlert";

export function CheckoutModal() {
  const {
    isCheckoutOpen,
    setIsCheckoutOpen,
    selectedPackage,
    selectedPayment,
    placeOrder,
  } = useTopUp();

  const [senderNumber, setSenderNumber] = useState("");
  const [trxId, setTrxId] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [successOrderId, setSuccessOrderId] = useState(null);

  const handleCopyNumber = () => {
    navigator.clipboard.writeText(selectedPayment.accountNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmitOrder = (e) => {
    e.preventDefault();
    if (!validateBDPhone(senderNumber)) {
      setError("সঠিক ১১ ডিজিটের বিকাশ/নগদ সেন্ডার নাম্বার লিখুন (যেমন: 01712345678)");
      return;
    }
    if (!trxId || trxId.length < 5) {
      setError("দয়া করে সঠিক ট্রানজেকশন আইডি (TrxID) লিখুন");
      return;
    }

    setError("");
    const newId = placeOrder({ senderNumber, trxId });
    setSuccessOrderId(newId);
  };

  const handleClose = () => {
    setSuccessOrderId(null);
    setSenderNumber("");
    setTrxId("");
    setError("");
    setIsCheckoutOpen(false);
  };

  return (
    <Modal
      isOpen={isCheckoutOpen}
      onClose={handleClose}
      title={successOrderId ? "Order Placed Successfully! 🎉" : `Complete ${selectedPayment.name} Payment`}
      maxWidth="max-w-lg"
    >
      {successOrderId ? (
        <div className="space-y-6 text-center py-4">
          <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/40 shadow-neon-cyan">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h4 className="text-xl font-bold text-white">অর্ডার সফলভাবে জমা হয়েছে!</h4>
            <p className="text-sm text-slate-300">
              আপনার অর্ডার আইডি: <span className="text-cyan-400 font-mono font-bold">{successOrderId}</span>
            </p>
            <p className="text-xs text-slate-400 leading-relaxed max-w-md mx-auto">
              আমাদের পেমেন্ট ভেরিফিকেশন টিম আপনার ট্রানজেকশন চেক করছে। ১ থেকে ৩ মিনিটের মধ্যে ডায়মন্ড সরাসরি আপনার UID-তে যোগ হয়ে যাবে।
            </p>
          </div>

          <div className="pt-4 flex gap-3">
            <Button variant="secondary" size="md" className="w-full" onClick={handleClose}>
              Close
            </Button>
            <Button
              variant="primary"
              size="md"
              className="w-full"
              onClick={() => {
                window.location.href = "/track-order";
              }}
            >
              Track Order Status
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmitOrder} className="space-y-5">
          {/* Payment Instructions Banner */}
          <div className="p-4 rounded-2xl bg-slate-900 border border-gaming-border space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 uppercase font-semibold">
                {selectedPayment.name} {selectedPayment.accountType} Number
              </span>
              <span className="text-xs text-cyan-400 font-bold">{selectedPayment.dialCode}</span>
            </div>

            <div className="flex items-center justify-between bg-[#080B14] p-3 rounded-xl border border-gaming-border">
              <span className="text-lg font-black text-white font-mono tracking-wider">
                {selectedPayment.accountNumber}
              </span>
              <button
                type="button"
                onClick={handleCopyNumber}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/40 text-cyan-400 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" /> {copied ? "Copied!" : "Copy Number"}
              </button>
            </div>

            <div className="space-y-1.5 pt-1">
              <p className="text-xs font-bold text-amber-400">টাকার পরিমাণ: {formatCurrency(selectedPackage.price)}</p>
              <ul className="text-[11px] text-slate-300 space-y-1 list-disc list-inside">
                {selectedPayment.instructions.map((inst, idx) => (
                  <li key={idx}>{inst}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* User Confirmation Inputs */}
          <div className="space-y-4">
            <Input
              label={`Your ${selectedPayment.name} Sender Number`}
              required
              placeholder="e.g. 01712345678"
              value={senderNumber}
              onChange={(e) => setSenderNumber(e.target.value)}
            />

            <Input
              label="Transaction ID (TrxID)"
              required
              placeholder="e.g. BK94K2L8M1"
              value={trxId}
              onChange={(e) => setTrxId(e.target.value.toUpperCase())}
            />
          </div>

          {error && <StatusAlert type="error" message={error} />}

          {/* Summary Footer */}
          <div className="pt-2 flex items-center justify-between border-t border-gaming-border">
            <div>
              <p className="text-xs text-slate-400">Total Payable</p>
              <p className="text-lg font-black text-white">{formatCurrency(selectedPackage.price)}</p>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" size="md" onClick={handleClose}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="md" icon={<Zap className="w-4 h-4" />}>
                Confirm Order
              </Button>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}
