"use client";

import React from "react";
import { motion } from "framer-motion";
import { Activity, Cpu, Zap } from "lucide-react";

export default function DashboardPreview() {
  const rows = [
    {
      id: "WO-ALC-0208-01",
      name: "Whole Oats - ALC (#1/7)",
      stage: "COLONIZING",
      stageColor: "text-violet-300 bg-violet-900/50 border-violet-500/40",
    },
    {
      id: "CVG-GT-0125-03",
      name: "CVG Bulk - GT (#3/6)",
      stage: "FRUITING",
      stageColor: "text-emerald-300 bg-emerald-900/50 border-emerald-500/40",
    },
  ];

  return (
    <section className="py-24 sm:py-32 relative bg-[#030508]">
      {/* Cosmic ambient glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] bg-gradient-to-br from-violet-500/20 via-fuchsia-500/15 to-cyan-500/15 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '4s' }} />
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-xs text-violet-300 mb-4">
            <Cpu className="w-3.5 h-3.5" />
            <span>Real-time Intelligence</span>
          </div>
          <h2 className="text-2xl sm:text-4xl font-black text-white">
            Command Center <span className="text-gradient-primary">Dashboard</span>
          </h2>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-3xl holo-border bg-gradient-to-b from-[#0c1220] via-[#080e1a] to-[#050a12] shadow-2xl shadow-violet-500/10 overflow-hidden"
        >
          {/* Window bar */}
          <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-white/[0.06] bg-black/20">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#ff5f56] shadow-lg shadow-red-500/30" />
              <span className="w-3 h-3 rounded-full bg-[#ffbd2e] shadow-lg shadow-yellow-500/30" />
              <span className="w-3 h-3 rounded-full bg-[#27c93f] shadow-lg shadow-green-500/30" />
            </div>
            <div className="flex items-center gap-2">
              <Activity className="w-3 h-3 text-emerald-400 animate-pulse" />
              <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500">
                Live Dashboard
              </span>
            </div>
          </div>

          {/* Metrics */}
          <div className="p-4 sm:p-6 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="group p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-white/[0.03] to-transparent border border-white/[0.06] hover:border-violet-500/30 transition-all duration-300"
            >
              <div className="flex items-center justify-between">
                <div className="text-[10px] sm:text-[11px] font-mono uppercase tracking-wider text-slate-500">Total Containers</div>
                <Zap className="w-4 h-4 text-violet-400 opacity-50 group-hover:opacity-100 transition-opacity" />
              </div>
              <div className="mt-2 text-3xl sm:text-4xl font-black font-mono text-white tracking-tight">128</div>
              <div className="mt-1 text-[10px] text-emerald-400 font-mono">↑ 12% this week</div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.15 }}
              className="group p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-white/[0.03] to-transparent border border-white/[0.06] hover:border-fuchsia-500/30 transition-all duration-300"
            >
              <div className="text-[10px] sm:text-[11px] font-mono uppercase tracking-wider text-slate-500">Contam Rate</div>
              <div className="mt-2 text-3xl sm:text-4xl font-black font-mono text-fuchsia-400 tracking-tight drop-shadow-[0_0_20px_rgba(232,121,249,0.4)]">4%</div>
              <div className="mt-1 text-[10px] text-emerald-400 font-mono">↓ 2% improvement</div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="group p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-white/[0.03] to-transparent border border-white/[0.06] hover:border-cyan-500/30 transition-all duration-300"
            >
              <div className="text-[10px] sm:text-[11px] font-mono uppercase tracking-wider text-slate-500">Total Yield</div>
              <div className="mt-2 text-3xl sm:text-4xl font-black font-mono text-cyan-300 tracking-tight drop-shadow-[0_0_20px_rgba(34,211,238,0.4)]">1,240g</div>
              <div className="mt-1 text-[10px] text-emerald-400 font-mono">↑ 340g vs last batch</div>
            </motion.div>
          </div>

          {/* Batch rows */}
          <div className="px-4 sm:px-6 pb-6 space-y-3">
            {rows.map((row, i) => (
              <motion.div
                key={row.id}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.25 + i * 0.08 }}
                className="p-3 sm:p-4 rounded-2xl bg-gradient-to-r from-white/[0.02] to-transparent border border-white/[0.06] flex flex-wrap items-center justify-between gap-3 hover:border-violet-500/20 transition-all duration-300 group"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[10px] sm:text-xs px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg bg-violet-500/10 text-violet-300 border border-violet-500/20">
                    {row.id}
                  </span>
                  <span className="text-xs sm:text-sm text-slate-300 font-medium">{row.name}</span>
                </div>

                <span
                  className={`px-3 py-1 sm:py-1.5 rounded-full text-[10px] sm:text-[11px] font-mono font-bold uppercase tracking-wide border ${row.stageColor}`}
                >
                  {row.stage}
                </span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
