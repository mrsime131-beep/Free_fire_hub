"use client";

import React, { createContext, useContext, useState } from "react";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { DIAMOND_PACKAGES, GAME_SERVERS } from "@/data/packagesData";
import { PAYMENT_METHODS } from "@/data/paymentMethodsData";
import { INITIAL_MOCK_ORDERS, DEMO_USER_PROFILE } from "@/data/mockOrdersData";
import { generateOrderId } from "@/lib/utils";

const TopUpContext = createContext();

export function TopUpProvider({ children }) {
  // Top-Up Form State
  const [playerUid, setPlayerUid] = useLocalStorage("ffh_player_uid", "1849204819");
  const [playerName, setPlayerName] = useLocalStorage("ffh_player_name", "TH_SNIPER_BD");
  const [selectedServer, setSelectedServer] = useState(GAME_SERVERS[0]);
  const [selectedPackage, setSelectedPackage] = useState(DIAMOND_PACKAGES[2]); // Default 115 Diamonds
  const [selectedPayment, setSelectedPayment] = useState(PAYMENT_METHODS[0]); // Default bKash

  // Orders State with LocalStorage
  const [orders, setOrders] = useLocalStorage("ffh_orders_list", INITIAL_MOCK_ORDERS);

  // User Auth & Dashboard State
  const [userProfile, setUserProfile] = useLocalStorage("ffh_user_profile", DEMO_USER_PROFILE);
  const [isLoggedIn, setIsLoggedIn] = useLocalStorage("ffh_is_logged_in", true);

  // Active Checkout Modal State
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [activeOrderDetails, setActiveOrderDetails] = useState(null);

  // Function to place a new order
  const placeOrder = ({ senderNumber, trxId }) => {
    const newOrderId = generateOrderId();
    const now = new Date();
    const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateString = now.toISOString().split('T')[0];
    const formattedDate = `${dateString} ${timeString}`;

    const newOrder = {
      orderId: newOrderId,
      packageTitle: selectedPackage.title,
      diamonds: selectedPackage.diamonds + (selectedPackage.bonus || 0),
      amount: selectedPackage.price,
      playerUid: playerUid,
      playerName: playerName || "Free Fire Gamer",
      server: selectedServer.name + " Server",
      paymentMethod: selectedPayment.name,
      senderNumber: senderNumber ? senderNumber.slice(0, 5) + "***" + senderNumber.slice(-3) : "01712***678",
      trxId: trxId || "TRX992831",
      status: "Processing",
      createdAt: formattedDate,
      deliveredAt: null,
      timeline: [
        { step: "Order Placed", time: timeString, done: true },
        { step: "Payment Verification In Progress", time: "Just now", done: true },
        { step: "Diamonds Delivery to UID", time: "Pending", done: false },
      ],
    };

    const updatedOrders = [newOrder, ...orders];
    setOrders(updatedOrders);
    setActiveOrderDetails(newOrder);
    setIsCheckoutOpen(false);
    return newOrderId;
  };

  const value = {
    playerUid,
    setPlayerUid,
    playerName,
    setPlayerName,
    selectedServer,
    setSelectedServer,
    selectedPackage,
    setSelectedPackage,
    selectedPayment,
    setSelectedPayment,
    orders,
    setOrders,
    userProfile,
    setUserProfile,
    isLoggedIn,
    setIsLoggedIn,
    isCheckoutOpen,
    setIsCheckoutOpen,
    activeOrderDetails,
    setActiveOrderDetails,
    placeOrder,
  };

  return <TopUpContext.Provider value={value}>{children}</TopUpContext.Provider>;
}

export function useTopUp() {
  const context = useContext(TopUpContext);
  if (!context) {
    throw new Error("useTopUp must be used within a TopUpProvider");
  }
  return context;
}
