import React from "react";
import { HeroSection } from "@/components/home/HeroSection";
import { PlayerInfoForm } from "@/components/home/PlayerInfoForm";
import { PackageGrid } from "@/components/home/PackageGrid";
import { PaymentSelector } from "@/components/home/PaymentSelector";
import { OrderSummary } from "@/components/home/OrderSummary";
import { FaqSection } from "@/components/home/FaqSection";
import { CheckoutModal } from "@/components/home/CheckoutModal";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gaming-bg text-white pb-20">
      {/* Hero Promotional Banner */}
      <HeroSection />

      {/* Main Top-Up Container & Checkout Flow */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left / Main Column: Steps (UID -> Packages -> Payment -> FAQ) */}
          <div className="lg:col-span-2 space-y-8">
            <PlayerInfoForm />
            <PackageGrid />
            <PaymentSelector />
            <FaqSection />
          </div>

          {/* Right Column: Sticky Order Summary */}
          <div className="lg:col-span-1">
            <OrderSummary />
          </div>
        </div>
      </section>

      {/* Checkout Modal Popup */}
      <CheckoutModal />
    </div>
  );
}
