import React from "react";
import { FileText, AlertTriangle, RefreshCcw, ShieldAlert, CheckCircle2 } from "lucide-react";

export default function TermsConditionsPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-12 space-y-8">
      {/* Header */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/30 px-4 py-1.5 rounded-full text-cyan-400 text-xs font-bold uppercase tracking-wider">
          <FileText className="w-4 h-4" /> Legal Guidelines & Rules
        </div>
        <h1 className="text-3xl sm:text-5xl font-black text-white uppercase tracking-tight">
          Terms & <span className="text-cyan-400">Conditions</span>
        </h1>
        <p className="text-xs sm:text-sm text-slate-400">
          Effective Date: November 2026 • Please read carefully before placing an order
        </p>
      </div>

      {/* Main Content Card */}
      <div className="bg-gaming-card border border-gaming-border rounded-3xl p-6 md:p-10 shadow-glass-card space-y-8 text-slate-300 text-sm leading-relaxed">
        {/* Section 1 */}
        <div className="space-y-3">
          <div className="flex items-center gap-2.5 text-white font-bold text-lg">
            <CheckCircle2 className="w-5 h-5 text-cyan-400" />
            <h2>1. সাধারণ শর্তাবলী (General Terms)</h2>
          </div>
          <p>
            FREE FIRE HUB-এ অর্ডার করার মাধ্যমে আপনি আমাদের সমস্ত নিয়ম ও শর্তাবলী মেনে নিচ্ছেন। আমাদের প্ল্যাটফর্ম শুধুমাত্র বৈধ মাধ্যমে Free Fire Player UID-তে ডায়মন্ড ও মেম্বারশিপ টপ-আপ সেবা প্রদান করে।
          </p>
        </div>

        {/* Section 2 */}
        <div className="space-y-3 border-t border-gaming-border pt-6">
          <div className="flex items-center gap-2.5 text-white font-bold text-lg">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            <h2>2. ভুল Player UID প্রদান সংক্রান্ত নিয়ম (Incorrect UID Policy)</h2>
          </div>
          <p>
            অর্ডার সাবমিট করার আগে ইউজারকে অবশ্যই তার Free Fire Player UID এবং সার্ভার (Bangladesh/India/Singapore) সঠিকভাবে যাচাই করে নিতে হবে। ইউজার যদি ভুল UID প্রদান করে এবং আমাদের সিস্টেম থেকে সেই ভুল UID-তে ডায়মন্ড ডেলিভারি সম্পন্ন হয়ে যায়, তবে তার দায়ভার ওয়েবসাইট কর্তৃপক্ষ নেবে না এবং এক্ষেত্রে কোনো রিফান্ড বা পরিবর্তন সম্ভব নয়।
          </p>
        </div>

        {/* Section 3 */}
        <div className="space-y-3 border-t border-gaming-border pt-6">
          <div className="flex items-center gap-2.5 text-white font-bold text-lg">
            <RefreshCcw className="w-5 h-5 text-emerald-400" />
            <h2>3. রিফান্ড এবং ক্যান্সেলেশন পলিসি (Refund & Cancellation)</h2>
          </div>
          <ul className="space-y-2 pl-2">
            <li>
              • কোনো কারিগরি ত্রুটি বা সার্ভার ডাউন থাকার কারণে যদি ৩০ মিনিটের মধ্যে ডায়মন্ড ডেলিভারি না হয়, তবে ইউজার চাইলে অর্ডার ক্যান্সেল করে সম্পূর্ণ টাকা ওয়ালেটে বা বিকাশ/নগদে রিফান্ড নিতে পারবেন।
            </li>
            <li>
              • সফলভাবে ডায়মন্ড ডেলিভারি হয়ে যাওয়ার পর কোনো অবস্থাতেই অর্ডার বাতিল বা টাকা ফেরত দেওয়া হয় না।
            </li>
          </ul>
        </div>

        {/* Section 4 */}
        <div className="space-y-3 border-t border-gaming-border pt-6">
          <div className="flex items-center gap-2.5 text-white font-bold text-lg">
            <ShieldAlert className="w-5 h-5 text-red-400" />
            <h2>4. ভুয়া ট্রানজেকশন আইডি (Fake TrxID Warning)</h2>
          </div>
          <p>
            পেমেন্ট না করে ভুয়া বা ব্যবহৃত Transaction ID (TrxID) দিয়ে বারবার স্প্যাম অর্ডার করলে ইউজারের অ্যাকাউন্ট এবং আইপি (IP Address) আমাদের প্ল্যাটফর্ম থেকে স্থায়ীভাবে ব্লক করে দেওয়া হবে।
          </p>
        </div>
      </div>
    </div>
  );
}
