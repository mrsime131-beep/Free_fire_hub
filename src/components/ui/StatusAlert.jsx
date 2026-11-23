import React from "react";
import { CheckCircle2, AlertTriangle, XCircle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Reusable Status Alert Component
 */
export function StatusAlert({
  type = "info",
  title,
  message,
  className = "",
}) {
  const configs = {
    success: {
      icon: <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />,
      bg: "bg-emerald-500/10 border-emerald-500/30 text-emerald-300",
    },
    warning: {
      icon: <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />,
      bg: "bg-amber-500/10 border-amber-500/30 text-amber-300",
    },
    error: {
      icon: <XCircle className="w-5 h-5 text-red-400 shrink-0" />,
      bg: "bg-red-500/10 border-red-500/30 text-red-300",
    },
    info: {
      icon: <Info className="w-5 h-5 text-cyan-400 shrink-0" />,
      bg: "bg-cyan-500/10 border-cyan-500/30 text-cyan-300",
    },
  };

  const current = configs[type] || configs.info;

  return (
    <div
      className={cn(
        "flex items-start gap-3 p-4 rounded-xl border backdrop-blur-sm",
        current.bg,
        className
      )}
    >
      {current.icon}
      <div className="space-y-0.5">
        {title && <h5 className="text-sm font-bold text-white">{title}</h5>}
        {message && <p className="text-xs leading-relaxed">{message}</p>}
      </div>
    </div>
  );
}
