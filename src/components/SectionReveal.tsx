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
    if (!sectionRef.current || !contentRef.current) return;

    const getInitialState = () => {
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
    };

    const getFinalState = () => {
      switch (direction) {
        case "left":
        case "right":
          return { x: 0, opacity: 1 };
        case "scale":
          return { scale: 1, opacity: 1 };
        default:
          return { y: 0, opacity: 1 };
      }
    };

    gsap.set(contentRef.current, getInitialState());

    const ctx = gsap.context(() => {
      gsap.to(contentRef.current, {
        ...getFinalState(),
        duration: 1.2,
        delay,
        ease: "power2.out",
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top 85%",
          end: "top 30%",
          toggleActions: "play none none none",
        },
      });
    }, sectionRef);

    return () => ctx.revert();
  }, [direction, delay]);

  return (
    <div ref={sectionRef} className={className}>
      <div ref={contentRef}>{children}</div>
    </div>
  );
}
