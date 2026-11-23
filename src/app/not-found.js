import React from "react";
import Link from "next/link";
import { Flame, Home, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12 text-center">
      <div className="max-w-md space-y-6 bg-gaming-card border border-gaming-border rounded-3xl p-8 shadow-glass-card">
        <div className="w-20 h-20 rounded-2xl bg-blue-600/20 text-cyan-400 flex items-center justify-center mx-auto shadow-neon-blue">
          <Flame className="w-10 h-10 animate-pulse" />
        </div>

        <div className="space-y-2">
          <h1 className="text-4xl font-black text-white">404</h1>
          <h2 className="text-xl font-bold text-cyan-400">Page Not Found</h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            আপনি যে পেজটি খুঁজছেন তা ডিলিট হয়ে গেছে অথবা এই নামে কোনো পেজ নেই। হোমপেজে ফিরে যান অথবা অর্ডার ট্র্যাক করুন।
          </p>
        </div>

        <div className="pt-2 flex flex-col sm:flex-row gap-3">
          <Link href="/" className="w-full">
            <Button variant="primary" size="md" className="w-full" icon={<Home className="w-4 h-4" />}>
              Go Home
            </Button>
          </Link>
          <Link href="/track-order" className="w-full">
            <Button variant="secondary" size="md" className="w-full" icon={<Search className="w-4 h-4" />}>
              Track Order
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
