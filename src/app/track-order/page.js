"use client";

import React, { useState } from "react";
import { Search, CheckCircle2, Clock } from "lucide-react";
import { useTopUp } from "@/context/TopUpContext";
import { formatCurrency } from "@/lib/utils";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { StatusAlert } from "@/components/ui/StatusAlert";

export default function TrackOrderPage() {
  const { orders } = useTopUp();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchedOrder, setSearchedOrder] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    const query = searchQuery.trim().toUpperCase();
    const found = orders.find(
      (ord) =>
        ord.orderId.toUpperCase() === query ||
        ord.playerUid === query ||
        ord.trxId.toUpperCase() === query
    );

    setSearchedOrder(found || null);
    setHasSearched(true);
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "Completed":
        return <Badge variant="success">Completed</Badge>;
      case "Processing":
        return <Badge variant="cyan">Processing</Badge>;
      case "Pending":
        return <Badge variant="warning">Pending</Badge>;
      case "Failed":
        return <Badge variant="danger">Failed</Badge>;
      default:
        return <Badge variant="blue">{status}</Badge>;
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-12 space-y-8">
      {/* Header */}
      <div className="text-center space-y-3">
        <h1 className="text-3xl font-black text-white uppercase tracking-tight">
          Track Your <span className="text-cyan-400">Order Status</span>
        </h1>
        <p className="text-sm text-slate-400 max-w-lg mx-auto">
          আপনার অর্ডার আইডি (Order ID), Player UID অথবা TrxID লিখে লাইভ অর্ডার স্ট্যাটাস ও ডেলিভারি টাইমলাইন চেক করুন।
        </p>
      </div>

      {/* Search Bar Box */}
      <div className="bg-gaming-card border border-gaming-border rounded-3xl p-6 md:p-8 shadow-glass-card">
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
          <Input
            placeholder="Enter Order ID (e.g. FFH-849201) or UID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            icon={<Search className="w-4 h-4" />}
            containerClassName="flex-grow"
          />
          <Button type="submit" variant="primary" size="md" className="sm:w-auto w-full">
            Track Order
          </Button>
        </form>
      </div>

      {/* Search Result */}
      {hasSearched && (
        <div className="space-y-6">
          {searchedOrder ? (
            <div className="bg-gaming-card border border-gaming-border rounded-3xl p-6 md:p-8 shadow-glass-card space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gaming-border pb-4">
                <div>
                  <span className="text-xs text-slate-400 uppercase font-semibold">Order ID</span>
                  <h3 className="text-xl font-black text-cyan-400 font-mono">{searchedOrder.orderId}</h3>
                </div>
                <div>{getStatusBadge(searchedOrder.status)}</div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                <div className="bg-[#080B14] p-4 rounded-xl border border-gaming-border">
                  <p className="text-xs text-slate-400">Package Title</p>
                  <p className="font-bold text-white mt-1">{searchedOrder.packageTitle}</p>
                </div>
                <div className="bg-[#080B14] p-4 rounded-xl border border-gaming-border">
                  <p className="text-xs text-slate-400">Player UID</p>
                  <p className="font-bold text-white font-mono mt-1">{searchedOrder.playerUid}</p>
                </div>
                <div className="bg-[#080B14] p-4 rounded-xl border border-gaming-border">
                  <p className="text-xs text-slate-400">Total Paid</p>
                  <p className="font-bold text-emerald-400 mt-1">{formatCurrency(searchedOrder.amount)}</p>
                </div>
                <div className="bg-[#080B14] p-4 rounded-xl border border-gaming-border">
                  <p className="text-xs text-slate-400">Payment & TrxID</p>
                  <p className="font-bold text-white mt-1">{searchedOrder.paymentMethod} ({searchedOrder.trxID})</p>
                </div>
              </div>

              {/* Timeline */}
              <div className="space-y-4 pt-2">
                <h4 className="text-sm font-bold text-white uppercase tracking-wider">Delivery Timeline</h4>
                <div className="space-y-3">
                  {searchedOrder.timeline.map((step, idx) => (
                    <div key={idx} className="flex items-center gap-3 bg-[#080B14] p-3 rounded-xl border border-gaming-border">
                      {step.done ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                      ) : (
                        <Clock className="w-5 h-5 text-amber-400 shrink-0 animate-spin" />
                      )}
                      <div className="flex-grow flex items-center justify-between text-xs">
                        <span className={step.done ? "text-white font-semibold" : "text-amber-300 font-semibold"}>
                          {step.step}
                        </span>
                        <span className="text-slate-400">{step.time}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {searchedOrder.status === "Failed" && (
                <StatusAlert
                  type="error"
                  title="Order Failed"
                  message={searchedOrder.failureReason || "Transaction verification failed. Please contact support."}
                />
              )}
            </div>
          ) : (
            <StatusAlert
              type="warning"
              title="Order Not Found"
              message="এই অর্ডার আইডি বা UID দিয়ে কোনো অর্ডার খুঁজে পাওয়া যায়নি। দয়া করে সঠিক তথ্য দিয়ে আবার চেষ্টা করুন।"
            />
          )}
        </div>
      )}

      {/* Recent Orders Quick List */}
      <div className="bg-gaming-card border border-gaming-border rounded-3xl p-6 md:p-8 shadow-glass-card space-y-6">
        <h3 className="text-lg font-bold text-white tracking-wide border-b border-gaming-border pb-4">
          Recent Mock Orders (Click to Track)
        </h3>
        <div className="space-y-3">
          {orders.slice(0, 4).map((ord) => (
            <div
              key={ord.orderId}
              onClick={() => {
                setSearchQuery(ord.orderId);
                setSearchedOrder(ord);
                setHasSearched(true);
              }}
              className="flex items-center justify-between p-4 rounded-2xl bg-[#080B14] border border-gaming-border hover:border-cyan-500/50 transition-all cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-600/20 text-cyan-400 flex items-center justify-center font-bold text-xs">
                  💎
                </div>
                <div>
                  <p className="text-sm font-bold text-white font-mono">{ord.orderId}</p>
                  <p className="text-xs text-slate-400">{ord.packageTitle} • UID: {ord.playerUid}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-white">{formatCurrency(ord.amount)}</span>
                {getStatusBadge(ord.status)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
