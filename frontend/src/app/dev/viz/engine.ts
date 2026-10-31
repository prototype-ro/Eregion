"use client";

import { useEffect, useRef } from "react";
import { REDUCED } from "@/lib/motion";
import { ROLE_HUES } from "./mock";

/** Clamp, lerp and the role palette shared by the canvas visuals. */

export const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const roleHue = (role: string) => ROLE_HUES[role] ?? 250;
export const isPlain = (role: string) => role === "Land";

/** The halftone colour, the same recipe the deck-concepts experiments use. */
export const dotColor = (hue: number, plain: boolean, light: number, alpha: number) =>
  plain ? `oklch(${light} 0.02 ${hue} / ${alpha})` : `oklch(${light} 0.17 ${hue} / ${alpha})`;

/** An offscreen canvas and its context, for backdrops baked once and re-blitted each frame. */
export function offscreen(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D | null } {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return { canvas, ctx: canvas.getContext("2d") };
}

export interface Scene {
  paint: (time: number) => void;
  dispose?: () => void;
}

export type Setup = (ctx: CanvasRenderingContext2D, width: number, height: number, dpr: number) => Scene;

/**
 * A canvas that runs itself. It caps the pixel ratio, rebuilds on resize, pauses off screen, keeps to 30fps for a
 * slow swell, and draws one still frame when the reader has asked for reduced motion. The painter reads live state
 * through refs, so the playhead and the pointer move without the loop restarting.
 */
export function useCanvasScene(setup: Setup, deps: unknown[]) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const setupRef = useRef(setup);
  setupRef.current = setup;

  useEffect(() => {
    const node = canvas.current;
    const wrap = host.current;
    if (!node || !wrap) return;
    const ctx = node.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let width = 0;
    let height = 0;
    const state: { scene: Scene | null } = { scene: null };
    const build = () => {
      const rect = wrap.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      node.width = Math.round(width * dpr);
      node.height = Math.round(height * dpr);
      state.scene?.dispose?.();
      state.scene = setupRef.current(ctx, width, height, dpr);
    };
    build();
    const observer = new ResizeObserver(build);
    observer.observe(wrap);
    const reduced = window.matchMedia(REDUCED).matches;
    let frame = 0;
    let last = 0;
    let visible = true;
    const loop = (time: number) => {
      frame = requestAnimationFrame(loop);
      if (!visible || time - last < 33) return;
      last = time;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      state.scene?.paint(time);
    };
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    io.observe(node);
    if (reduced) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      state.scene?.paint(0);
      state.scene?.paint(6000);
    } else {
      frame = requestAnimationFrame(loop);
    }
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      io.disconnect();
      state.scene?.dispose?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { host, canvas };
}

export interface Cluster {
  key: string;
  hue: number;
  plain: boolean;
  count: number;
  cols: number;
  rows: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

const GAP = 24;
const LABEL = 18;

/** Packs clusters left to right, wrapping rows, so a role's cards sit together like the concept posters. */
export function pack(items: Array<{ key: string; hue: number; plain: boolean; count: number }>, width: number, pitch: number): { clusters: Cluster[]; height: number } {
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  const clusters: Cluster[] = [];
  for (const item of items) {
    const cols = Math.max(2, Math.ceil(Math.sqrt(item.count)));
    const rows = Math.ceil(item.count / cols);
    const w = cols * pitch;
    const h = rows * pitch;
    const slot = Math.max(w, 104);
    if (x > 0 && x + slot > width) {
      x = 0;
      y += rowHeight + GAP + LABEL;
      rowHeight = 0;
    }
    clusters.push({ ...item, cols, rows, x, y: y + LABEL, w, h });
    x += slot + GAP;
    rowHeight = Math.max(rowHeight, h);
  }
  return { clusters, height: y + LABEL + rowHeight + 4 };
}
