"use client";

import React from "react";
import { motion } from "framer-motion";
import { Check, Sparkles, Zap, Crown } from "lucide-react";

interface PricingProps {
  onOpenAuth?: (tab?: "signin" | "signup") => void;
}

export default function Pricing({ onOpenAuth }: PricingProps) {
  const freeFeatures = [
    "Unlimited container tracking",
    "QR label printing",
    "Local-first data storage",
    "Community roadmap access",
  ];

  const proFeatures = [
    "Everything in Free",
    "Real-time cloud sync",
    "Multi-device access",
    "AI diagnostics included",
    "Priority support",
  ];

  return (
    <section id="pricing" className="py-24 sm:py-32 relative bg-[#030508] overflow-hidden">
      {/* Cosmic ambient glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 right-0 w-[500px] h-[500px] bg-gradient-to-bl from-violet-500/20 via-fuchsia-500/15 to-transparent rounded-full blur-3xl animate-pulse" style={{ animationDuration: '5s' }} />
        <div className="absolute bottom-0 left-1/4 w-[400px] h-[300px] bg-gradient-to-tr from-cyan-500/15 to-transparent rounded-full blur-3xl" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        <div className="text-center max-w-3xl mx-auto mb-12 sm:mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-xs text-cyan-300 mb-6"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Launch Pricing</span>
          </motion.div>
          
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="text-2xl sm:text-4xl md:text-5xl font-black tracking-tight text-white"
          >
            Simple,{" "}
            <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-cyan-400 bg-clip-text text-transparent">
              transparent pricing
            </span>
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="mt-5 text-slate-400 text-sm sm:text-base md:text-lg"
          >
            Start free. Upgrade when your operation grows.
          </motion.p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 max-w-4xl mx-auto items-stretch">
          {/* Free */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-3xl p-6 sm:p-8 bg-gradient-to-b from-white/[0.03] to-transparent border border-white/[0.06] flex flex-col justify-between"
          >
            <div>
              <h3 className="text-lg sm:text-xl font-bold text-white">Free</h3>

              <div className="mt-4 sm:mt-6 flex items-baseline gap-2">
                <span className="text-4xl sm:text-5xl font-black font-mono text-white tracking-tight">$0</span>
                <span className="text-slate-500 text-sm font-mono">/ forever</span>
              </div>

              <ul className="mt-8 sm:mt-10 space-y-3 sm:space-y-4">
                {freeFeatures.map((item, i) => (
                  <motion.li
                    key={item}
                    initial={{ opacity: 0, x: -10 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.2 + i * 0.05 }}
                    className="flex items-center gap-3 text-sm text-slate-300"
                  >
                    <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center shrink-0">
                      <Check className="w-3 h-3" />
                    </span>
                    <span>{item}</span>
                  </motion.li>
                ))}
              </ul>
            </div>

            <div className="mt-8 sm:mt-10 pt-6 border-t border-white/[0.06]">
              <button 
                onClick={() => onOpenAuth?.("signup")}
                className="w-full py-3.5 sm:py-4 rounded-2xl bg-white/[0.04] border border-white/10 hover:border-violet-500/30 hover:bg-white/[0.06] text-white font-semibold text-sm transition-all duration-300"
              >
                Get Started Free
              </button>
            </div>
          </motion.div>

          {/* Pro */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="relative rounded-3xl p-6 sm:p-8 holo-border bg-gradient-to-b from-[#0c1220] via-[#080e18] to-[#050a10] flex flex-col justify-between"
          >
            {/* Popular badge */}
            <div className="absolute -top-3.5 sm:-top-4 right-4 sm:right-6">
              <span className="px-3 sm:px-4 py-1 sm:py-1.5 rounded-full text-[10px] sm:text-[11px] font-mono font-bold uppercase tracking-wider bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-500 text-white shadow-lg shadow-violet-500/40 flex items-center gap-1.5">
                <Crown className="w-3 h-3" />
                Most Popular
              </span>
            </div>

            <div>
              <h3 className="text-lg sm:text-xl font-bold bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">Pro</h3>

              <div className="mt-4 sm:mt-6 flex items-baseline gap-2">
                <span className="text-4xl sm:text-5xl font-black font-mono bg-gradient-to-r from-violet-400 via-fuchsia-400 to-cyan-400 bg-clip-text text-transparent tracking-tight">$6</span>
                <span className="text-slate-500 text-sm font-mono">/ month</span>
              </div>

              <ul className="mt-8 sm:mt-10 space-y-3 sm:space-y-4">
                {proFeatures.map((item, i) => (
                  <motion.li
                    key={item}
                    initial={{ opacity: 0, x: -10 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.25 + i * 0.05 }}
                    className="flex items-center gap-3 text-sm text-slate-200"
                  >
                    <span className="w-5 h-5 rounded-full bg-violet-500/20 text-violet-400 flex items-center justify-center shrink-0">
                      <Check className="w-3 h-3" />
                    </span>
                    <span className={i === 0 ? "font-semibold text-white" : ""}>{item}</span>
                  </motion.li>
                ))}
              </ul>
            </div>

            <div className="mt-8 sm:mt-10 pt-6 border-t border-white/[0.08]">
              <button 
                onClick={() => onOpenAuth?.("signup")}
                className="w-full py-3.5 sm:py-4 rounded-2xl bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-500 hover:from-violet-400 hover:via-fuchsia-400 hover:to-cyan-400 text-white font-bold text-sm shadow-xl shadow-violet-500/30 hover:shadow-violet-500/50 transition-all duration-300 transform hover:-translate-y-0.5 active:translate-y-0"
              >
                Start Pro Trial
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
