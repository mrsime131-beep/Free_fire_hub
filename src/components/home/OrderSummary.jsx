"use client";

import React from "react";
import { ShoppingCart, ShieldCheck, Zap } from "lucide-react";
import { useTopUp } from "@/context/TopUpContext";
import { formatCurrency, validateUID } from "@/lib/utils";
import { Button } from "@/components/ui/Button";

export function OrderSummary() {
  const {
    playerUid,
    playerName,
    selectedServer,
    selectedPackage,
    selectedPayment,
    setIsCheckoutOpen,
  } = useTopUp();

  const isUidValid = validateUID(playerUid);

  const handleCheckoutClick = () => {
    if (!isUidValid) {
      alert("দয়া করে প্রথমে একটি সঠিক ৮ থেকে ১২ ডিজিটের Free Fire Player UID লিখুন।");
      return;
    }
    setIsCheckoutOpen(true);
  };

  return (
    <div className="bg-gaming-card border border-gaming-border rounded-3xl p-6 md:p-8 shadow-glass-card space-y-6 sticky top-28">
      <div className="flex items-center gap-3 border-b border-gaming-border pb-4">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-400 flex items-center justify-center text-white shadow-neon-blue">
          <ShoppingCart className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-white tracking-wide">Order Summary</h3>
          <p className="text-xs text-slate-400">Review your top-up details</p>
        </div>
      </div>

      {/* Selected Items Breakdown */}
      <div className="space-y-4 text-sm">
        <div className="flex items-center justify-between py-2 border-b border-gaming-border/60">
          <span className="text-slate-400">Player UID</span>
          <span className="font-bold text-white font-mono">{playerUid || "Not Provided"}</span>
        </div>

        <div className="flex items-center justify-between py-2 border-b border-gaming-border/60">
          <span className="text-slate-400">In-Game Name</span>
          <span className="font-bold text-cyan-400">{playerName || "TH_SNIPER_BD"}</span>
        </div>

        <div className="flex items-center justify-between py-2 border-b border-gaming-border/60">
          <span className="text-slate-400">Game Server</span>
          <span className="font-bold text-white flex items-center gap-1.5">
            <span>{selectedServer.flag}</span> {selectedServer.name}
          </span>
        </div>

        <div className="flex items-center justify-between py-2 border-b border-gaming-border/60">
          <span className="text-slate-400">Selected Package</span>
          <span className="font-bold text-white text-right">{selectedPackage.title}</span>
        </div>

        <div className="flex items-center justify-between py-2 border-b border-gaming-border/60">
          <span className="text-slate-400">Payment Method</span>
          <span className="font-bold text-white flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: selectedPayment.themeColor }}
            ></span>
            {selectedPayment.name} ({selectedPayment.accountType})
          </span>
        </div>
      </div>

      {/* Total Amount Calculation */}
      <div className="p-4 rounded-2xl bg-[#080B14] border border-gaming-border space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>Subtotal</span>
          <span>{formatCurrency(selectedPackage.price)}</span>
        </div>
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>Gateway Fee</span>
          <span className="text-emerald-400 font-semibold">FREE (0%)</span>
        </div>
        <div className="pt-2 border-t border-gaming-border flex items-center justify-between">
          <span className="text-sm font-bold text-white">Total Payable</span>
          <span className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">
            {formatCurrency(selectedPackage.price)}
          </span>
        </div>
      </div>

      {/* Checkout Button */}
      <Button
        variant="primary"
        size="lg"
        className="w-full shadow-neon-cyan"
        onClick={handleCheckoutClick}
        disabled={!isUidValid}
        icon={<Zap className="w-5 h-5 text-cyan-300" />}
      >
        Proceed to Checkout
      </Button>

      {/* Secure Guarantee */}
      <div className="flex items-center justify-center gap-2 text-xs text-slate-400 pt-1">
        <ShieldCheck className="w-4 h-4 text-emerald-400" />
        <span>Encrypted & Safe UID Top-Up</span>
      </div>
    </div>
  );
}
