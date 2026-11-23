import React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Reusable Glassmorphism Modal Component
 */
export function Modal({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = "max-w-md",
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div
        className={cn(
          "relative w-full bg-gaming-card border border-gaming-border rounded-2xl shadow-neon-blue p-6 overflow-hidden",
          maxWidth
        )}
      >
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-gaming-border">
          <h3 className="text-lg font-bold text-white tracking-wide">{title}</h3>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div>{children}</div>
      </div>
    </div>
  );
}
