"use client";

import React, { useState } from "react";
import { HeadphonesIcon, MessageSquare, Phone, Clock, CheckCircle2 } from "lucide-react";
import { SUPPORT_CONTACTS } from "@/data/faqData";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export default function SupportPage() {
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({ name: "", uid: "", message: "" });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.name || !formData.message) return;
    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      setFormData({ name: "", uid: "", message: "" });
    }, 3000);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-12 space-y-12">
      {/* Header */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 px-4 py-1.5 rounded-full text-emerald-400 text-xs font-bold uppercase tracking-wider">
          <HeadphonesIcon className="w-4 h-4" /> 24/7 Customer Support Center
        </div>
        <h1 className="text-3xl sm:text-5xl font-black text-white uppercase tracking-tight">
          How Can We <span className="text-emerald-400">Help You Today?</span>
        </h1>
        <p className="text-sm text-slate-400 max-w-xl mx-auto">
          পেমেন্ট বা ডায়মন্ড ডেলিভারি নিয়ে যেকোনো সমস্যায় আমাদের সাপোর্ট টিম ২৪ ঘণ্টা আপনার সেবায় নিয়োজিত রয়েছে।
        </p>
      </div>

      {/* Support Channels Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gaming-card border border-gaming-border rounded-3xl p-6 shadow-glass-card text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
            <Phone className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">WhatsApp Support</h3>
            <p className="text-xs text-slate-400 mt-1">{SUPPORT_CONTACTS.whatsapp}</p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="w-full"
            onClick={() => window.open(`https://wa.me/${SUPPORT_CONTACTS.whatsapp}`, "_blank")}
          >
            Chat on WhatsApp
          </Button>
        </div>

        <div className="bg-gaming-card border border-gaming-border rounded-3xl p-6 shadow-glass-card text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-600/20 text-cyan-400 flex items-center justify-center mx-auto">
            <MessageSquare className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Telegram Channel</h3>
            <p className="text-xs text-slate-400 mt-1">{SUPPORT_CONTACTS.telegram}</p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="w-full"
            onClick={() => window.open(`https://t.me/FreeFireHubSupport`, "_blank")}
          >
            Join Telegram
          </Button>
        </div>

        <div className="bg-gaming-card border border-gaming-border rounded-3xl p-6 shadow-glass-card text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-purple-600/20 text-purple-400 flex items-center justify-center mx-auto">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Working Hours</h3>
            <p className="text-xs text-slate-400 mt-1">{SUPPORT_CONTACTS.workingHours}</p>
          </div>
          <span className="inline-block text-xs font-bold text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-xl border border-emerald-500/20 w-full">
            Active Now
          </span>
        </div>
      </div>

      {/* Contact Form */}
      <div className="bg-gaming-card border border-gaming-border rounded-3xl p-6 md:p-8 shadow-glass-card space-y-6">
        <div className="border-b border-gaming-border pb-4">
          <h3 className="text-lg font-bold text-white tracking-wide">Send Us a Direct Message</h3>
          <p className="text-xs text-slate-400">Our support agents will reply via email or WhatsApp within 10 minutes</p>
        </div>

        {submitted ? (
          <div className="text-center py-8 space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/40">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h4 className="text-xl font-bold text-white">মেসেজ সফলভাবে পাঠানো হয়েছে!</h4>
            <p className="text-xs text-slate-300">আমাদের সাপোর্ট টিম শীঘ্রই আপনার সাথে যোগাযোগ করবে।</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Your Name"
                required
                placeholder="e.g. Tanvir Ahmed"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
              <Input
                label="Free Fire Player UID (Optional)"
                placeholder="e.g. 1849204819"
                value={formData.uid}
                onChange={(e) => setFormData({ ...formData, uid: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold tracking-wide text-slate-300 uppercase">
                Describe Your Issue <span className="text-cyan-400">*</span>
              </label>
              <textarea
                required
                rows={4}
                placeholder="আপনার সমস্যা বিস্তারিত লিখুন (যেমন: TrxID ভুল দিয়েছি বা ডায়মন্ড জমা হয়নি)..."
                value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                className="w-full bg-[#080B14] text-white placeholder-slate-500 border border-gaming-border rounded-xl p-4 text-sm transition-all focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 outline-none resize-none"
              ></textarea>
            </div>

            <Button type="submit" variant="primary" size="lg" className="w-full">
              Submit Support Ticket
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
