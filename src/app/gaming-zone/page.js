"use client";

import React, { useState } from "react";
import { Gamepad2, CheckCircle2, RotateCw } from "lucide-react";
import { useTopUp } from "@/context/TopUpContext";
import { SPIN_WHEEL_REWARDS, DAILY_QUIZ_QUESTIONS } from "@/data/tournamentsData";
import { Button } from "@/components/ui/Button";
import { StatusAlert } from "@/components/ui/StatusAlert";

export default function GamingZonePage() {
  const { userProfile, setUserProfile } = useTopUp();
  const [spinning, setSpinning] = useState(false);
  const [spinResult, setSpinResult] = useState(null);

  // Quiz state
  const [currentQuizIdx, setCurrentQuizIdx] = useState(0);
  const [selectedOption, setSelectedOption] = useState(null);
  const [quizScore, setQuizScore] = useState(0);
  const [quizFinished, setQuizFinished] = useState(false);

  const handleSpinWheel = () => {
    if (spinning) return;
    setSpinning(true);
    setSpinResult(null);

    setTimeout(() => {
      const randomIndex = Math.floor(Math.random() * SPIN_WHEEL_REWARDS.length);
      const reward = SPIN_WHEEL_REWARDS[randomIndex];
      setSpinResult(reward);
      setSpinning(false);

      if (reward.points) {
        setUserProfile((prev) => ({
          ...prev,
          rewardPoints: (prev.rewardPoints || 0) + reward.points,
        }));
      }
    }, 1500);
  };

  const handleAnswerSubmit = (option) => {
    setSelectedOption(option);
    const currentQ = DAILY_QUIZ_QUESTIONS[currentQuizIdx];
    const isCorrect = option === currentQ.correctAnswer;

    if (isCorrect) {
      setQuizScore((prev) => prev + currentQ.rewardPoints);
      setUserProfile((prev) => ({
        ...prev,
        rewardPoints: (prev.rewardPoints || 0) + currentQ.rewardPoints,
      }));
    }

    setTimeout(() => {
      setSelectedOption(null);
      if (currentQuizIdx + 1 < DAILY_QUIZ_QUESTIONS.length) {
        setCurrentQuizIdx((prev) => prev + 1);
      } else {
        setQuizFinished(true);
      }
    }, 1000);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-12 space-y-12">
      {/* Header */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 bg-purple-500/10 border border-purple-500/30 px-4 py-1.5 rounded-full text-purple-400 text-xs font-bold uppercase tracking-wider">
          <Gamepad2 className="w-4 h-4" /> Free Gaming Zone & Rewards
        </div>
        <h1 className="text-3xl sm:text-5xl font-black text-white uppercase tracking-tight">
          Play, Spin & <span className="text-purple-400">Win Free Rewards</span>
        </h1>
        <p className="text-sm text-slate-400 max-w-xl mx-auto">
          প্রতিদিন লাকি স্পিন করুন এবং ফ্রি ফায়ার কুইজ খেলে রিওয়ার্ড পয়েন্ট জিতুন যা ডায়মন্ড ডিসকাউন্ট ভাউচারে রূপান্তর করা যাবে।
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Lucky Spin Wheel Section */}
        <div className="bg-gaming-card border border-gaming-border rounded-3xl p-6 md:p-8 shadow-glass-card space-y-6 flex flex-col justify-between">
          <div className="flex items-center gap-3 border-b border-gaming-border pb-4">
            <div className="w-10 h-10 rounded-xl bg-purple-600/20 text-purple-400 flex items-center justify-center font-bold">
              🎡
            </div>
            <div>
              <h3 className="text-lg font-bold text-white tracking-wide">Daily Lucky Spin</h3>
              <p className="text-xs text-slate-400">Spin the wheel and test your luck today</p>
            </div>
          </div>

          <div className="text-center py-8 space-y-6">
            <div className="relative w-48 h-48 mx-auto rounded-full border-4 border-purple-500/50 bg-gradient-to-br from-purple-900/40 to-slate-900 flex items-center justify-center shadow-neon-cyan">
              <RotateCw className={`w-16 h-16 text-purple-400 ${spinning ? "animate-spin" : ""}`} />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xs font-bold text-white uppercase tracking-wider bg-gaming-bg/80 px-3 py-1 rounded-full border border-gaming-border">
                  {spinning ? "Spinning..." : "FF HUB"}
                </span>
              </div>
            </div>

            {spinResult && (
              <StatusAlert
                type="success"
                title="Congratulations! 🎉"
                message={`You won: ${spinResult.label}`}
              />
            )}
          </div>

          <Button
            variant="primary"
            size="lg"
            className="w-full bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-500 hover:to-pink-400 shadow-neon-cyan"
            onClick={handleSpinWheel}
            disabled={spinning}
          >
            {spinning ? "Spinning Wheel..." : "Spin Now for Free!"}
          </Button>
        </div>

        {/* Daily Quiz Section */}
        <div className="bg-gaming-card border border-gaming-border rounded-3xl p-6 md:p-8 shadow-glass-card space-y-6 flex flex-col justify-between">
          <div className="flex items-center gap-3 border-b border-gaming-border pb-4">
            <div className="w-10 h-10 rounded-xl bg-cyan-600/20 text-cyan-400 flex items-center justify-center font-bold">
              ❓
            </div>
            <div>
              <h3 className="text-lg font-bold text-white tracking-wide">Free Fire Daily Quiz</h3>
              <p className="text-xs text-slate-400">Answer gaming trivia and earn bonus points</p>
            </div>
          </div>

          {!quizFinished ? (
            <div className="space-y-6 py-4">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Question {currentQuizIdx + 1} of {DAILY_QUIZ_QUESTIONS.length}</span>
                <span className="text-cyan-400 font-bold">Reward: +{DAILY_QUIZ_QUESTIONS[currentQuizIdx].rewardPoints} Points</span>
              </div>

              <h4 className="text-base font-bold text-white">
                {DAILY_QUIZ_QUESTIONS[currentQuizIdx].question}
              </h4>

              <div className="space-y-3">
                {DAILY_QUIZ_QUESTIONS[currentQuizIdx].options.map((opt, idx) => {
                  const isSelected = selectedOption === opt;
                  const isCorrect = opt === DAILY_QUIZ_QUESTIONS[currentQuizIdx].correctAnswer;
                  let btnColor = "bg-[#080B14] border-gaming-border text-slate-300 hover:border-cyan-500";

                  if (selectedOption) {
                    if (isCorrect) btnColor = "bg-emerald-500/20 border-emerald-500 text-white";
                    else if (isSelected) btnColor = "bg-red-500/20 border-red-500 text-white";
                  }

                  return (
                    <button
                      key={idx}
                      onClick={() => !selectedOption && handleAnswerSubmit(opt)}
                      disabled={selectedOption !== null}
                      className={`w-full text-left p-4 rounded-xl border text-sm font-semibold transition-all cursor-pointer ${btnColor}`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="text-center py-10 space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/40">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h4 className="text-xl font-bold text-white">কুইজ সম্পন্ন হয়েছে!</h4>
              <p className="text-sm text-slate-300">
                আপনি মোট <span className="text-cyan-400 font-bold">{quizScore} পয়েন্ট</span> অর্জন করেছেন।
              </p>
              <Button
                variant="secondary"
                size="md"
                onClick={() => {
                  setCurrentQuizIdx(0);
                  setQuizFinished(false);
                  setQuizScore(0);
                }}
              >
                Play Again
              </Button>
            </div>
          )}

          <div className="p-3 rounded-xl bg-[#080B14] border border-gaming-border text-xs text-slate-400 flex items-center justify-between">
            <span>Your Current Reward Points:</span>
            <span className="font-bold text-cyan-400 text-sm">{userProfile?.rewardPoints || 0} pts</span>
          </div>
        </div>
      </div>
    </div>
  );
}
