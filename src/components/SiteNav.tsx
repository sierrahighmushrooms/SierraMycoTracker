"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X } from "lucide-react";

interface SiteNavProps {
  onOpenAuth?: (tab?: "signin" | "signup") => void;
}

export default function SiteNav({ onOpenAuth }: SiteNavProps) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const links = [
    { label: "Features", href: "#features" },
    { label: "Pricing", href: "#pricing" },
    { label: "Roadmap", href: "#roadmap" },
  ];

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled
          ? "bg-[#03070d]/90 backdrop-blur-2xl border-b border-white/[0.06] py-3"
          : "bg-transparent py-5"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
        <a href="#" className="flex items-center gap-3 group">
          <span className="text-2xl transition-transform duration-300 group-hover:scale-110 group-hover:rotate-12">🍄</span>
          <span className="text-base font-bold tracking-tight">
            <span className="text-white">Sierra </span>
            <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-cyan-400 bg-clip-text text-transparent">Myco Lab</span>
          </span>
        </a>

        <nav className="hidden md:flex items-center gap-10 text-sm text-slate-400">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="hover:text-violet-300 transition-colors duration-200 relative after:absolute after:bottom-[-4px] after:left-0 after:w-0 after:h-[2px] after:bg-gradient-to-r after:from-violet-400 after:to-fuchsia-400 after:transition-all after:duration-300 hover:after:w-full"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-4">
          <button 
            onClick={() => onOpenAuth?.("signin")}
            className="text-sm text-slate-400 hover:text-white px-4 py-2.5 rounded-xl transition-colors duration-200"
          >
            Sign In
          </button>
          <button
            onClick={() => onOpenAuth?.("signup")}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-500 hover:from-violet-400 hover:via-fuchsia-400 hover:to-cyan-400 text-white shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 transition-all duration-300"
          >
            Get Started Free
          </button>
        </div>

        <button
          onClick={() => setOpen(!open)}
          className="md:hidden p-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-slate-300 hover:text-white transition-colors"
          aria-label="Toggle menu"
        >
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="md:hidden bg-[#03070d]/95 backdrop-blur-xl border-b border-white/[0.06] px-6 py-6 space-y-5"
          >
            <div className="flex flex-col gap-4 text-slate-300">
              {links.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="hover:text-cyan-300 py-1.5 text-base transition-colors"
                >
                  {l.label}
                </a>
              ))}
            </div>

            <div className="pt-5 border-t border-white/[0.06] flex flex-col gap-3">
              <button 
                onClick={() => {
                  setOpen(false);
                  onOpenAuth?.("signin");
                }}
                className="w-full py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-slate-200 hover:bg-white/[0.06] transition-colors"
              >
                Sign In
              </button>
              <button
                onClick={() => {
                  setOpen(false);
                  onOpenAuth?.("signup");
                }}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-400 to-teal-300 text-black text-sm font-semibold shadow-lg shadow-cyan-500/20"
              >
                Get Started Free
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
