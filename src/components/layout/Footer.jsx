import React from "react";
import Link from "next/link";
import { Flame, ShieldCheck, Zap, Heart } from "lucide-react";

export function Footer() {
  return (
    <footer className="bg-gaming-card border-t border-gaming-border pt-16 pb-12 text-slate-400">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 pb-12 border-b border-gaming-border">
          {/* Brand Info */}
          <div className="lg:col-span-2 space-y-4">
            <Link href="/" className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-400 flex items-center justify-center shadow-neon-blue">
                <Flame className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-black text-white uppercase tracking-wider">
                FREE FIRE <span className="text-cyan-400">HUB</span>
              </span>
            </Link>
            <p className="text-sm leading-relaxed pr-4">
              Bangladesh-এর সবচেয়ে বিশ্বস্ত, দ্রুততম এবং নিরাপদ Free Fire Diamond Top-Up প্ল্যাটফর্ম। ১ থেকে ৩ মিনিটের মধ্যে সরাসরি UID-তে ডায়মন্ড ডেলিভারি।
            </p>
            <div className="flex items-center gap-4 pt-2">
              <div className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/20">
                <ShieldCheck className="w-4 h-4" /> 100% Secure UID Top-Up
              </div>
              <div className="flex items-center gap-1.5 text-xs text-cyan-400 bg-cyan-500/10 px-3 py-1.5 rounded-lg border border-cyan-500/20">
                <Zap className="w-4 h-4" /> Instant Delivery
              </div>
            </div>
          </div>

          {/* Quick Links */}
          <div className="space-y-4">
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">Quick Links</h4>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link href="/" className="hover:text-cyan-400 transition-colors">Home Top-Up</Link>
              </li>
              <li>
                <Link href="/track-order" className="hover:text-cyan-400 transition-colors">Track Order</Link>
              </li>
              <li>
                <Link href="/gaming-zone" className="hover:text-cyan-400 transition-colors">Gaming Zone & Quiz</Link>
              </li>
              <li>
                <Link href="/tournaments" className="hover:text-cyan-400 transition-colors">Custom Tournaments</Link>
              </li>
            </ul>
          </div>

          {/* Customer Support */}
          <div className="space-y-4">
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">Support Center</h4>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link href="/support" className="hover:text-cyan-400 transition-colors">Help & FAQ</Link>
              </li>
              <li>
                <Link href="/contact" className="hover:text-cyan-400 transition-colors">Contact Us</Link>
              </li>
              <li>
                <Link href="/about" className="hover:text-cyan-400 transition-colors">About Us</Link>
              </li>
              <li>
                <span className="text-xs text-emerald-400 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> 24/7 Live Support Active
                </span>
              </li>
            </ul>
          </div>

          {/* Legal Pages */}
          <div className="space-y-4">
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">Legal & Policy</h4>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link href="/privacy-policy" className="hover:text-cyan-400 transition-colors">Privacy Policy</Link>
              </li>
              <li>
                <Link href="/terms-conditions" className="hover:text-cyan-400 transition-colors">Terms & Conditions</Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Copyright */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-4">
          <p>© {new Date().getFullYear()} FREE FIRE HUB. All rights reserved. Not affiliated with Garena Free Fire.</p>
          <p className="flex items-center gap-1">
            Crafted with <Heart className="w-3.5 h-3.5 text-red-500 fill-red-500" /> for Bangladeshi Gamers
          </p>
        </div>
      </div>
    </footer>
  );
}
