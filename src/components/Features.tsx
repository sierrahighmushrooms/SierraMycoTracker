"use client";

import React from "react";
import { motion } from "framer-motion";
import { Layers, Orbit, Brain, Rocket } from "lucide-react";

const features = [
  {
    icon: Layers,
    title: "Batch Tracking",
    description:
      "Full lineage from spore to harvest — G2G transfers, PC sterilization logs, stage history, and QR-labeled containers.",
    iconClass: "bg-violet-500/10 text-violet-400 border-violet-500/30",
    glowClass: "from-violet-500/10",
    hoverShadow: "group-hover:shadow-violet-500/20",
  },
  {
    icon: Brain,
    title: "AI Mycology Diagnostics",
    description:
      "The built-in MycoAI assistant identifies contamination vectors, recommends fixes, and answers cultivation questions in real time.",
    iconClass: "bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/30",
    glowClass: "from-fuchsia-500/10",
    hoverShadow: "group-hover:shadow-fuchsia-500/20",
  },
  {
    icon: Rocket,
    title: "Community-Driven Features",
    description:
      "Vote on the public roadmap and submit feature requests. The platform evolves with cultivators — not against them.",
    iconClass: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
    glowClass: "from-cyan-500/10",
    hoverShadow: "group-hover:shadow-cyan-500/20",
  },
];

export default function Features() {
  return (
    <section id="features" className="py-24 sm:py-32 relative bg-[#030508] overflow-hidden">
      {/* Cosmic ambient glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[400px] bg-gradient-to-br from-violet-500/15 to-transparent rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[300px] bg-gradient-to-tl from-cyan-500/15 to-transparent rounded-full blur-3xl" />
      </div>

      {/* Floating orbs */}
      <div className="absolute top-20 right-20 w-2 h-2 rounded-full bg-violet-400 float opacity-60" />
      <div className="absolute bottom-40 left-32 w-1.5 h-1.5 rounded-full bg-fuchsia-400 float opacity-40" style={{ animationDelay: "2s" }} />
      <div className="absolute top-1/2 right-1/3 w-1 h-1 rounded-full bg-cyan-400 float opacity-50" style={{ animationDelay: "4s" }} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-fuchsia-500/10 border border-fuchsia-500/20 text-xs text-fuchsia-300 mb-6"
          >
            <Orbit className="w-3.5 h-3.5" />
            <span>Next-Gen Cultivation Tools</span>
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="text-2xl sm:text-4xl md:text-5xl font-black tracking-tight text-white"
          >
            Everything you need to{" "}
            <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-cyan-400 bg-clip-text text-transparent">
              cultivate with confidence
            </span>
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="mt-5 text-slate-400 text-sm sm:text-base md:text-lg"
          >
            Purpose-built tools for hobbyists and commercial growers alike.
          </motion.p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6">
          {features.map((feat, i) => {
            const Icon = feat.icon;
            return (
              <motion.div
                key={feat.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                className="group relative rounded-3xl p-6 sm:p-8 bg-gradient-to-b from-white/[0.04] to-transparent border border-white/[0.06] hover:border-white/[0.15] transition-all duration-500"
              >
                {/* Hover glow */}
                <div
                  className={`absolute inset-0 rounded-3xl bg-gradient-to-b ${feat.glowClass} to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none`}
                />

                <div
                  className={`relative w-12 sm:w-14 h-12 sm:h-14 rounded-2xl flex items-center justify-center border ${feat.iconClass} transition-all duration-300 group-hover:scale-110 group-hover:shadow-lg ${feat.hoverShadow}`}
                >
                  <Icon className="w-6 sm:w-7 h-6 sm:h-7" />
                </div>

                <h3 className="relative mt-5 sm:mt-7 text-lg sm:text-xl font-bold text-white">{feat.title}</h3>
                <p className="relative mt-2 sm:mt-3 text-sm text-slate-400 leading-relaxed">{feat.description}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
