"use client";

import React from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, Globe, Sparkles } from "lucide-react";

interface RoadmapProps {
  onOpenAuth?: (tab?: "signin" | "signup") => void;
}

export default function Roadmap({ onOpenAuth }: RoadmapProps) {
  return (
    <section id="roadmap" className="py-24 sm:py-32 relative bg-[#030508] overflow-hidden">
      {/* Cosmic ambient glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-gradient-to-br from-violet-500/15 via-fuchsia-500/10 to-cyan-500/15 rounded-full blur-3xl" />
      </div>
      
      {/* Floating orbs */}
      <div className="absolute top-32 left-20 w-1.5 h-1.5 rounded-full bg-violet-400 float opacity-50" />
      <div className="absolute bottom-20 right-32 w-2 h-2 rounded-full bg-cyan-400 float opacity-40" style={{ animationDelay: '3s' }} />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-3xl p-8 sm:p-12 md:p-14 holo-border bg-gradient-to-b from-[#0c1220]/80 via-[#080e18]/60 to-transparent backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            whileInView={{ scale: 1, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1, duration: 0.5 }}
            className="w-14 sm:w-16 h-14 sm:h-16 rounded-2xl mx-auto bg-gradient-to-br from-violet-500/20 to-fuchsia-500/10 text-violet-400 border border-violet-500/30 flex items-center justify-center"
          >
            <Globe className="w-7 sm:w-8 h-7 sm:h-8" />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.12, duration: 0.6 }}
            className="mt-6 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-xs text-violet-300"
          >
            <Sparkles className="w-3 h-3" />
            <span>Shape the Future</span>
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.15, duration: 0.6 }}
            className="mt-6 text-xl sm:text-3xl md:text-4xl font-black tracking-tight text-white"
          >
            Community-Driven{" "}
            <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-cyan-400 bg-clip-text text-transparent">
              Features
            </span>
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2, duration: 0.6 }}
            className="mt-4 sm:mt-5 text-sm sm:text-base text-slate-400 max-w-xl mx-auto leading-relaxed"
          >
            Vote on the public roadmap and submit feature requests. The platform evolves with
            cultivators — not against them.
          </motion.p>

          <motion.button
            type="button"
            onClick={() => onOpenAuth?.("signup")}
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.25, duration: 0.6 }}
            className="group mt-8 sm:mt-10 inline-flex items-center gap-2 px-5 sm:px-6 py-3 sm:py-3.5 rounded-2xl bg-gradient-to-r from-violet-500/20 to-fuchsia-500/10 border border-violet-500/30 hover:border-violet-400/50 text-sm font-semibold text-white transition-all duration-300 hover:shadow-lg hover:shadow-violet-500/20"
          >
            <span>View Public Roadmap</span>
            <ArrowUpRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </motion.button>
        </motion.div>
      </div>
    </section>
  );
}
