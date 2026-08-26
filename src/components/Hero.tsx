"use client";

import React, { useRef, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, ChevronDown, Sparkles, Play, Pause } from "lucide-react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import HeroSequence from "./HeroSequence";

gsap.registerPlugin(ScrollTrigger);

interface HeroProps {
  onOpenAuth?: (tab?: "signin" | "signup") => void;
}

export default function Hero({ onOpenAuth }: HeroProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef({ value: 0 });
  const [progress, setProgress] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  const [scrollProgress, setScrollProgress] = useState(0);
  const autoPlayRef = useRef<number | null>(null);

  // Auto-play animation loop
  useEffect(() => {
    if (!isAutoPlaying) {
      if (autoPlayRef.current) {
        cancelAnimationFrame(autoPlayRef.current);
      }
      return;
    }

    let startTime: number | null = null;
    const duration = 8000; // 8 seconds per loop

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const loopProgress = (elapsed % duration) / duration;
      
      // Ease in-out for smooth looping
      const eased = loopProgress < 0.5
        ? 2 * loopProgress * loopProgress
        : 1 - Math.pow(-2 * loopProgress + 2, 2) / 2;
      
      // Only use auto-play when not scrolling
      if (scrollProgress < 0.02) {
        setProgress(eased);
      }
      
      autoPlayRef.current = requestAnimationFrame(animate);
    };

    autoPlayRef.current = requestAnimationFrame(animate);

    return () => {
      if (autoPlayRef.current) {
        cancelAnimationFrame(autoPlayRef.current);
      }
    };
  }, [isAutoPlaying, scrollProgress]);

  // Scroll-driven animation
  useEffect(() => {
    if (!wrapperRef.current) return;

    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: wrapperRef.current,
        start: "top top",
        end: "bottom bottom",
        scrub: 0.5,
        onUpdate: (self) => {
          progressRef.current.value = self.progress;
          setScrollProgress(self.progress);
          // Override auto-play when scrolling
          if (self.progress > 0.02) {
            setProgress(self.progress);
            setIsAutoPlaying(false);
          }
        },
      });
    }, wrapperRef);

    return () => ctx.revert();
  }, []);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div ref={wrapperRef} className="relative h-[200vh] md:h-[250vh]">
      <section className="sticky top-0 h-screen w-full overflow-hidden bg-transparent">
        {/* Scroll-driven growth sequence - hidden, using MushroomBackground instead */}

        {/* Mobile: stronger overlay for readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#030508]/80 via-[#030508]/40 to-[#030508]/90 md:bg-gradient-to-r md:from-[#030508] md:via-[#030508]/50 md:to-transparent pointer-events-none" />
        
        {/* Cinematic vignette */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,#030508_75%)] pointer-events-none opacity-50" />
        
        {/* Futuristic grid overlay */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{
          backgroundImage: `linear-gradient(rgba(103,232,249,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(103,232,249,0.3) 1px, transparent 1px)`,
          backgroundSize: '60px 60px'
        }} />

        {/* Hero copy - mobile optimized */}
        <div className="relative z-10 h-full max-w-7xl mx-auto px-5 sm:px-6 lg:px-8 flex items-center">
          <div className="max-w-2xl w-full">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className="inline-flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full bg-gradient-to-r from-violet-500/10 to-cyan-500/10 backdrop-blur-xl border border-violet-500/20 text-[11px] sm:text-sm text-violet-200"
            >
              <Sparkles className="w-3.5 h-3.5 text-violet-400" />
              <span className="font-medium">AI-Powered Cultivation Intelligence</span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
              className="mt-5 sm:mt-7 text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-black tracking-tight text-white leading-[1.05]"
            >
              Master Your{" "}
              <span className="block sm:inline">
                <span className="bg-gradient-to-r from-violet-400 via-fuchsia-300 to-cyan-400 bg-clip-text text-transparent">
                  Mushroom Cultivation
                </span>
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="mt-4 sm:mt-6 text-sm sm:text-base md:text-lg text-slate-400 leading-relaxed max-w-lg"
            >
              The complete mycology workflow platform — batch lineage tracking,
              sterilization logs, yield analytics, and AI diagnostics. Cloud-synced across all devices.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="mt-6 sm:mt-10 flex flex-col sm:flex-row items-stretch sm:items-center gap-3"
            >
              <button
                onClick={() => onOpenAuth?.("signup")}
                className="group px-6 py-3.5 sm:px-7 sm:py-4 rounded-xl sm:rounded-2xl bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-500 hover:from-violet-400 hover:via-fuchsia-400 hover:to-cyan-400 text-white font-bold text-sm shadow-2xl shadow-violet-500/25 hover:shadow-violet-500/40 transition-all duration-300 transform hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2"
              >
                <span>Get Started Free</span>
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
              </button>

              <button
                onClick={() => scrollTo("features")}
                className="px-6 py-3.5 sm:py-4 rounded-xl sm:rounded-2xl bg-white/[0.03] backdrop-blur-sm border border-white/10 hover:border-violet-400/40 hover:bg-white/[0.06] text-slate-300 text-sm font-medium transition-all duration-300 flex items-center justify-center"
              >
                Explore Features
              </button>
            </motion.div>

            {/* Stats row - mobile friendly */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="mt-8 sm:mt-12 flex items-center gap-6 sm:gap-10"
            >
              <div>
                <div className="text-2xl sm:text-3xl font-black text-white">2.4K+</div>
                <div className="text-[10px] sm:text-xs text-slate-500 uppercase tracking-wider mt-0.5">Active Labs</div>
              </div>
              <div className="w-px h-10 bg-white/10" />
              <div>
                <div className="text-2xl sm:text-3xl font-black text-white">98%</div>
                <div className="text-[10px] sm:text-xs text-slate-500 uppercase tracking-wider mt-0.5">Success Rate</div>
              </div>
              <div className="w-px h-10 bg-white/10 hidden sm:block" />
              <div className="hidden sm:block">
                <div className="text-2xl sm:text-3xl font-black text-white">24/7</div>
                <div className="text-[10px] sm:text-xs text-slate-500 uppercase tracking-wider mt-0.5">AI Monitoring</div>
              </div>
            </motion.div>
          </div>
        </div>

        {/* Scroll affordance */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: scrollProgress > 0.05 ? 0 : 1 }}
          transition={{ duration: 0.3 }}
          className="absolute bottom-6 sm:bottom-10 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-1.5 sm:gap-2"
        >
          <span className="text-[9px] sm:text-[10px] font-mono uppercase tracking-[0.25em] text-slate-600">Scroll</span>
          <ChevronDown className="w-4 h-4 sm:w-5 sm:h-5 animate-bounce text-violet-400/60" />
        </motion.div>
      </section>
    </div>
  );
}
