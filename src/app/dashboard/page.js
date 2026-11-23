"use client";

import React, { useState } from "react";
import { Wallet, Trophy, Copy, History, Gift } from "lucide-react";
import { useTopUp } from "@/context/TopUpContext";
import { MOCK_REFERRAL_LIST } from "@/data/mockOrdersData";
import { formatCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";

export default function DashboardPage() {
  const { userProfile, orders } = useTopUp();
  const [copiedRef, setCopiedRef] = useState(false);

  const handleCopyReferral = () => {
    navigator.clipboard.writeText(userProfile?.referralCode || "FFHUB-TAHMID99");
    setCopiedRef(true);
    setTimeout(() => setCopiedRef(false), 2000);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-12 space-y-8">
      {/* Profile Header Card */}
      <div className="bg-gaming-card border border-gaming-border rounded-3xl p-6 md:p-8 shadow-glass-card flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-4 text-center md:text-left flex-col md:flex-row">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-400 text-white flex items-center justify-center font-black text-3xl shadow-neon-blue">
            {userProfile?.name ? userProfile.name.charAt(0) : "T"}
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2 justify-center md:justify-start">
              <h2 className="text-2xl font-black text-white">{userProfile?.name}</h2>
              <Badge variant="cyan">{userProfile?.vipTier}</Badge>
            </div>
            <p className="text-xs text-slate-400">UID: <span className="font-mono text-white">{userProfile?.defaultUid}</span> • Email: {userProfile?.email}</p>
            <p className="text-xs text-slate-500">Member since: {userProfile?.memberSince}</p>
          </div>
        </div>

        {/* Stats Mini Cards */}
        <div className="grid grid-cols-2 gap-4 w-full md:w-auto">
          <div className="bg-[#080B14] p-4 rounded-2xl border border-gaming-border text-center">
            <p className="text-xs text-slate-400 flex items-center justify-center gap-1">
              <Wallet className="w-3.5 h-3.5 text-cyan-400" /> Wallet Balance
            </p>
            <p className="text-xl font-black text-white mt-1">{formatCurrency(userProfile?.walletBalance || 0)}</p>
          </div>
          <div className="bg-[#080B14] p-4 rounded-2xl border border-gaming-border text-center">
            <p className="text-xs text-slate-400 flex items-center justify-center gap-1">
              <Trophy className="w-3.5 h-3.5 text-amber-400" /> Reward Points
            </p>
            <p className="text-xl font-black text-cyan-400 mt-1">{userProfile?.rewardPoints || 0} pts</p>
          </div>
        </div>
      </div>

      {/* Referral Program Banner */}
      <div className="bg-gradient-to-r from-blue-900/40 via-purple-900/30 to-gaming-card border border-gaming-border rounded-3xl p-6 md:p-8 shadow-glass-card space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gaming-border pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center">
              <Gift className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Refer & Earn Program</h3>
              <p className="text-xs text-slate-400">Invite your friends and earn ৳25 bonus on their first top-up</p>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-[#080B14] px-4 py-2.5 rounded-xl border border-gaming-border">
            <span className="text-sm font-black text-cyan-400 font-mono tracking-wider">
              {userProfile?.referralCode || "FFHUB-TAHMID99"}
            </span>
            <button
              onClick={handleCopyReferral}
              className="flex items-center gap-1 text-xs text-slate-300 hover:text-white bg-slate-800 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" /> {copiedRef ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>

        {/* Referred Friends List */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Your Referred Friends</h4>
          <div className="space-y-2">
            {MOCK_REFERRAL_LIST.map((ref) => (
              <div key={ref.id} className="flex items-center justify-between p-3.5 rounded-xl bg-[#080B14] border border-gaming-border text-xs">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-cyan-400 flex items-center justify-center font-bold">
                    {ref.friendName.charAt(0)}
                  </div>
                  <div>
                    <p className="font-bold text-white">{ref.friendName} <span className="text-slate-500 font-mono">({ref.uid})</span></p>
                    <p className="text-[10px] text-slate-400">Joined: {ref.joinedDate}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-emerald-400 font-bold">+ ৳ {ref.commissionEarned}</span>
                  <Badge variant={ref.firstTopUpDone ? "success" : "warning"}>{ref.status}</Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Order History Section */}
      <div className="bg-gaming-card border border-gaming-border rounded-3xl p-6 md:p-8 shadow-glass-card space-y-6">
        <div className="flex items-center gap-3 border-b border-gaming-border pb-4">
          <div className="w-10 h-10 rounded-xl bg-blue-600/20 text-cyan-400 flex items-center justify-center">
            <History className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Your Order History</h3>
            <p className="text-xs text-slate-400">All your previous diamond top-up transactions</p>
          </div>
        </div>

        <div className="space-y-3">
          {orders.map((ord) => (
            <div key={ord.orderId} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl bg-[#080B14] border border-gaming-border gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600/20 text-cyan-400 flex items-center justify-center font-bold">
                  💎
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-white font-mono">{ord.orderId}</p>
                    <span className="text-xs text-cyan-400">• {ord.packageTitle}</span>
                  </div>
                  <p className="text-xs text-slate-400">UID: {ord.playerUid} • Date: {ord.createdAt}</p>
                </div>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-4">
                <span className="text-sm font-bold text-white">{formatCurrency(ord.amount)}</span>
                <Badge variant={ord.status === "Completed" ? "success" : ord.status === "Processing" ? "cyan" : "warning"}>
                  {ord.status}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
