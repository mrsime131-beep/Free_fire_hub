"use client";

import React, { useState } from "react";
import Link from "next/link";
import { 
  Flame, 
  Search, 
  Gamepad2, 
  Trophy, 
  HeadphonesIcon, 
  User, 
  Menu, 
  X, 
  Wallet, 
  LogOut 
} from "lucide-react";
import { useTopUp } from "@/context/TopUpContext";
import { Button } from "@/components/ui/Button";

export function Navbar() {
  const { isLoggedIn, userProfile, setIsLoggedIn } = useTopUp();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 w-full bg-[#080B14]/90 backdrop-blur-md border-b border-gaming-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
        {/* Brand Logo */}
        <Link href="/" className="flex items-center gap-3 group">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-400 flex items-center justify-center shadow-neon-blue group-hover:shadow-neon-cyan transition-all duration-300">
            <Flame className="w-6 h-6 text-white animate-pulse" />
          </div>
          <div>
            <span className="text-xl font-black tracking-wider text-white uppercase flex items-center gap-1">
              FREE FIRE <span className="text-cyan-400">HUB</span>
            </span>
            <span className="text-[10px] tracking-widest text-slate-400 block -mt-1 uppercase font-semibold">
              Diamond Top-Up BD
            </span>
          </div>
        </Link>

        {/* Desktop Navigation Links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-300">
          <Link href="/" className="hover:text-cyan-400 transition-colors">
            Home
          </Link>
          <Link href="/track-order" className="hover:text-cyan-400 transition-colors flex items-center gap-1.5">
            <Search className="w-4 h-4 text-cyan-400" /> Track Order
          </Link>
          <Link href="/gaming-zone" className="hover:text-cyan-400 transition-colors flex items-center gap-1.5">
            <Gamepad2 className="w-4 h-4 text-purple-400" /> Gaming Zone
          </Link>
          <Link href="/tournaments" className="hover:text-cyan-400 transition-colors flex items-center gap-1.5">
            <Trophy className="w-4 h-4 text-amber-400" /> Tournaments
          </Link>
          <Link href="/support" className="hover:text-cyan-400 transition-colors flex items-center gap-1.5">
            <HeadphonesIcon className="w-4 h-4 text-emerald-400" /> Support
          </Link>
        </nav>

        {/* Right Side: User Account / Login & Mobile Menu Toggle */}
        <div className="hidden md:flex items-center gap-4">
          {isLoggedIn ? (
            <div className="flex items-center gap-3">
              <Link
                href="/dashboard"
                className="flex items-center gap-2.5 bg-gaming-card border border-gaming-border hover:border-cyan-500/50 px-3.5 py-2 rounded-xl transition-all shadow-glass-card"
              >
                <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-cyan-400 flex items-center justify-center font-bold text-xs">
                  {userProfile?.name ? userProfile.name.charAt(0) : "U"}
                </div>
                <div className="text-left">
                  <p className="text-xs font-bold text-white leading-tight">
                    {userProfile?.name || "Gamer"}
                  </p>
                  <p className="text-[10px] text-cyan-400 flex items-center gap-1 font-semibold">
                    <Wallet className="w-3 h-3" /> ৳ {userProfile?.walletBalance || 0}
                  </p>
                </div>
              </Link>
              <button
                onClick={() => setIsLoggedIn(false)}
                title="Log out"
                className="p-2.5 text-slate-400 hover:text-red-400 bg-gaming-card hover:bg-red-500/10 border border-gaming-border rounded-xl transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link href="/login">
                <Button variant="secondary" size="sm">
                  Login
                </Button>
              </Link>
              <Link href="/register">
                <Button variant="primary" size="sm">
                  Register
                </Button>
              </Link>
            </div>
          )}
        </div>

        {/* Mobile Menu Button */}
        <div className="md:hidden flex items-center">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 text-slate-300 hover:text-white bg-gaming-card border border-gaming-border rounded-xl cursor-pointer"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-gaming-card border-b border-gaming-border px-4 py-6 space-y-4 animate-fadeIn">
          <nav className="flex flex-col space-y-3 text-sm font-medium text-slate-300">
            <Link
              href="/"
              onClick={() => setMobileMenuOpen(false)}
              className="hover:text-cyan-400 py-1.5"
            >
              Home
            </Link>
            <Link
              href="/track-order"
              onClick={() => setMobileMenuOpen(false)}
              className="hover:text-cyan-400 py-1.5 flex items-center gap-2"
            >
              <Search className="w-4 h-4 text-cyan-400" /> Track Order
            </Link>
            <Link
              href="/gaming-zone"
              onClick={() => setMobileMenuOpen(false)}
              className="hover:text-cyan-400 py-1.5 flex items-center gap-2"
            >
              <Gamepad2 className="w-4 h-4 text-purple-400" /> Gaming Zone
            </Link>
            <Link
              href="/tournaments"
              onClick={() => setMobileMenuOpen(false)}
              className="hover:text-cyan-400 py-1.5 flex items-center gap-2"
            >
              <Trophy className="w-4 h-4 text-amber-400" /> Tournaments
            </Link>
            <Link
              href="/support"
              onClick={() => setMobileMenuOpen(false)}
              className="hover:text-cyan-400 py-1.5 flex items-center gap-2"
            >
              <HeadphonesIcon className="w-4 h-4 text-emerald-400" /> Support Center
            </Link>
          </nav>

          <div className="pt-4 border-t border-gaming-border flex flex-col gap-3">
            {isLoggedIn ? (
              <div className="space-y-3">
                <Link
                  href="/dashboard"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-between p-3 bg-slate-900 rounded-xl border border-gaming-border"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-blue-600/20 text-cyan-400 flex items-center justify-center font-bold">
                      {userProfile?.name ? userProfile.name.charAt(0) : "U"}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white">{userProfile?.name}</p>
                      <p className="text-xs text-cyan-400">Wallet: ৳ {userProfile?.walletBalance}</p>
                    </div>
                  </div>
                  <User className="w-4 h-4 text-slate-400" />
                </Link>
                <Button
                  variant="danger"
                  size="md"
                  className="w-full"
                  onClick={() => {
                    setIsLoggedIn(false);
                    setMobileMenuOpen(false);
                  }}
                >
                  Log Out
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <Link href="/login" onClick={() => setMobileMenuOpen(false)}>
                  <Button variant="secondary" size="md" className="w-full">
                    Login
                  </Button>
                </Link>
                <Link href="/register" onClick={() => setMobileMenuOpen(false)}>
                  <Button variant="primary" size="md" className="w-full">
                    Register
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
