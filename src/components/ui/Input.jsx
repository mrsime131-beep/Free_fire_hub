import React from "react";
import { cn } from "@/lib/utils";

/**
 * Reusable Form Input Component with Label and Error State
 */
export function Input({
  label,
  error,
  icon,
  className = "",
  containerClassName = "",
  type = "text",
  placeholder = "",
  value,
  onChange,
  disabled = false,
  required = false,
  name,
  id,
}) {
  return (
    <div className={cn("w-full space-y-1.5", containerClassName)}>
      {label && (
        <label
          htmlFor={id || name}
          className="block text-xs font-semibold tracking-wide text-slate-300 uppercase"
        >
          {label} {required && <span className="text-cyan-400">*</span>}
        </label>
      )}
      <div className="relative flex items-center">
        {icon && (
          <span className="absolute left-3.5 text-slate-400 flex items-center pointer-events-none">
            {icon}
          </span>
        )}
        <input
          id={id || name}
          name={name}
          type={type}
          value={value}
          onChange={onChange}
          disabled={disabled}
          placeholder={placeholder}
          className={cn(
            "w-full bg-[#080B14] text-white placeholder-slate-500 border rounded-xl px-4 py-3 text-sm transition-all duration-200 outline-none",
            icon ? "pl-11" : "pl-4",
            error
              ? "border-red-500 focus:ring-2 focus:ring-red-500/20"
              : "border-gaming-border focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 hover:border-slate-700",
            disabled && "opacity-50 cursor-not-allowed bg-slate-900/50",
            className
          )}
        />
      </div>
      {error && <p className="text-xs text-red-400 font-medium">{error}</p>}
    </div>
  );
}
