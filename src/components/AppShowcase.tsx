"use client";

import React from "react";
import { motion } from "framer-motion";
import { 
  Beaker, 
  Package, 
  Users, 
  FlaskConical,
  Sparkles,
  ArrowRight,
  Check,
  Zap,
  BarChart3,
  QrCode,
  Bot,
  ChevronDown,
  Calendar,
  Droplets,
  TestTube,
  Printer,
  Search,
  Filter,
  TrendingUp,
  TrendingDown,
  Activity,
  Layers,
  Settings,
  Bell,
  Plus,
  MoreHorizontal,
  CheckCircle2,
  Clock,
  AlertTriangle
} from "lucide-react";

// Premium Inoculation Logging Screen
function InoculationScreen() {
  return (
    <div className="w-full max-w-md mx-auto">
      <div className="rounded-3xl bg-gradient-to-b from-[#0f172a] to-[#0a0f1a] border border-white/[0.08] overflow-hidden shadow-2xl shadow-black/50">
        {/* Premium Header */}
        <div className="px-6 py-5 border-b border-white/[0.06] bg-gradient-to-r from-emerald-500/10 via-transparent to-transparent">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/30">
                <Beaker className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-white">New Inoculation</h3>
                <p className="text-xs text-slate-500">Log your cultivation run</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Active
              </span>
            </div>
          </div>
        </div>

        {/* Form Content */}
        <div className="p-6 space-y-5">
          {/* Date Picker */}
          <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">PC Batch Date</span>
              <Calendar className="w-4 h-4 text-slate-500" />
            </div>
            <div className="text-2xl font-bold text-white font-mono">Aug 25, 2026</div>
          </div>

          {/* Two Column Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] group hover:border-violet-500/30 transition-colors">
              <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Strain</span>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-white font-semibold">Golden Teacher</span>
                <ChevronDown className="w-4 h-4 text-slate-500 group-hover:text-violet-400 transition-colors" />
              </div>
            </div>
            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] group hover:border-cyan-500/30 transition-colors">
              <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Medium</span>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-white font-semibold">Whole Oats</span>
                <ChevronDown className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 transition-colors" />
              </div>
            </div>
          </div>

          {/* Inoculant Type */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-violet-500/10 to-fuchsia-500/10 border border-violet-500/20">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center">
                <Droplets className="w-5 h-5 text-violet-400" />
              </div>
              <div className="flex-1">
                <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Inoculant Type</span>
                <div className="text-white font-semibold">Liquid Culture (LC)</div>
              </div>
              <ChevronDown className="w-5 h-5 text-violet-400" />
            </div>
          </div>

          {/* Quantity & Volume */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
              <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Quantity</span>
              <div className="mt-2 text-3xl font-black text-white font-mono">7</div>
            </div>
            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
              <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Volume (cc/mL)</span>
              <div className="mt-2 text-3xl font-black text-cyan-400 font-mono">10</div>
            </div>
          </div>

          {/* Print Labels Toggle */}
          <div className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
            <div className="flex items-center gap-3">
              <Printer className="w-5 h-5 text-slate-400" />
              <span className="text-sm text-slate-300">Print labels on creation</span>
            </div>
            <div className="w-11 h-6 rounded-full bg-emerald-500 p-0.5 cursor-pointer">
              <div className="w-5 h-5 rounded-full bg-white shadow-lg transform translate-x-5" />
            </div>
          </div>

          {/* Submit Button */}
          <button className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-500 via-emerald-500 to-teal-500 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-xl shadow-emerald-500/30 hover:shadow-emerald-500/50 transition-all hover:-translate-y-0.5 active:translate-y-0">
            <TestTube className="w-5 h-5" />
            Create & Log Inoculation
          </button>
        </div>
      </div>
    </div>
  );
}

// Premium Inventory Screen
function InventoryScreen() {
  const supplies = [
    { name: "Whole Oats", category: "Grain", qty: "50 lbs", status: "stocked", trend: "+12%" },
    { name: "Agar Powder", category: "Media", qty: "2 kg", status: "low", trend: "-8%" },
    { name: "Quart Jars", category: "Container", qty: "144", status: "stocked", trend: "+5%" },
    { name: "Micropore Tape", category: "Supplies", qty: "12 rolls", status: "stocked", trend: "0%" },
  ];

  return (
    <div className="w-full max-w-xl mx-auto">
      <div className="rounded-3xl bg-gradient-to-b from-[#0f172a] to-[#0a0f1a] border border-white/[0.08] overflow-hidden shadow-2xl shadow-black/50">
        {/* Premium Header */}
        <div className="px-6 py-5 border-b border-white/[0.06] bg-gradient-to-r from-amber-500/10 via-transparent to-transparent">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/30">
                <Package className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-white">Inventory</h3>
                <p className="text-xs text-slate-500">Track supplies & materials</p>
              </div>
            </div>
            <button className="px-4 py-2 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white text-sm font-bold flex items-center gap-2 shadow-lg shadow-violet-500/30">
              <Plus className="w-4 h-4" />
              Add Item
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="px-6 py-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="flex-1 flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <Search className="w-4 h-4 text-slate-500" />
              <input type="text" placeholder="Search inventory..." className="bg-transparent text-sm text-white placeholder:text-slate-600 outline-none flex-1" />
            </div>
            <button className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-slate-400 hover:text-white transition-colors">
              <Filter className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Inventory List */}
        <div className="p-4 space-y-2">
          {supplies.map((item, i) => (
            <div key={i} className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.12] transition-all group">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    item.category === 'Grain' ? 'bg-amber-500/20 text-amber-400' :
                    item.category === 'Media' ? 'bg-violet-500/20 text-violet-400' :
                    item.category === 'Container' ? 'bg-cyan-500/20 text-cyan-400' :
                    'bg-slate-500/20 text-slate-400'
                  }`}>
                    <Layers className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-semibold text-white">{item.name}</div>
                    <div className="text-xs text-slate-500">{item.category}</div>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <div className="font-bold text-white font-mono">{item.qty}</div>
                    <div className={`text-xs flex items-center gap-1 ${
                      item.trend.startsWith('+') ? 'text-emerald-400' : 
                      item.trend.startsWith('-') ? 'text-red-400' : 'text-slate-500'
                    }`}>
                      {item.trend.startsWith('+') ? <TrendingUp className="w-3 h-3" /> : 
                       item.trend.startsWith('-') ? <TrendingDown className="w-3 h-3" /> : null}
                      {item.trend}
                    </div>
                  </div>
                  <div className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
                    item.status === 'stocked' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                    'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  }`}>
                    {item.status === 'stocked' ? 'In Stock' : 'Low Stock'}
                  </div>
                  <button className="p-2 rounded-lg hover:bg-white/[0.05] text-slate-500 hover:text-white transition-colors opacity-0 group-hover:opacity-100">
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Premium Dashboard Stats Screen
function DashboardStatsScreen() {
  const stats = [
    { label: "Total Containers", value: "128", color: "text-white", icon: Layers, bg: "from-slate-500/20 to-slate-600/10" },
    { label: "Ready to Inoculate", value: "24", color: "text-cyan-400", icon: CheckCircle2, bg: "from-cyan-500/20 to-cyan-600/10" },
    { label: "Contam Rate", value: "4%", color: "text-emerald-400", icon: Activity, bg: "from-emerald-500/20 to-emerald-600/10", trend: "down" },
    { label: "Total Yield", value: "1.24kg", color: "text-fuchsia-400", icon: TrendingUp, bg: "from-fuchsia-500/20 to-fuchsia-600/10" },
  ];

  const batches = [
    { id: "GT-0825-01", strain: "Golden Teacher", stage: "Colonizing", progress: 65, status: "healthy" },
    { id: "APE-0820-03", strain: "Albino PE", stage: "Fruiting", progress: 90, status: "healthy" },
    { id: "B+-0818-02", strain: "B+", stage: "Fully Colonized", progress: 100, status: "ready" },
  ];

  return (
    <div className="w-full max-w-5xl mx-auto px-4 sm:px-0">
      <div className="rounded-2xl sm:rounded-3xl bg-gradient-to-b from-[#0f172a] to-[#0a0f1a] border border-white/[0.08] overflow-hidden shadow-2xl shadow-black/50">
        {/* Premium Top Bar */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-white/[0.06] bg-gradient-to-r from-violet-500/5 via-transparent to-cyan-500/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-4">
              <div className="flex items-center gap-2">
                <span className="text-xl sm:text-2xl">🍄</span>
                <span className="font-bold text-sm sm:text-lg">
                  <span className="text-white">Sierra</span>
                  <span className="bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent"> Myco Lab</span>
                </span>
              </div>
              <div className="hidden sm:block h-6 w-px bg-white/10" />
              <div className="hidden sm:flex items-center gap-2">
                <button className="px-3 py-2 rounded-xl bg-gradient-to-r from-red-500/20 to-red-600/10 border border-red-500/30 text-red-300 text-xs font-semibold flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-400" />
                  Log Harvest
                </button>
                <button className="px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.08] text-slate-300 text-xs font-medium flex items-center gap-2">
                  <QrCode className="w-3.5 h-3.5" />
                  Scan QR
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <button className="p-2 rounded-xl bg-white/[0.03] border border-white/[0.06] text-slate-400">
                <Bell className="w-4 h-4" />
              </button>
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white text-xs font-bold">
                JD
              </div>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="p-4 sm:p-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6">
            {stats.map((stat, i) => {
              const Icon = stat.icon;
              return (
                <div key={i} className={`p-3 sm:p-5 rounded-xl sm:rounded-2xl bg-gradient-to-br ${stat.bg} border border-white/[0.06]`}>
                  <div className="flex items-start justify-between mb-2 sm:mb-3">
                    <div className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl bg-white/[0.05]">
                      <Icon className={`w-4 h-4 sm:w-5 sm:h-5 ${stat.color}`} />
                    </div>
                    {stat.trend && (
                      <span className="hidden sm:flex px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-semibold items-center gap-1">
                        <TrendingDown className="w-3 h-3" />
                        Good
                      </span>
                    )}
                  </div>
                  <div className={`text-xl sm:text-3xl font-black ${stat.color} font-mono`}>{stat.value}</div>
                  <div className="text-[10px] sm:text-xs text-slate-500 mt-1">{stat.label}</div>
                </div>
              );
            })}
          </div>

          {/* Active Batches */}
          <div className="rounded-xl sm:rounded-2xl bg-white/[0.02] border border-white/[0.06] overflow-hidden">
            <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-white/[0.06] flex items-center justify-between">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl bg-cyan-500/20">
                  <Beaker className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-cyan-400" />
                </div>
                <div>
                  <h4 className="font-semibold text-white text-sm sm:text-base">Active Batches</h4>
                  <p className="text-[10px] sm:text-xs text-slate-500 hidden sm:block">Monitor your cultivation progress</p>
                </div>
              </div>
              <button className="text-[10px] sm:text-xs text-cyan-400 flex items-center gap-1">View All <ArrowRight className="w-3 h-3" /></button>
            </div>
            <div className="divide-y divide-white/[0.04]">
              {batches.map((batch, i) => (
                <div key={i} className="px-4 sm:px-5 py-3 sm:py-4 hover:bg-white/[0.02] transition-colors">
                  <div className="flex items-center justify-between mb-2 sm:mb-0">
                    <div className="flex items-center gap-3 sm:gap-4">
                      <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 flex items-center justify-center">
                        <span className="text-base sm:text-lg">🍄</span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white text-sm sm:text-base">{batch.strain}</span>
                          <span className="hidden sm:inline px-2 py-0.5 rounded bg-white/[0.05] text-[10px] font-mono text-slate-400">{batch.id}</span>
                        </div>
                        <div className="text-[10px] sm:text-xs text-slate-500">{batch.stage}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 sm:gap-6">
                      <div className="w-20 sm:w-32">
                        <div className="flex items-center justify-between text-[10px] sm:text-xs mb-1">
                          <span className="text-slate-500 hidden sm:inline">Progress</span>
                          <span className="text-white font-mono">{batch.progress}%</span>
                        </div>
                        <div className="h-1.5 sm:h-2 rounded-full bg-white/[0.05] overflow-hidden">
                          <div 
                            className={`h-full rounded-full ${
                              batch.progress === 100 ? 'bg-gradient-to-r from-emerald-400 to-emerald-500' :
                              'bg-gradient-to-r from-violet-500 to-fuchsia-500'
                            }`}
                            style={{ width: `${batch.progress}%` }}
                          />
                        </div>
                      </div>
                      <div className={`hidden sm:block px-3 py-1.5 rounded-full text-xs font-semibold ${
                        batch.status === 'ready' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                        'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                      }`}>
                        {batch.status === 'ready' ? '✓ Ready' : '● Healthy'}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Premium Bulk PC Prep Screen
function BulkPrepScreen() {
  const stages = [
    { label: "All", count: 24, active: true },
    { label: "Prep", count: 7, active: false },
    { label: "Colonizing", count: 12, active: false },
  ];

  return (
    <div className="w-full max-w-5xl mx-auto px-4 sm:px-0">
      <div className="rounded-2xl sm:rounded-3xl bg-gradient-to-b from-[#0f172a] to-[#0a0f1a] border border-white/[0.08] overflow-hidden shadow-2xl shadow-black/50">
        {/* Premium Header */}
        <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-white/[0.06] bg-gradient-to-r from-amber-500/10 via-transparent to-transparent">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/30">
                <FlaskConical className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-white text-sm sm:text-base">Bulk Sterilization</h3>
                <p className="text-[10px] sm:text-xs text-slate-500 hidden sm:block">Prepare & track PC batches</p>
              </div>
            </div>
            <span className="px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-[9px] sm:text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              180 min
            </span>
          </div>
        </div>

        {/* Mobile: Stack, Desktop: Grid */}
        <div className="flex flex-col lg:grid lg:grid-cols-5 gap-0">
          {/* Left Panel - Prep Form */}
          <div className="lg:col-span-2 p-4 sm:p-6 border-b lg:border-b-0 lg:border-r border-white/[0.06]">
            {/* Batch Summary Card */}
            <div className="p-4 sm:p-5 rounded-xl sm:rounded-2xl bg-gradient-to-br from-amber-500/10 to-orange-500/5 border border-amber-500/20 mb-4 sm:mb-6">
              <div className="flex items-center justify-between mb-3 sm:mb-4">
                <span className="text-[10px] sm:text-xs font-medium text-slate-400 uppercase tracking-wider">Current Batch</span>
                <span className="px-2 py-1 rounded-lg bg-white/[0.05] text-[9px] sm:text-[10px] font-mono text-cyan-400">GRN20260825-001</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-2xl sm:text-3xl font-black text-white font-mono">7</div>
                  <div className="text-[10px] sm:text-xs text-slate-500">Containers</div>
                </div>
                <div>
                  <div className="text-2xl sm:text-3xl font-black text-amber-400 font-mono">8.75</div>
                  <div className="text-[10px] sm:text-xs text-slate-500">lbs needed</div>
                </div>
              </div>
            </div>

            {/* Form Fields */}
            <div className="space-y-3 sm:space-y-4">
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                <div className="p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-white/[0.02] border border-white/[0.06]">
                  <span className="text-[9px] sm:text-[10px] font-medium text-slate-500 uppercase tracking-wider">Medium</span>
                  <div className="mt-1 sm:mt-2 flex items-center justify-between">
                    <span className="text-white font-semibold text-sm sm:text-base">Whole Oats</span>
                    <ChevronDown className="w-4 h-4 text-slate-500" />
                  </div>
                </div>
                <div className="p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-white/[0.02] border border-white/[0.06]">
                  <span className="text-[9px] sm:text-[10px] font-medium text-slate-500 uppercase tracking-wider">Container</span>
                  <div className="mt-1 sm:mt-2 flex items-center justify-between">
                    <span className="text-white font-semibold text-sm sm:text-base">Quart Jar</span>
                    <ChevronDown className="w-4 h-4 text-slate-500" />
                  </div>
                </div>
              </div>

              <button className="w-full py-3 sm:py-4 rounded-xl sm:rounded-2xl bg-gradient-to-r from-emerald-500 via-emerald-500 to-teal-500 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xl shadow-emerald-500/30">
                <Printer className="w-4 h-4 sm:w-5 sm:h-5" />
                Generate Labels
              </button>
            </div>
          </div>

          {/* Right Panel - Container List */}
          <div className="lg:col-span-3 p-4 sm:p-6">
            {/* Stage Tabs */}
            <div className="flex items-center gap-2 mb-3 sm:mb-4 overflow-x-auto pb-1">
              {stages.map((stage, i) => (
                <button 
                  key={i}
                  className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-semibold whitespace-nowrap ${
                    stage.active 
                      ? 'bg-gradient-to-r from-cyan-500 to-cyan-600 text-white shadow-lg shadow-cyan-500/30' 
                      : 'bg-white/[0.03] text-slate-400'
                  }`}
                >
                  {stage.label}
                  <span className={`ml-1 px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] ${
                    stage.active ? 'bg-white/20' : 'bg-white/[0.05]'
                  }`}>
                    {stage.count}
                  </span>
                </button>
              ))}
            </div>

            {/* Container Cards */}
            <div className="space-y-2">
              {[
                { id: "GT-0825-01", strain: "Golden Teacher", stage: "Colonizing", day: 5, health: "healthy" },
                { id: "APE-0825-02", strain: "Albino PE", stage: "Prep", day: 0, health: "new" },
              ].map((item, i) => (
                <div key={i} className="p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-white/[0.02] border border-white/[0.06]">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-4 h-4 rounded border-2 border-slate-600" />
                      <div>
                        <span className="font-semibold text-white text-sm sm:text-base">{item.strain}</span>
                        <div className="text-[10px] sm:text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                          <span>{item.stage}</span>
                          {item.day > 0 && <span>• Day {item.day}</span>}
                        </div>
                      </div>
                    </div>
                    <div className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-semibold ${
                      item.health === 'healthy' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                      'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    }`}>
                      {item.health === 'healthy' ? '● Healthy' : '✦ New'}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* AI Assistant Button */}
            <div className="mt-4 sm:mt-6 flex justify-center sm:justify-end">
              <button className="px-4 sm:px-5 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white text-xs sm:text-sm font-bold flex items-center gap-2 shadow-xl shadow-violet-500/30">
                <Bot className="w-4 h-4 sm:w-5 sm:h-5" />
                Ask MycoAI
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AppShowcase() {
  return (
    <section className="py-24 sm:py-32 relative bg-[#030508] overflow-hidden">
      {/* Section glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-0 w-[600px] h-[600px] bg-gradient-to-br from-violet-500/10 to-transparent rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-gradient-to-tl from-cyan-500/10 to-transparent rounded-full blur-3xl" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
          viewport={{ once: true, margin: "-50px" }}
          className="text-center mb-20"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-violet-500/10 border border-violet-500/20 text-sm text-violet-300 mb-6">
            <Sparkles className="w-4 h-4" />
            <span>Powerful Features</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-black text-white mb-4">
            Everything You Need to{" "}
            <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-cyan-400 bg-clip-text text-transparent">
              Scale Your Operation
            </span>
          </h2>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">
            From inoculation logging to harvest tracking, our platform handles every step of your cultivation workflow.
          </p>
        </motion.div>

        {/* Feature 1: Inoculation Logging */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: [0.25, 0.1, 0.25, 1] }}
          viewport={{ once: true, margin: "-80px" }}
          className="mb-32"
        >
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 mb-4">
                <Beaker className="w-3.5 h-3.5" />
                <span>Inoculation Tracking</span>
              </div>
              <h3 className="text-2xl sm:text-3xl font-bold text-white mb-4">
                Log Every Inoculation with Precision
              </h3>
              <p className="text-slate-400 mb-6">
                Track strain lineage, sterilization batches, and inoculant sources. Our smart forms auto-generate batch codes and support QR label printing.
              </p>
              <ul className="space-y-3">
                {["Full strain & medium tracking", "PC batch integration", "Auto-generated batch codes", "One-click label printing"].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-slate-300">
                    <span className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center">
                      <Check className="w-3 h-3 text-emerald-400" />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="relative">
              <div className="absolute -inset-4 bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 rounded-3xl blur-2xl opacity-50" />
              <InoculationScreen />
            </div>
          </div>
        </motion.div>

        {/* Feature 2: Inventory Management */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: [0.25, 0.1, 0.25, 1] }}
          viewport={{ once: true, margin: "-80px" }}
          className="mb-32"
        >
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="order-2 lg:order-1 relative">
              <div className="absolute -inset-4 bg-gradient-to-r from-violet-500/20 to-fuchsia-500/20 rounded-3xl blur-2xl opacity-50" />
              <InventoryScreen />
            </div>
            <div className="order-1 lg:order-2">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-xs text-violet-300 mb-4">
                <Package className="w-3.5 h-3.5" />
                <span>Inventory Control</span>
              </div>
              <h3 className="text-2xl sm:text-3xl font-bold text-white mb-4">
                Never Run Out of Supplies Again
              </h3>
              <p className="text-slate-400 mb-6">
                Track grains, substrates, containers, and consumables. Get low-stock alerts and usage analytics to optimize your purchasing.
              </p>
              <ul className="space-y-3">
                {["Real-time stock levels", "Category organization", "Low stock alerts", "Usage analytics"].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-slate-300">
                    <span className="w-5 h-5 rounded-full bg-violet-500/20 flex items-center justify-center">
                      <Check className="w-3 h-3 text-violet-400" />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </motion.div>

        {/* Feature 3: Dashboard & Analytics */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: [0.25, 0.1, 0.25, 1] }}
          viewport={{ once: true, margin: "-80px" }}
          className="mb-32"
        >
          <div className="text-center mb-12 p-8 rounded-3xl bg-[#030508]/90 backdrop-blur-md border border-white/[0.05]">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-xs text-cyan-300 mb-4">
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Command Center</span>
            </div>
            <h3 className="text-2xl sm:text-3xl font-bold text-white mb-4">
              Your Entire Operation at a Glance
            </h3>
            <p className="text-slate-400 max-w-2xl mx-auto">
              Real-time metrics, contamination rates, yield tracking, and customer management — all in one powerful dashboard.
            </p>
          </div>
          <div className="relative">
            <div className="absolute -inset-4 bg-gradient-to-r from-cyan-500/20 via-violet-500/10 to-fuchsia-500/20 rounded-3xl blur-2xl opacity-50" />
            <DashboardStatsScreen />
          </div>
        </motion.div>

        {/* Feature 4: Bulk Prep & Labels */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: [0.25, 0.1, 0.25, 1] }}
          viewport={{ once: true, margin: "-80px" }}
        >
          <div className="text-center mb-12 p-8 rounded-3xl bg-[#030508]/90 backdrop-blur-md border border-white/[0.05]">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 mb-4">
              <QrCode className="w-3.5 h-3.5" />
              <span>Batch Processing</span>
            </div>
            <h3 className="text-2xl sm:text-3xl font-bold text-white mb-4">
              Bulk Prep with Smart Label Generation
            </h3>
            <p className="text-slate-400 max-w-2xl mx-auto">
              Prepare multiple containers at once, auto-calculate material needs, and generate QR labels for instant scanning.
            </p>
          </div>
          <div className="relative">
            <div className="absolute -inset-4 bg-gradient-to-r from-amber-500/20 to-emerald-500/20 rounded-3xl blur-2xl opacity-50" />
            <BulkPrepScreen />
          </div>
        </motion.div>
      </div>
    </section>
  );
}
