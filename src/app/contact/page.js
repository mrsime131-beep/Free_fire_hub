"use client";

import React, { useState } from "react";
import { Mail, Phone, MapPin, MessageSquare, Send, CheckCircle2, Clock } from "lucide-react";
import { SUPPORT_CONTACTS } from "@/data/faqData";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export default function ContactPage() {
  const [sent, setSent] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.message) return;
    setSent(true);
    setTimeout(() => {
      setSent(false);
      setForm({ name: "", email: "", subject: "", message: "" });
    }, 3000);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-12 space-y-12">
      {/* Header */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 bg-cyan-500/10 border border-cyan-500/30 px-4 py-1.5 rounded-full text-cyan-400 text-xs font-bold uppercase tracking-wider">
          <Mail className="w-4 h-4" /> Get In Touch With Us
        </div>
        <h1 className="text-3xl sm:text-5xl font-black text-white uppercase tracking-tight">
          Contact <span className="text-cyan-400">Free Fire Hub</span>
        </h1>
        <p className="text-sm text-slate-400 max-w-xl mx-auto">
          যেকোনো অর্ডার সংক্রান্ত সহায়তা, পার্টনারশিপ বা টুর্নামেন্ট স্পন্সরশিপের জন্য আমাদের সাথে সরাসরি যোগাযোগ করুন।
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Contact Info Cards */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-gaming-card border border-gaming-border rounded-3xl p-6 shadow-glass-card space-y-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Phone className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white">WhatsApp & Helpline</h3>
            <p className="text-xs text-slate-400">Instant support for diamond top-up issues</p>
            <p className="text-sm font-bold text-emerald-400 font-mono">{SUPPORT_CONTACTS.whatsapp}</p>
          </div>

          <div className="bg-gaming-card border border-gaming-border rounded-3xl p-6 shadow-glass-card space-y-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 text-cyan-400 flex items-center justify-center">
              <Mail className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white">Official Email</h3>
            <p className="text-xs text-slate-400">For business inquiries & sponsorship</p>
            <p className="text-sm font-bold text-cyan-400">{SUPPORT_CONTACTS.email}</p>
          </div>

          <div className="bg-gaming-card border border-gaming-border rounded-3xl p-6 shadow-glass-card space-y-3">
            <div className="w-10 h-10 rounded-xl bg-purple-600/20 text-purple-400 flex items-center justify-center">
              <MapPin className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white">Office Location</h3>
            <p className="text-xs text-slate-400">Mirpur DOHS, Dhaka-1216, Bangladesh</p>
            <p className="text-xs text-emerald-400 flex items-center gap-1 font-semibold pt-1">
              <Clock className="w-3.5 h-3.5" /> {SUPPORT_CONTACTS.workingHours}
            </p>
          </div>
        </div>

        {/* Right Contact Form */}
        <div className="lg:col-span-2 bg-gaming-card border border-gaming-border rounded-3xl p-6 md:p-8 shadow-glass-card space-y-6">
          <div className="border-b border-gaming-border pb-4">
            <h3 className="text-xl font-bold text-white">Send Us a Message</h3>
            <p className="text-xs text-slate-400 mt-1">
              নিচের ফর্মটি পূরণ করে মেসেজ পাঠান, আমাদের টিম দ্রুত আপনার ইমেইলে উত্তর দেবে।
            </p>
          </div>

          {sent ? (
            <div className="text-center py-12 space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/40">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h4 className="text-xl font-bold text-white">Thank You for Contacting Us!</h4>
              <p className="text-xs text-slate-300 max-w-md mx-auto">
                আপনার মেসেজটি আমাদের কাছে পৌঁছেছে। খুব শীঘ্রই আমাদের প্রতিনিধি আপনার সাথে যোগাযোগ করবেন।
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Your Full Name"
                  required
                  placeholder="e.g. Tahmid Hasan"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
                <Input
                  label="Your Email Address"
                  type="email"
                  required
                  placeholder="gamer@gmail.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>

              <Input
                label="Subject"
                required
                placeholder="e.g. Order Delay / Business Inquiry"
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
              />

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold tracking-wide text-slate-300 uppercase">
                  Message <span className="text-cyan-400">*</span>
                </label>
                <textarea
                  required
                  rows={5}
                  placeholder="Write your detailed message here..."
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  className="w-full bg-[#080B14] text-white placeholder-slate-500 border border-gaming-border rounded-xl p-4 text-sm transition-all focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 outline-none resize-none"
                ></textarea>
              </div>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full shadow-neon-cyan"
                icon={<Send className="w-4 h-4" />}
              >
                Send Message
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
