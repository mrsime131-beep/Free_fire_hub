import React from "react";
import { ShieldCheck, Zap, Flame, Award, Star } from "lucide-react";

export function HeroSection() {
  return (
    <div className="relative overflow-hidden py-12 md:py-20 bg-gradient-to-b from-[#101827] to-[#080B14] border-b border-gaming-border">
      {/* Background glow circles */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center space-y-6">
        {/* Top badge */}
        <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/30 px-4 py-1.5 rounded-full text-blue-400 text-xs font-bold tracking-wider uppercase animate-bounce">
          <Flame className="w-4 h-4 text-cyan-400" /> Bangladesh #1 Trusted Diamond Top-Up Platform
        </div>

        {/* Main Heading */}
        <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-white uppercase tracking-tight max-w-4xl mx-auto leading-tight">
          Instant Free Fire <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-cyan-400">Diamond Top-Up</span> & Membership
        </h1>

        <p className="text-sm sm:text-base text-slate-400 max-w-2xl mx-auto leading-relaxed">
          বিকাশ, নগদ ও রকেটের মাধ্যমে পেমেন্ট করুন। মাত্র ১ থেকে ৩ মিনিটের মধ্যে সরাসরি আপনার গেমের Player UID-তে ডায়মন্ড বা মেম্বারশিপ পৌঁছে যাবে।
        </p>

        {/* Feature Highlights Bar */}
        <div className="pt-6 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
          <div className="bg-gaming-card/80 backdrop-blur-sm border border-gaming-border p-4 rounded-2xl flex items-center gap-3 text-left">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-white">100% Safe</p>
              <p className="text-[10px] text-slate-400">UID Top-Up Secure</p>
            </div>
          </div>

          <div className="bg-gaming-card/80 backdrop-blur-sm border border-gaming-border p-4 rounded-2xl flex items-center gap-3 text-left">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center shrink-0">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-white">1-3 Min Delivery</p>
              <p className="text-[10px] text-slate-400">Lightning Fast</p>
            </div>
          </div>

          <div className="bg-gaming-card/80 backdrop-blur-sm border border-gaming-border p-4 rounded-2xl flex items-center gap-3 text-left">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-white">Best Price BD</p>
              <p className="text-[10px] text-slate-400">Guaranteed Discount</p>
            </div>
          </div>

          <div className="bg-gaming-card/80 backdrop-blur-sm border border-gaming-border p-4 rounded-2xl flex items-center gap-3 text-left">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center shrink-0">
              <Star className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-white">24/7 Support</p>
              <p className="text-[10px] text-slate-400">Always Active Team</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
