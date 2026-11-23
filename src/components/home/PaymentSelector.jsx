"use client";

import React from "react";
import { Check } from "lucide-react";
import { useTopUp } from "@/context/TopUpContext";
import { PAYMENT_METHODS } from "@/data/paymentMethodsData";
import { Badge } from "@/components/ui/Badge";

export function PaymentSelector() {
  const { selectedPayment, setSelectedPayment } = useTopUp();

  return (
    <div className="bg-gaming-card border border-gaming-border rounded-3xl p-6 md:p-8 shadow-glass-card space-y-6">
      <div className="flex items-center justify-between border-b border-gaming-border pb-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-blue-600/20 text-cyan-400 flex items-center justify-center font-bold text-sm">
            3
          </div>
          <h3 className="text-lg font-bold text-white tracking-wide">
            Select Payment Method
          </h3>
        </div>
        <span className="text-xs text-cyan-400 font-semibold bg-cyan-500/10 px-3 py-1 rounded-full border border-cyan-500/20">
          Step 3 of 3
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {PAYMENT_METHODS.map((method) => {
          const isSelected = selectedPayment.id === method.id;
          return (
            <div
              key={method.id}
              onClick={() => setSelectedPayment(method)}
              className={`relative rounded-2xl p-5 border transition-all duration-300 cursor-pointer flex flex-col justify-between ${
                isSelected
                  ? "bg-gradient-to-b from-blue-900/40 to-slate-900/80 border-cyan-400 shadow-neon-cyan ring-1 ring-cyan-400"
                  : "bg-[#080B14]/80 border-gaming-border hover:border-slate-700 hover:bg-slate-900/50"
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-base shadow-md"
                    style={{ backgroundColor: method.themeColor }}
                  >
                    {method.name.charAt(0)}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">{method.name}</h4>
                    <p className="text-[11px] text-slate-400">{method.subtitle}</p>
                  </div>
                </div>

                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center border transition-all ${
                    isSelected
                      ? "bg-cyan-500 border-cyan-400 text-gaming-bg shadow-neon-cyan"
                      : "border-slate-700 text-transparent"
                  }`}
                >
                  <Check className="w-3 h-3 stroke-[3]" />
                </div>
              </div>

              <div className="pt-3 mt-3 border-t border-gaming-border/60 flex items-center justify-between text-xs">
                <span className="text-slate-400">{method.accountType}</span>
                <Badge variant="cyan">{method.badge}</Badge>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
