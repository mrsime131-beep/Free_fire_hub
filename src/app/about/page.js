import React from "react";
import Link from "next/link";
import { Flame, ShieldCheck, Zap, Users, Award, CheckCircle2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function AboutPage() {
  const stats = [
    { label: "Active Gamers BD", value: "50,000+", icon: <Users className="w-5 h-5 text-cyan-400" /> },
    { label: "Orders Completed", value: "120,000+", icon: <CheckCircle2 className="w-5 h-5 text-emerald-400" /> },
    { label: "Avg. Delivery Time", value: "1 - 3 Mins", icon: <Zap className="w-5 h-5 text-amber-400" /> },
    { label: "Security Rating", value: "100% Safe", icon: <ShieldCheck className="w-5 h-5 text-purple-400" /> },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 py-12 space-y-12">
      {/* Hero Banner */}
      <div className="text-center space-y-4">
        <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/30 px-4 py-1.5 rounded-full text-cyan-400 text-xs font-bold uppercase tracking-wider">
          <Flame className="w-4 h-4" /> About Free Fire Hub BD
        </div>
        <h1 className="text-3xl sm:text-5xl font-black text-white uppercase tracking-tight">
          Empowering <span className="text-cyan-400">Bangladeshi Gamers</span>
        </h1>
        <p className="text-sm sm:text-base text-slate-400 max-w-2xl mx-auto leading-relaxed">
          FREE FIRE HUB হলো বাংলাদেশের সবচেয়ে বিশ্বস্ত এবং দ্রুততম ইন-গেম ডায়মন্ড টপ-আপ ও ই-স্পোর্টস টুর্নামেন্ট প্ল্যাটফর্ম। আমরা কোনো পাসওয়ার্ড ছাড়াই শুধুমাত্র Player UID-এর মাধ্যমে ১০০% নিরাপদে ডায়মন্ড ডেলিভারি দিয়ে থাকি।
        </p>
      </div>

      {/* Key Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((item, idx) => (
          <div
            key={idx}
            className="bg-gaming-card border border-gaming-border rounded-3xl p-6 text-center space-y-2 shadow-glass-card"
          >
            <div className="w-10 h-10 rounded-xl bg-[#080B14] border border-gaming-border flex items-center justify-center mx-auto">
              {item.icon}
            </div>
            <h3 className="text-2xl font-black text-white">{item.value}</h3>
            <p className="text-xs text-slate-400 font-medium">{item.label}</p>
          </div>
        ))}
      </div>

      {/* Mission & Vision Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-gaming-card border border-gaming-border rounded-3xl p-6 md:p-8 shadow-glass-card space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-600/20 text-cyan-400 flex items-center justify-center">
            <Award className="w-6 h-6" />
          </div>
          <h3 className="text-xl font-bold text-white">আমাদের লক্ষ্য (Our Mission)</h3>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            বাংলাদেশে অনেক গেমার আন্তর্জাতিক ক্রেডিট কার্ড বা পেমেন্ট মেথড না থাকার কারণে ন্যায্য মূল্যে ডায়মন্ড টপ-আপ করতে পারেন না এবং বিভিন্ন স্ক্যামারদের খপ্পরে পড়েন। আমাদের মূল লক্ষ্য হলো বিকাশ, নগদ ও রকেটের মাধ্যমে সাশ্রয়ী মূল্যে ও সম্পূর্ণ নিরাপদে প্রতিটি গেমারের কাছে তাৎক্ষণিক ডায়মন্ড পৌঁছে দেওয়া।
          </p>
        </div>

        <div className="bg-gaming-card border border-gaming-border rounded-3xl p-6 md:p-8 shadow-glass-card space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h3 className="text-xl font-bold text-white">কেন আমাদের ওপর ভরসা করবেন?</h3>
          <ul className="space-y-2.5 text-xs sm:text-sm text-slate-300">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>আমরা কখনোই আপনার ফেসবুক বা জিমেইল আইডির পাসওয়ার্ড চাই না।</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>অফিশিয়াল গ্যারেনা অনুমোদিত চ্যানেলের মাধ্যমে সরাসরি UID টপ-আপ।</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>অটোমেটেড অর্ডার ট্র্যাকিং এবং ২৪/৭ ডেডিকেটেড হোয়াটসঅ্যাপ সাপোর্ট।</span>
            </li>
          </ul>
        </div>
      </div>

      {/* CTA Banner */}
      <div className="bg-gradient-to-r from-blue-900/40 via-cyan-900/30 to-gaming-card border border-gaming-border rounded-3xl p-8 text-center space-y-4 shadow-glass-card">
        <h3 className="text-2xl font-black text-white">Ready to Top-Up Your Diamonds?</h3>
        <p className="text-xs sm:text-sm text-slate-300 max-w-lg mx-auto">
          মাত্র ১ থেকে ৩ মিনিটের মধ্যে আপনার গেম অ্যাকাউন্টে ডায়মন্ড বা মেম্বারশিপ বুঝে নিন।
        </p>
        <div className="pt-2">
          <Link href="/">
            <Button variant="primary" size="lg" icon={<ArrowRight className="w-4 h-4" />}>
              Go to Top-Up Store
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
