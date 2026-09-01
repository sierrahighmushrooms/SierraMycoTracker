"use client";

import React, { useEffect, useRef, useState } from "react";

const FRAME_SRCS = [
  "/images/growth/growth-1.png",
  "/images/growth/growth-2.png",
  "/images/growth/growth-3.png",
  "/images/growth/growth-4.png",
  "/images/growth/growth-5.png",
  "/images/growth/growth-6.png",
];

const smoothstep = (t: number) => t * t * (3 - 2 * t);
const BACKGROUND_OPACITY = 0.15;
const LOOP_DURATION_MS = 20000;

export default function MushroomBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imagesRef = useRef<HTMLImageElement[]>([]);
  const [ready, setReady] = useState(false);

  // Preload frames after first paint so they never block the hero render.
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const imgs = await Promise.all(
        FRAME_SRCS.map(async (src) => {
          const img = new Image();
          img.src = src;
          try {
            await img.decode();
          } catch {
            await new Promise((resolve) => {
              img.onload = resolve;
              img.onerror = resolve;
            });
          }
          return img;
        }),
      );
      if (cancelled) return;
      imagesRef.current = imgs;
      setReady(true);
    };

    const w = window as typeof window & {
      requestIdleCallback?: (cb: () => void) => number;
      cancelIdleCallback?: (h: number) => void;
    };
    const handle = w.requestIdleCallback
      ? w.requestIdleCallback(() => void load())
      : window.setTimeout(() => void load(), 200);

    return () => {
      cancelled = true;
      if (w.cancelIdleCallback) w.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
    };
  }, []);

  // Single render loop. Advances its own phase from the frame timestamp, pauses
  // when the tab is hidden, and renders one static frame under reduced-motion.
  useEffect(() => {
    if (!ready) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
    if (!ctx) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let cachedWidth = 0;
    let cachedHeight = 0;
    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (w === cachedWidth && h === cachedHeight) return;
      cachedWidth = w;
      cachedHeight = h;
      canvas.width = w;
      canvas.height = h;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize, { passive: true });

    const drawCover = (img: HTMLImageElement, w: number, h: number, alpha: number) => {
      if (!img.naturalWidth || alpha <= 0.001) return;
      const cover = Math.max(w / img.naturalWidth, h / img.naturalHeight);
      const dw = img.naturalWidth * cover;
      const dh = img.naturalHeight * cover;
      ctx.globalAlpha = alpha;
      ctx.drawImage(img, Math.round((w - dw) / 2), Math.round((h - dh) / 2), Math.round(dw), Math.round(dh));
      ctx.globalAlpha = 1;
    };

    const renderAt = (phase: number) => {
      const w = cachedWidth || window.innerWidth;
      const h = cachedHeight || window.innerHeight;
      const imgs = imagesRef.current;
      if (imgs.length === 0) return;

      const p = Math.max(0, Math.min(1, phase));
      const raw = p * (imgs.length - 1);
      const lower = Math.max(0, Math.min(Math.floor(raw), imgs.length - 1));
      const upper = Math.min(lower + 1, imgs.length - 1);
      const blend = smoothstep(raw - lower);

      ctx.fillStyle = "#030508";
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = BACKGROUND_OPACITY;
      drawCover(imgs[lower], w, h, 1);
      if (lower !== upper && blend > 0.01) drawCover(imgs[upper], w, h, blend);
      ctx.globalAlpha = 1;
    };

    let raf = 0;
    let elapsed = 0;
    let lastTs = 0;

    const tick = (timestamp: number) => {
      if (lastTs) elapsed += timestamp - lastTs;
      lastTs = timestamp;
      const loopProgress = (elapsed % LOOP_DURATION_MS) / LOOP_DURATION_MS;
      const pingPong = loopProgress < 0.5 ? loopProgress * 2 : 2 - loopProgress * 2;
      renderAt(smoothstep(smoothstep(smoothstep(pingPong))));
      raf = requestAnimationFrame(tick);
    };

    const start = () => {
      lastTs = 0;
      raf = requestAnimationFrame(tick);
    };

    if (prefersReducedMotion) {
      renderAt(0.5);
    } else {
      start();
    }

    const onVisibility = () => {
      if (prefersReducedMotion) return;
      if (document.hidden) {
        cancelAnimationFrame(raf);
      } else {
        start();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
      cancelAnimationFrame(raf);
    };
  }, [ready]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 w-full h-full z-0 pointer-events-none"
      style={{
        opacity: ready ? 1 : 0,
        transition: "opacity 1s ease-out",
        transform: "translateZ(0)",
      }}
    />
  );
}
