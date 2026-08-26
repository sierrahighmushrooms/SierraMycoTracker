"use client";

import { useEffect, useRef, useState } from "react";

const FRAME_SRCS = [
  "/images/growth/growth-1.png",
  "/images/growth/growth-2.png",
  "/images/growth/growth-3.png",
  "/images/growth/growth-4.png",
  "/images/growth/growth-5.png",
  "/images/growth/growth-6.png",
];

// Smoother ease function for blending
const smoothstep = (t: number) => t * t * (3 - 2 * t);

interface HeroSequenceProps {
  /** Scroll progress target, 0 -> 1 */
  targetProgress: number;
  className?: string;
}

/**
 * Canvas-based image-sequence renderer with GSAP-compatible smooth interpolation.
 */
export default function HeroSequence({ targetProgress, className }: HeroSequenceProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imagesRef = useRef<HTMLImageElement[]>([]);
  const targetRef = useRef(0);
  const currentRef = useRef(0);
  const velocityRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const [ready, setReady] = useState(false);

  targetRef.current = targetProgress;

  // Preload and decode all frames
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
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      const { clientWidth, clientHeight } = canvas;
      canvas.width = Math.round(clientWidth * dpr);
      canvas.height = Math.round(clientHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener("resize", resize);

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
      ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
      ctx.globalAlpha = 1;
    };

    const render = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const imgs = imagesRef.current;

      // Smooth spring-like interpolation
      const target = targetRef.current;
      const current = currentRef.current;
      const diff = target - current;
      
      // Spring physics for buttery smooth motion
      const stiffness = 0.08;
      const damping = 0.85;
      
      velocityRef.current = velocityRef.current * damping + diff * stiffness;
      currentRef.current += velocityRef.current;
      
      // Snap when very close
      if (Math.abs(diff) < 0.0001 && Math.abs(velocityRef.current) < 0.0001) {
        currentRef.current = target;
        velocityRef.current = 0;
      }

      const p = Math.max(0, Math.min(1, currentRef.current));
      const raw = p * (imgs.length - 1);
      const lower = Math.max(0, Math.min(Math.floor(raw), imgs.length - 1));
      const upper = Math.min(lower + 1, imgs.length - 1);
      const blend = smoothstep(raw - lower);

      // Subtle zoom that increases with growth
      const baseScale = 1.0;
      const maxZoom = 0.15;
      const scale = baseScale + (p * maxZoom);

      ctx.fillStyle = "#03070d";
      ctx.fillRect(0, 0, w, h);

      // Draw base frame
      drawCover(imgs[lower], w, h, scale, 1);
      
      // Cross-dissolve to next frame
      if (lower !== upper) {
        drawCover(imgs[upper], w, h, scale, blend);
      }

      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);

    return () => {
      window.removeEventListener("resize", resize);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [ready]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={className}
      style={{ opacity: ready ? 1 : 0, transition: "opacity 600ms ease-out" }}
    />
  );
}
