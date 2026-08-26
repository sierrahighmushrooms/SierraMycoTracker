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

// Consistent opacity across all devices - same as hero
const BACKGROUND_OPACITY = 0.15;

export default function MushroomBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imagesRef = useRef<HTMLImageElement[]>([]);
  const targetRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const [ready, setReady] = useState(false);

  // Auto-play animation - very slow and smooth
  useEffect(() => {
    let startTime: number | null = null;
    const duration = 20000; // 20 seconds per loop (very slow)

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const loopProgress = (elapsed % duration) / duration;
      
      // Smooth ping-pong with extra smoothing
      const pingPong = loopProgress < 0.5
        ? loopProgress * 2
        : 2 - loopProgress * 2;
      
      // Triple smoothstep for ultra-smooth transitions
      const eased = smoothstep(smoothstep(smoothstep(pingPong)));
      targetRef.current = eased;
      
      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Preload images
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
        })
      );

      if (cancelled) return;
      imagesRef.current = imgs;
      setReady(true);
    };

    load();
    return () => { cancelled = true; };
  }, []);

  // Render loop - optimized for mobile
  useEffect(() => {
    if (!ready) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
    if (!ctx) return;

    // Use 1x DPR for smoother rendering (no sub-pixel jitter)
    const dpr = 1;
    
    let cachedWidth = 0;
    let cachedHeight = 0;

    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (w === cachedWidth && h === cachedHeight) return;
      cachedWidth = w;
      cachedHeight = h;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener("resize", resize, { passive: true });

    const drawCover = (
      img: HTMLImageElement,
      w: number,
      h: number,
      scale: number,
      alpha: number
    ) => {
      if (!img.naturalWidth || alpha <= 0.001) return;

      const cover = Math.max(w / img.naturalWidth, h / img.naturalHeight) * scale;
      const dw = img.naturalWidth * cover;
      const dh = img.naturalHeight * cover;

      ctx.globalAlpha = alpha;
      ctx.drawImage(img, Math.round((w - dw) / 2), Math.round((h - dh) / 2), Math.round(dw), Math.round(dh));
      ctx.globalAlpha = 1;
    };

    let renderRaf: number;
    
    const render = () => {
      const w = cachedWidth || window.innerWidth;
      const h = cachedHeight || window.innerHeight;
      const imgs = imagesRef.current;

      // Direct use of target - no lerp jitter
      const p = Math.max(0, Math.min(1, targetRef.current));

      const raw = p * (imgs.length - 1);
      const lower = Math.max(0, Math.min(Math.floor(raw), imgs.length - 1));
      const upper = Math.min(lower + 1, imgs.length - 1);
      const blend = smoothstep(raw - lower);

      // No zoom - static scale for stability
      const scale = 1.0;

      ctx.fillStyle = "#030508";
      ctx.fillRect(0, 0, w, h);

      // Consistent opacity across all devices
      ctx.globalAlpha = BACKGROUND_OPACITY;
      drawCover(imgs[lower], w, h, scale, 1);
      if (lower !== upper && blend > 0.01) {
        drawCover(imgs[upper], w, h, scale, blend);
      }
      ctx.globalAlpha = 1;

      renderRaf = requestAnimationFrame(render);
    };

    renderRaf = requestAnimationFrame(render);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(renderRaf);
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
        willChange: "auto",
        transform: "translateZ(0)",
      }}
    />
  );
}
