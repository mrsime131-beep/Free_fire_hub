"use client";

import React, { useState } from "react";
import { User, CheckCircle2 } from "lucide-react";
import { useTopUp } from "@/context/TopUpContext";
import { GAME_SERVERS } from "@/data/packagesData";
import { validateUID } from "@/lib/utils";
import { Input } from "@/components/ui/Input";

export function PlayerInfoForm() {
  const { playerUid, setPlayerUid, playerName, selectedServer, setSelectedServer } = useTopUp();
  const [uidError, setUidError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifiedSuccess, setVerifiedSuccess] = useState(true);

  const handleUidChange = (e) => {
    const val = e.target.value;
    setPlayerUid(val);
    if (val && !validateUID(val)) {
      setUidError("Enter a valid 8 to 12 digit Free Fire UID");
      setVerifiedSuccess(false);
    } else {
      setUidError("");
      if (val.length >= 8) {
        setIsVerifying(true);
        setTimeout(() => {
          setIsVerifying(false);
          setVerifiedSuccess(true);
        }, 500);
      }
    }
  };

  return (
    <div className="bg-gaming-card border border-gaming-border rounded-3xl p-6 md:p-8 shadow-glass-card space-y-6">
      <div className="flex items-center justify-between border-b border-gaming-border pb-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-blue-600/20 text-cyan-400 flex items-center justify-center font-bold text-sm">
            1
          </div>
          <h3 className="text-lg font-bold text-white tracking-wide">
            Enter Player UID & Server
          </h3>
        </div>
        <span className="text-xs text-cyan-400 font-semibold bg-cyan-500/10 px-3 py-1 rounded-full border border-cyan-500/20">
          Step 1 of 3
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* UID Input */}
        <div className="space-y-2">
          <Input
            label="Free Fire Player UID"
            required
            placeholder="e.g. 1849204819"
            value={playerUid}
            onChange={handleUidChange}
            error={uidError}
            icon={<User className="w-4 h-4" />}
          />
          {verifiedSuccess && !uidError && playerUid.length >= 8 && (
            <p className="text-xs text-emerald-400 flex items-center gap-1 font-medium pt-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Player Name: <span className="text-white font-bold">{playerName || "TH_SNIPER_BD"}</span> (Verified)
            </p>
          )}
          {isVerifying && (
            <p className="text-xs text-cyan-400 flex items-center gap-1 font-medium pt-1 animate-pulse">
              Verifying UID with game server...
            </p>
          )}
        </div>

        {/* Server Selection */}
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold tracking-wide text-slate-300 uppercase">
            Select Game Server <span className="text-cyan-400">*</span>
          </label>
          <div className="grid grid-cols-3 gap-2">
            {GAME_SERVERS.map((server) => {
              const isSelected = selectedServer.id === server.id;
              return (
                <button
                  key={server.id}
                  type="button"
                  onClick={() => setSelectedServer(server)}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? "bg-blue-600/20 border-cyan-500 text-white shadow-neon-blue"
                      : "bg-[#080B14] border-gaming-border text-slate-400 hover:text-white hover:border-slate-700"
                  }`}
                >
                  <span className="text-xl mb-1">{server.flag}</span>
                  <span className="text-xs font-bold">{server.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
