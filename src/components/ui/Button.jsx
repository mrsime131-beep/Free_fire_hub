"use client";

import React from "react";
import { cn } from "@/lib/utils";

/**
 * Reusable Premium Button Component with Gaming Glow Effects
 */
export function Button({
  children,
  onClick,
  type = "button",
  variant = "primary",
  size = "md",
  className = "",
  disabled = false,
  icon = null,
}) {
  const baseStyles =
    "relative inline-flex items-center justify-center font-semibold rounded-xl transition-all duration-300 active:scale-95 disabled:opacity-50 disabled:pointer-events-none cursor-pointer overflow-hidden";

  const variants = {
    primary:
      "bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-neon-blue hover:shadow-neon-cyan hover:from-blue-500 hover:to-cyan-400 border border-blue-400/30",
    secondary:
      "bg-gaming-card text-white border border-gaming-border hover:border-cyan-500/50 hover:bg-slate-800/80 shadow-glass-card",
    accent:
      "bg-cyan-500 text-gaming-bg hover:bg-cyan-400 shadow-neon-cyan font-bold",
    danger:
      "bg-red-600/20 text-red-400 border border-red-500/40 hover:bg-red-600 hover:text-white",
    ghost:
      "bg-transparent text-slate-300 hover:text-white hover:bg-slate-800/50",
  };

  const sizes = {
    sm: "text-xs px-3 py-1.5 gap-1.5",
    md: "text-sm px-5 py-2.5 gap-2",
    lg: "text-base px-7 py-3.5 gap-2.5",
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(baseStyles, variants[variant], sizes[size], className)}
    >
      {icon && <span className="flex items-center">{icon}</span>}
      <span>{children}</span>
    </button>
  );
}
