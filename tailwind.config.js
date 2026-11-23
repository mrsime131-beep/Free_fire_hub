/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        gaming: {
          bg: "#080B14",
          card: "#101827",
          primary: "#2563EB",
          cyan: "#00D4FF",
          text: "#FFFFFF",
          muted: "#A1A1AA",
          border: "rgba(255, 255, 255, 0.08)",
          success: "#10B981",
          warning: "#F59E0B",
          danger: "#EF4444",
        },
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gaming-gradient": "linear-gradient(135deg, #2563EB 0%, #00D4FF 100%)",
        "card-gradient":
          "linear-gradient(180deg, rgba(16, 24, 39, 0.85) 0%, rgba(8, 11, 20, 0.95) 100%)",
        "glow-conic":
          "conic-gradient(from 180deg at 50% 50%, #2563EB 0deg, #00D4FF 180deg, #2563EB 360deg)",
      },
      boxShadow: {
        "neon-blue": "0 0 20px rgba(37, 99, 235, 0.4)",
        "neon-cyan": "0 0 20px rgba(0, 212, 255, 0.45)",
        "neon-cyan-lg": "0 0 35px rgba(0, 212, 255, 0.65)",
        "glass-card": "0 8px 32px 0 rgba(0, 0, 0, 0.45)",
      },
      animation: {
        "pulse-slow": "pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "float": "float 3s ease-in-out infinite",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-8px)" },
        },
      },
    },
  },
  plugins: [],
};
