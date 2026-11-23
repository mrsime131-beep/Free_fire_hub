"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Flame, Mail, Lock, ArrowRight } from "lucide-react";
import { useTopUp } from "@/context/TopUpContext";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { StatusAlert } from "@/components/ui/StatusAlert";

export default function LoginPage() {
  const router = useRouter();
  const { setIsLoggedIn } = useTopUp();
  const [email, setEmail] = useState("tahmid.gamer@gmail.com");
  const [password, setPassword] = useState("12345678");
  const [error, setError] = useState("");

  const handleLogin = (e) => {
    e.preventDefault();
    if (!email || !password) {
      setError("দয়া করে আপনার ইমেইল এবং পাসওয়ার্ড সঠিকভাবে লিখুন।");
      return;
    }

    setError("");
    setIsLoggedIn(true);
    router.push("/dashboard");
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md bg-gaming-card border border-gaming-border rounded-3xl p-6 md:p-8 shadow-glass-card space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-400 flex items-center justify-center mx-auto shadow-neon-blue">
            <Flame className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-black text-white uppercase tracking-wide pt-2">
            Welcome Back, <span className="text-cyan-400">Gamer</span>
          </h1>
          <p className="text-xs text-slate-400">
            আপনার ড্যাশবোর্ড, ওয়ালেট এবং অর্ডার হিস্ট্রি দেখতে লগইন করুন।
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <Input
            label="Email or Phone Number"
            type="text"
            required
            placeholder="e.g. gamer@gmail.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            icon={<Mail className="w-4 h-4" />}
          />

          <Input
            label="Password"
            type="password"
            required
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            icon={<Lock className="w-4 h-4" />}
          />

          {error && <StatusAlert type="error" message={error} />}

          <div className="pt-2">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full shadow-neon-cyan"
              icon={<ArrowRight className="w-4 h-4" />}
            >
              Login to Account
            </Button>
          </div>
        </form>

        {/* Footer link */}
        <div className="pt-4 border-t border-gaming-border text-center text-xs text-slate-400">
          Don&apos;t have an account yet?{" "}
          <Link href="/register" className="text-cyan-400 font-bold hover:underline">
            Create Free Account
          </Link>
        </div>
      </div>
    </div>
  );
}
