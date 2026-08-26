"use client";

import React from "react";
import { motion } from "framer-motion";

export default function SiteFooter() {
  const links = [
    { label: "Features", href: "#features" },
    { label: "Pricing", href: "#pricing" },
    { label: "Roadmap", href: "#roadmap" },
  ];

  return (
    <footer className="relative bg-[#030508]/80 backdrop-blur-sm border-t border-white/[0.04] py-12 sm:py-16 overflow-hidden">
      {/* Subtle glow */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[400px] h-[200px] bg-gradient-to-t from-violet-500/5 to-transparent rounded-full blur-3xl pointer-events-none" />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6 sm:gap-8">
          <motion.div 
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="flex items-center gap-3"
          >
            <span className="text-2xl">🍄</span>
            <span className="text-base font-bold tracking-tight">
              <span className="text-white">Sierra </span>
              <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-cyan-400 bg-clip-text text-transparent">Myco Lab</span>
            </span>
          </motion.div>

          <nav className="flex items-center gap-6 sm:gap-8 text-sm text-slate-500">
            {links.map((l) => (
              <a 
                key={l.href} 
                href={l.href} 
                className="hover:text-violet-400 transition-colors duration-200"
              >
                {l.label}
              </a>
            ))}
          </nav>

          <div className="text-[10px] sm:text-[11px] font-mono text-slate-600 tracking-wide">
            © {new Date().getFullYear()} Sierra Myco Lab
          </div>
        </div>
        
        {/* Bottom tagline */}
        <div className="mt-8 sm:mt-10 pt-6 sm:pt-8 border-t border-white/[0.04] text-center">
          <p className="text-xs text-slate-600">
            Built with <span className="text-violet-400">♥</span> for cultivators worldwide
          </p>
        </div>
      </div>
    </footer>
  );
}
