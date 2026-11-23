import React from "react";
import "./globals.css";
import { TopUpProvider } from "@/context/TopUpContext";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";

export const metadata = {
  title: "Free Fire Hub - #1 Diamond Top-Up & Membership BD",
  description: "Instant Free Fire Diamond Top-Up via bKash, Nagad, Rocket with 100% secure UID delivery in Bangladesh.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-gaming-bg text-white min-h-screen flex flex-col selection:bg-cyan-500 selection:text-gaming-bg">
        <TopUpProvider>
          <Navbar />
          <main className="flex-grow">{children}</main>
          <Footer />
        </TopUpProvider>
      </body>
    </html>
  );
}
