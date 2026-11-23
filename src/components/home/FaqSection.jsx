"use client";

import React, { useState } from "react";
import { ChevronDown, HelpCircle } from "lucide-react";
import { FAQ_LIST } from "@/data/faqData";

export function FaqSection() {
  const [openIndex, setOpenIndex] = useState(0);

  const toggleFaq = (index) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <div className="bg-gaming-card border border-gaming-border rounded-3xl p-6 md:p-8 shadow-glass-card space-y-6">
      <div className="flex items-center gap-3 border-b border-gaming-border pb-4">
        <div className="w-10 h-10 rounded-xl bg-blue-600/20 text-cyan-400 flex items-center justify-center shadow-neon-blue">
          <HelpCircle className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-white tracking-wide">Frequently Asked Questions</h3>
          <p className="text-xs text-slate-400">Everything you need to know about Free Fire Top-Up</p>
        </div>
      </div>

      <div className="space-y-3">
        {FAQ_LIST.map((faq, index) => {
          const isOpen = openIndex === index;
          return (
            <div
              key={faq.id}
              className="border border-gaming-border rounded-2xl bg-[#080B14] overflow-hidden transition-all"
            >
              <button
                onClick={() => toggleFaq(index)}
                className="w-full flex items-center justify-between p-4 text-left font-semibold text-white text-sm hover:text-cyan-400 transition-colors cursor-pointer"
              >
                <span>{faq.question}</span>
                <ChevronDown
                  className={`w-4 h-4 text-cyan-400 transition-transform duration-300 ${
                    isOpen ? "transform rotate-180" : ""
                  }`}
                />
              </button>
              {isOpen && (
                <div className="px-4 pb-4 text-xs text-slate-300 leading-relaxed border-t border-gaming-border/60 pt-3">
                  {faq.answer}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
