"use client";

import React, { useRef, useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

interface SectionRevealProps {
  children: React.ReactNode;
  className?: string;
  direction?: "up" | "left" | "right" | "scale";
  delay?: number;
}

export default function SectionReveal({
  children,
  className = "",
  direction = "up",
  delay = 0,
}: SectionRevealProps) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const content = contentRef.current;
    if (!section || !content) return;

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (prefersReducedMotion) return; // content is already visible by default

    const fromState = (() => {
      switch (direction) {
        case "left":
          return { x: -60, opacity: 0 };
        case "right":
          return { x: 60, opacity: 0 };
        case "scale":
          return { scale: 0.92, opacity: 0 };
        default:
          return { y: 40, opacity: 0 };
      }
    })();

    const toState =
      direction === "scale"
        ? { scale: 1, opacity: 1 }
        : { x: 0, y: 0, opacity: 1 };

    const ctx = gsap.context(() => {
      // `immediateRender: false` means the element stays in its natural, visible
      // state until the ScrollTrigger fires. If ScrollTrigger never initializes
      // (JS error, edge cases), the content is still visible instead of stuck at
      // opacity: 0.
      gsap.fromTo(content, fromState, {
        ...toState,
        duration: 1.2,
        delay,
        ease: "power2.out",
        immediateRender: false,
        scrollTrigger: {
          trigger: section,
          start: "top 90%",
          toggleActions: "play none none none",
        },
      });
    }, section);

    // Safety net: if for any reason the reveal hasn't run shortly after load,
    // ensure the content is visible.
    const safety = window.setTimeout(() => {
      gsap.set(content, { opacity: 1, x: 0, y: 0, scale: 1, clearProps: "transform" });
    }, 4000);

    return () => {
      window.clearTimeout(safety);
      ctx.revert();
    };
  }, [direction, delay]);

  return (
    <div ref={sectionRef} className={className}>
      <div ref={contentRef}>{children}</div>
    </div>
  );
}
