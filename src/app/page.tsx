"use client";

import React from "react";
import dynamic from "next/dynamic";
import SmoothScroll from "@/components/SmoothScroll";
import SiteNav from "@/components/SiteNav";
import Hero from "@/components/Hero";
import DashboardPreview from "@/components/DashboardPreview";
import Features from "@/components/Features";
import Pricing from "@/components/Pricing";
import Roadmap from "@/components/Roadmap";
import SiteFooter from "@/components/SiteFooter";
import SectionReveal from "@/components/SectionReveal";
import AppShowcase from "@/components/AppShowcase";
import AuthModal, { useAuthModal } from "@/components/AuthModal";

// Dynamic import for mushroom background
const MushroomBackground = dynamic(() => import("@/components/MushroomBackground"), {
  ssr: false,
});

export default function Home() {
  const { isOpen, defaultTab, openAuthModal, closeAuthModal } = useAuthModal();

  return (
    <SmoothScroll>
      <main className="min-h-screen bg-[#030508] text-slate-100 flex flex-col selection:bg-violet-400 selection:text-white relative">
        {/* Mushroom Background - all devices */}
        <MushroomBackground />
        
        {/* Auth Modal */}
        <AuthModal isOpen={isOpen} onClose={closeAuthModal} defaultTab={defaultTab} />
        
        <SiteNav onOpenAuth={openAuthModal} />
        <Hero onOpenAuth={openAuthModal} />
        
        <SectionReveal direction="up">
          <DashboardPreview />
        </SectionReveal>
        
        <SectionReveal direction="up" delay={0.1}>
          <Features />
        </SectionReveal>
        
        {/* App Showcase - Feature Screens */}
        <SectionReveal direction="up">
          <AppShowcase />
        </SectionReveal>
        
        <SectionReveal direction="scale">
          <Pricing onOpenAuth={openAuthModal} />
        </SectionReveal>
        
        <SectionReveal direction="up">
          <Roadmap onOpenAuth={openAuthModal} />
        </SectionReveal>
        
        <SiteFooter />
      </main>
    </SmoothScroll>
  );
}
