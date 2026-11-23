import React from "react";

export function Badge({ children, variant = "blue" }) {
  let variantStyles = "bg-blue-500/20 text-cyan-400 border-blue-500/30";

  if (variant === "success") {
    variantStyles = "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
  } else if (variant === "warning") {
    variantStyles = "bg-amber-500/20 text-amber-400 border-amber-500/30";
  } else if (variant === "danger") {
    variantStyles = "bg-red-500/20 text-red-400 border-red-500/30";
  } else if (variant === "cyan") {
    variantStyles = "bg-cyan-500/20 text-cyan-400 border-cyan-500/30";
  }

  return (
    <span
      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border ${variantStyles}`}
    >
      {children}
    </span>
  );
}
