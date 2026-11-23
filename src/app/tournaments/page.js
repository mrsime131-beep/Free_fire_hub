"use client";

import React, { useState } from "react";
import { Trophy, Calendar, CheckCircle2 } from "lucide-react";
import { TOURNAMENTS_LIST, GIVEAWAYS_LIST } from "@/data/tournamentsData";
import { useTopUp } from "@/context/TopUpContext";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";

export default function TournamentsPage() {
  const { playerUid, playerName } = useTopUp();
  const [activeTab, setActiveTab] = useState("tournaments");
  const [selectedTournament, setSelectedTournament] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [registeredSuccess, setRegisteredSuccess] = useState(false);

  const handleRegister = (e) => {
    e.preventDefault();
    setRegisteredSuccess(true);
    setTimeout(() => {
      setRegisteredSuccess(false);
      setIsModalOpen(false);
      setSelectedTournament(null);
    }, 2000);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-12 space-y-8">
      {/* Header */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 px-4 py-1.5 rounded-full text-amber-400 text-xs font-bold uppercase tracking-wider">
          <Trophy className="w-4 h-4" /> Custom Tournaments & Giveaways
        </div>
        <h1 className="text-3xl sm:text-5xl font-black text-white uppercase tracking-tight">
          Compete in <span className="text-amber-400">Pro Tournaments</span>
        </h1>
        <p className="text-sm text-slate-400 max-w-xl mx-auto">
          ফ্রি ফায়ার কাস্টম রুম টুর্নামেন্টে অংশ নিন এবং ক্যাশ প্রাইজ ও ডায়মন্ড জিতুন। প্রতিদিনের গিভঅ্যাওয়েতেও জয়ী হওয়ার সুযোগ রয়েছে।
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={() => setActiveTab("tournaments")}
          className={`px-6 py-2.5 rounded-2xl text-sm font-bold transition-all cursor-pointer ${
            activeTab === "tournaments"
              ? "bg-amber-500 text-gaming-bg shadow-neon-cyan"
              : "bg-gaming-card text-slate-400 hover:text-white border border-gaming-border"
          }`}
        >
          Custom Room Tournaments ({TOURNAMENTS_LIST.length})
        </button>
        <button
          onClick={() => setActiveTab("giveaways")}
          className={`px-6 py-2.5 rounded-2xl text-sm font-bold transition-all cursor-pointer ${
            activeTab === "giveaways"
              ? "bg-amber-500 text-gaming-bg shadow-neon-cyan"
              : "bg-gaming-card text-slate-400 hover:text-white border border-gaming-border"
          }`}
        >
          Weekly Giveaways ({GIVEAWAYS_LIST.length})
        </button>
      </div>

      {/* Content List */}
      {activeTab === "tournaments" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {TOURNAMENTS_LIST.map((trn) => (
            <div
              key={trn.id}
              className="bg-gaming-card border border-gaming-border rounded-3xl p-6 shadow-glass-card flex flex-col justify-between space-y-6"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Badge variant="warning">{trn.badge}</Badge>
                  <span className="text-xs text-cyan-400 font-semibold">{trn.mode}</span>
                </div>

                <div>
                  <h3 className="text-lg font-bold text-white">{trn.title}</h3>
                  <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-amber-400" /> {trn.schedule} • Map: {trn.map}
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-[#080B14] border border-gaming-border space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Prize Pool</span>
                    <span className="font-bold text-amber-400">{trn.prizePool}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Per Kill</span>
                    <span className="font-bold text-white">{trn.perKillPrize}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Entry Fee</span>
                    <span className="font-bold text-emerald-400">{trn.entryFee}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Slots: {trn.filledSlots}/{trn.totalSlots} Booked</span>
                  <span className="text-cyan-400 font-bold">{Math.round((trn.filledSlots / trn.totalSlots) * 100)}%</span>
                </div>
              </div>

              <Button
                variant={trn.status === "Slots Full" ? "secondary" : "primary"}
                size="md"
                className="w-full"
                disabled={trn.status === "Slots Full"}
                onClick={() => {
                  setSelectedTournament(trn);
                  setIsModalOpen(true);
                }}
              >
                {trn.status === "Slots Full" ? "Slots Full" : "Register Now"}
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {GIVEAWAYS_LIST.map((gvw) => (
            <div
              key={gvw.id}
              className="bg-gaming-card border border-gaming-border rounded-3xl p-6 md:p-8 shadow-glass-card flex flex-col justify-between space-y-6"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Badge variant="cyan">{gvw.badge}</Badge>
                  <span className="text-xs text-amber-400 font-semibold">Ends in: {gvw.endsIn}</span>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-white">{gvw.title}</h3>
                  <p className="text-sm font-bold text-cyan-400 mt-1">{gvw.reward}</p>
                </div>

                <div className="p-4 rounded-2xl bg-[#080B14] border border-gaming-border space-y-2 text-xs">
                  <p className="text-slate-300"><span className="text-slate-400">Winners:</span> {gvw.winnersCount}</p>
                  <p className="text-slate-300"><span className="text-slate-400">Participants:</span> {gvw.participants} gamers</p>
                  <p className="text-slate-300"><span className="text-slate-400">Requirement:</span> {gvw.requirement}</p>
                </div>
              </div>

              <Button
                variant="primary"
                size="lg"
                className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-gaming-bg font-bold shadow-neon-cyan"
                onClick={() => {
                  setSelectedTournament(gvw);
                  setIsModalOpen(true);
                }}
              >
                Join Giveaway Now
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Registration Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setRegisteredSuccess(false);
        }}
        title={`Register for ${selectedTournament?.title || "Event"}`}
      >
        {registeredSuccess ? (
          <div className="space-y-4 text-center py-6">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/40">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h4 className="text-xl font-bold text-white">রেজিস্ট্রেশন সফল হয়েছে!</h4>
            <p className="text-xs text-slate-300">
              রুমে যোগ দেওয়ার তথ্য আপনার UID-তে এবং হোয়াটসঅ্যাপ গ্রুপে জানিয়ে দেওয়া হবে।
            </p>
          </div>
        ) : (
          <form onSubmit={handleRegister} className="space-y-4">
            <Input
              label="Free Fire Player UID"
              required
              defaultValue={playerUid}
              placeholder="e.g. 1849204819"
            />
            <Input
              label="In-Game Name (IGN)"
              required
              defaultValue={playerName}
              placeholder="e.g. TH_SNIPER_BD"
            />
            <Input
              label="WhatsApp / Contact Number"
              required
              placeholder="e.g. 01712345678"
            />

            <div className="pt-2">
              <Button type="submit" variant="primary" size="md" className="w-full">
                Confirm Registration
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
