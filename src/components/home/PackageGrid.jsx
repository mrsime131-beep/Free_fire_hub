"use client";

import React, { useState } from "react";
import { Check } from "lucide-react";
import { useTopUp } from "@/context/TopUpContext";
import { DIAMOND_PACKAGES, PACKAGE_CATEGORIES } from "@/data/packagesData";
import { formatCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";

export function PackageGrid() {
  const { selectedPackage, setSelectedPackage } = useTopUp();
  const [activeCategory, setActiveCategory] = useState("all");

  const filteredPackages = DIAMOND_PACKAGES.filter((pkg) => {
    if (activeCategory === "all") return true;
    return pkg.category === activeCategory;
  });

  return (
    <div className="bg-gaming-card border border-gaming-border rounded-3xl p-6 md:p-8 shadow-glass-card space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gaming-border pb-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-blue-600/20 text-cyan-400 flex items-center justify-center font-bold text-sm">
            2
          </div>
          <h3 className="text-lg font-bold text-white tracking-wide">
            Select Diamond Package or Membership
          </h3>
        </div>

        {/* Category Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 md:pb-0">
          {PACKAGE_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                activeCategory === cat.id
                  ? "bg-cyan-500 text-gaming-bg shadow-neon-cyan"
                  : "bg-[#080B14] text-slate-400 hover:text-white border border-gaming-border"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Packages Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredPackages.map((pkg) => {
          const isSelected = selectedPackage.id === pkg.id;
          return (
            <div
              key={pkg.id}
              onClick={() => setSelectedPackage(pkg)}
              className={`relative rounded-2xl p-5 border transition-all duration-300 cursor-pointer flex flex-col justify-between ${
                isSelected
                  ? "bg-gradient-to-b from-blue-900/40 to-slate-900/80 border-cyan-400 shadow-neon-cyan ring-1 ring-cyan-400"
                  : "bg-[#080B14]/80 border-gaming-border hover:border-slate-700 hover:bg-slate-900/50"
              }`}
            >
              {/* Top Badge */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600/30 to-cyan-400/30 flex items-center justify-center text-cyan-400 font-bold text-base border border-cyan-500/20">
                    💎
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white leading-tight">
                      {pkg.title}
                    </h4>
                    {pkg.subtitle && (
                      <p className="text-[11px] text-slate-400">{pkg.subtitle}</p>
                    )}
                  </div>
                </div>

                {pkg.badge && (
                  <Badge variant={pkg.popular ? "cyan" : "blue"}>
                    {pkg.badge}
                  </Badge>
                )}
              </div>

              {/* Price & Selection Footer */}
              <div className="pt-4 mt-4 border-t border-gaming-border/60 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-black text-white">
                      {formatCurrency(pkg.price)}
                    </span>
                    {pkg.originalPrice && (
                      <span className="text-xs text-slate-500 line-through">
                        {formatCurrency(pkg.originalPrice)}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-emerald-400 font-medium">
                    {pkg.deliveryType}
                  </p>
                </div>

                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center border transition-all ${
                    isSelected
                      ? "bg-cyan-500 border-cyan-400 text-gaming-bg shadow-neon-cyan"
                      : "border-slate-700 text-transparent"
                  }`}
                >
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
