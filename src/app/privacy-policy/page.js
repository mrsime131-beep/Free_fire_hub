import React from "react";
import { ShieldCheck, Lock, Eye, Database, CheckCircle2 } from "lucide-react";

export default function PrivacyPolicyPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-12 space-y-8">
      {/* Header */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 px-4 py-1.5 rounded-full text-emerald-400 text-xs font-bold uppercase tracking-wider">
          <ShieldCheck className="w-4 h-4" /> Data Protection & Security
        </div>
        <h1 className="text-3xl sm:text-5xl font-black text-white uppercase tracking-tight">
          Privacy <span className="text-emerald-400">Policy</span>
        </h1>
        <p className="text-xs sm:text-sm text-slate-400">
          Last Updated: November 2026 • FREE FIRE HUB Bangladesh
        </p>
      </div>

      {/* Main Content Card */}
      <div className="bg-gaming-card border border-gaming-border rounded-3xl p-6 md:p-10 shadow-glass-card space-y-8 text-slate-300 text-sm leading-relaxed">
        {/* Section 1 */}
        <div className="space-y-3">
          <div className="flex items-center gap-2.5 text-white font-bold text-lg">
            <Database className="w-5 h-5 text-cyan-400" />
            <h2>1. আমরা কোন তথ্যগুলো সংগ্রহ করি? (Information We Collect)</h2>
          </div>
          <p>
            আপনি যখন আমাদের প্ল্যাটফর্ম থেকে Free Fire ডায়মন্ড টপ-আপ বা মেম্বারশিপ অর্ডার করেন, তখন অর্ডার প্রসেস করার জন্য আমরা কেবল নিচের প্রয়োজনীয় তথ্যগুলো সংগ্রহ করি:
          </p>
          <ul className="space-y-2 pl-2">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
              <span>আপনার Free Fire Player UID এবং ইন-গেম নাম (IGN)।</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
              <span>পেমেন্ট ভেরিফিকেশনের জন্য বিকাশ, নগদ বা রকেট সেন্ডার নম্বর এবং Transaction ID (TrxID)।</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
              <span>অ্যাকাউন্ট রেজিস্ট্রেশনের ক্ষেত্রে আপনার নাম, ইমেইল এবং কন্টাক্ট নম্বর।</span>
            </li>
          </ul>
        </div>

        {/* Section 2 */}
        <div className="space-y-3 border-t border-gaming-border pt-6">
          <div className="flex items-center gap-2.5 text-white font-bold text-lg">
            <Lock className="w-5 h-5 text-emerald-400" />
            <h2>2. গেম অ্যাকাউন্টের শতভাগ নিরাপত্তা (Zero Password Policy)</h2>
          </div>
          <p>
            আমরা শুধুমাত্র অফিশিয়াল Player UID-এর মাধ্যমে ডায়মন্ড টপ-আপ করি। আমরা কখনোই কোনো ইউজারের Facebook, Google, VK বা গেম অ্যাকাউন্টের লগইন পাসওয়ার্ড চাই না। আপনার গেম আইডি আমাদের কাছে ১০০% নিরাপদ।
          </p>
        </div>

        {/* Section 3 */}
        <div className="space-y-3 border-t border-gaming-border pt-6">
          <div className="flex items-center gap-2.5 text-white font-bold text-lg">
            <Eye className="w-5 h-5 text-purple-400" />
            <h2>3. তথ্যের ব্যবহার ও গোপনীয়তা (How We Use Your Data)</h2>
          </div>
          <p>
            আপনার দেওয়া তথ্য শুধুমাত্র আপনার ডায়মন্ড ডেলিভারি নিশ্চিত করতে, অর্ডার ট্র্যাকিং সহজ করতে এবং যেকোনো পেমেন্ট সমস্যার সমাধানে কাস্টমার সাপোর্ট দেওয়ার কাজে ব্যবহৃত হয়। আমরা কোনো তৃতীয় পক্ষের (Third-Party) কাছে আপনার ব্যক্তিগত তথ্য বিক্রি বা শেয়ার করি না।
          </p>
        </div>

        {/* Section 4 */}
        <div className="space-y-3 border-t border-gaming-border pt-6">
          <h2 className="text-white font-bold text-lg">4. কুকিজ এবং লোকাল স্টোরেজ (Cookies & Local Storage)</h2>
          <p>
            আপনার ব্রাউজিং অভিজ্ঞতা দ্রুত করতে এবং আপনার ডিফল্ট Player UID ও অর্ডার হিস্ট্রি মনে রাখার জন্য আমাদের ওয়েবসাইট নিরাপদ ব্রাউজার ক্যাশ বা লোকাল স্টোরেজ ব্যবহার করে। আপনি চাইলে যেকোনো সময় ব্রাউজার সেটিংস থেকে তা ক্লিয়ার করতে পারেন।
          </p>
        </div>
      </div>
    </div>
  );
}
