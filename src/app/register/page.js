"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Flame, User, Mail, Phone, Gamepad2, Lock, UserPlus } from "lucide-react";
import { useTopUp } from "@/context/TopUpContext";
import { validateBDPhone, validateUID } from "@/lib/utils";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { StatusAlert } from "@/components/ui/StatusAlert";

export default function RegisterPage() {
  const router = useRouter();
  const { setUserProfile, setIsLoggedIn, setPlayerUid } = useTopUp();

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    defaultUid: "",
    password: "",
  });
  const [error, setError] = useState("");

  const handleRegister = (e) => {
    e.preventDefault();

    if (!validateBDPhone(formData.phone)) {
      setError("দয়া করে সঠিক ১১ ডিজিটের মোবাইল নাম্বার দিন (যেমন: 01712345678)");
      return;
    }

    if (formData.defaultUid && !validateUID(formData.defaultUid)) {
      setError("দয়া করে সঠিক ৮ থেকে ১২ ডিজিটের Free Fire UID দিন।");
      return;
    }

    if (formData.password.length < 6) {
      setError("পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।");
      return;
    }

    setError("");

    const newProfile = {
      id: "USR-" + Math.floor(10000 + Math.random() * 90000),
      name: formData.name,
      email: formData.email,
      phone: formData.phone,
      defaultUid: formData.defaultUid || "1849204819",
      inGameName: formData.name.toUpperCase().replace(/\s+/g, "_") + "_BD",
      server: "BD",
      walletBalance: 50, // Welcome bonus
      rewardPoints: 100, // Signup reward points
      referralCode: "FFHUB-" + formData.name.split(" ")[0].toUpperCase() + "99",
      totalOrders: 0,
      totalSpent: 0,
      memberSince: "Just Now",
      vipTier: "Rookie Member",
    };

    setUserProfile(newProfile);
    if (formData.defaultUid) {
      setPlayerUid(formData.defaultUid);
    }
    setIsLoggedIn(true);
    router.push("/dashboard");
  };

  return (
    <div className="min-h-[85vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg bg-gaming-card border border-gaming-border rounded-3xl p-6 md:p-8 shadow-glass-card space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-400 flex items-center justify-center mx-auto shadow-neon-blue">
            <Flame className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-black text-white uppercase tracking-wide pt-2">
            Create Your <span className="text-cyan-400">Gamer Account</span>
          </h1>
          <p className="text-xs text-slate-400">
            ফ্রি অ্যাকাউন্ট খুললেই পাচ্ছেন ১০০ রিওয়ার্ড পয়েন্ট এবং ৳৫০ ওয়েলকাম ওয়ালেট বোনাস!
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleRegister} className="space-y-4">
          <Input
            label="Full Name"
            required
            placeholder="e.g. Tahmid Hasan"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            icon={<User className="w-4 h-4" />}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Email Address"
              type="email"
              required
              placeholder="gamer@gmail.com"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              icon={<Mail className="w-4 h-4" />}
            />

            <Input
              label="Mobile Number (BD)"
              required
              placeholder="01712345678"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              icon={<Phone className="w-4 h-4" />}
            />
          </div>

          <Input
            label="Free Fire Player UID (Optional)"
            placeholder="e.g. 1849204819"
            value={formData.defaultUid}
            onChange={(e) => setFormData({ ...formData, defaultUid: e.target.value })}
            icon={<Gamepad2 className="w-4 h-4" />}
          />

          <Input
            label="Create Password"
            type="password"
            required
            placeholder="Minimum 6 characters"
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            icon={<Lock className="w-4 h-4" />}
          />

          {error && <StatusAlert type="error" message={error} />}

          <div className="pt-2">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full shadow-neon-cyan"
              icon={<UserPlus className="w-4 h-4" />}
            >
              Register & Claim Bonus
            </Button>
          </div>
        </form>

        {/* Footer link */}
        <div className="pt-4 border-t border-gaming-border text-center text-xs text-slate-400">
          Already have an account?{" "}
          <Link href="/login" className="text-cyan-400 font-bold hover:underline">
            Login Here
          </Link>
        </div>
      </div>
    </div>
  );
}
