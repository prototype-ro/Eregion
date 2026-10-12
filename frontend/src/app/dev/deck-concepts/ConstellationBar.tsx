"use client";

import { useEffect, useRef, useState } from "react";
import { ROLES, type Role } from "./mock";

/**
 * Halftone constellation: every role is a cluster with one dot per card. Dot size follows a soft field (large at the
 * core, small at the rim) the way the halftone posters do, clusters are tied together with hairline traces on a fine
 * grid, and a vertical scanline screen sits over everything. Dots breathe slowly, and the pointer pushes a ripple.
 * Always a dark screen, in both themes.
 */

type Cluster = { role: (typeof ROLES)[number]; cols: number; rows: number; x: number; y: number; w: number; h: number };

const GAP = 24;
const LABEL = 20;

function layout(width: number): { clusters: Cluster[]; height: number; pitch: number } {
  const pitch = Math.max(12, Math.min(26, width / 40));
  const items = [...ROLES].sort((a, b) => b.count - a.count).map((role) => {
    const cols = Math.max(2, Math.ceil(Math.sqrt(role.count)));
    const rows = Math.ceil(role.count / cols);
    return { role, cols, rows, w: cols * pitch, h: rows * pitch, slot: Math.max(cols * pitch, 104) };
  });
  const clusters: Cluster[] = [];
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  for (const item of items) {
    if (x > 0 && x + item.slot > width) {
      x = 0;
      y += rowHeight + GAP + LABEL;
      rowHeight = 0;
    }
    clusters.push({ role: item.role, cols: item.cols, rows: item.rows, w: item.w, h: item.h, x, y: y + LABEL });
    x += item.slot + GAP;
    rowHeight = Math.max(rowHeight, item.h);
  }
  return { clusters, height: y + LABEL + rowHeight, pitch };
}

const color = (hue: number, plain: boolean, light: number, alpha: number) =>
  plain ? `oklch(${light} 0.02 ${hue} / ${alpha})` : `oklch(${light} 0.17 ${hue} / ${alpha})`;

export function ConstellationBar() {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [scene, setScene] = useState<{ clusters: Cluster[]; height: number; pitch: number } | null>(null);
  const [active, setActive] = useState<Role | null>(null);
  const activeRef = useRef<Role | null>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);

  activeRef.current = active;

  useEffect(() => {
    const node = wrap.current;
    if (!node) return;
    const measure = () => setScene(layout(node.clientWidth));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const node = canvas.current;
    const host = wrap.current;
    if (!node || !host || !scene) return;
    const ctx = node.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const width = host.clientWidth;
    const height = scene.height;
    const { clusters, pitch } = scene;
    node.width = Math.round(width * dpr);
    node.height = Math.round(height * dpr);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // grid and traces never change, so they are drawn once into a backdrop
    const back = document.createElement("canvas");
    back.width = node.width;
    back.height = node.height;
    const bctx = back.getContext("2d");
    if (bctx) {
      bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      bctx.strokeStyle = "rgba(160,170,255,0.07)";
      bctx.beginPath();
      for (let gx = 0; gx <= width; gx += pitch) {
        bctx.moveTo(gx + 0.5, 0);
        bctx.lineTo(gx + 0.5, height);
      }
      for (let gy = 0; gy <= height; gy += pitch) {
        bctx.moveTo(0, gy + 0.5);
        bctx.lineTo(width, gy + 0.5);
      }
      bctx.stroke();
      bctx.strokeStyle = "rgba(220,226,255,0.3)";
      bctx.beginPath();
      for (let i = 1; i < clusters.length; i++) {
        const a = clusters[i - 1];
        const b = clusters[i];
        const ax = a.x + a.w / 2;
        const ay = a.y + a.h / 2;
        const bx = b.x + b.w / 2;
        const by = b.y + b.h / 2;
        const dy = by - ay;
        const bend = ax + Math.sign(bx - ax || 1) * Math.min(Math.abs(dy), Math.abs(bx - ax));
        bctx.moveTo(ax, ay);
        bctx.lineTo(bend, by === ay ? ay : ay + Math.sign(dy) * Math.abs(bend - ax));
        bctx.lineTo(bx, by);
      }
      bctx.stroke();
    }

    // per-dot constants and per-role colors, computed once
    const dots = clusters.map((cluster) => {
      const { role, cols, rows } = cluster;
      const plain = "plain" in role && !!role.plain;
      const cx = (cols - 1) / 2;
      const cy = (rows - 1) / 2;
      const reach = Math.hypot(cx, cy) + 0.8;
      const xs = new Float32Array(role.count);
      const ys = new Float32Array(role.count);
      const base = new Float32Array(role.count);
      const phase = new Float32Array(role.count);
      for (let i = 0; i < role.count; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        xs[i] = cluster.x + col * pitch + pitch / 2;
        ys[i] = cluster.y + row * pitch + pitch / 2;
        const d = Math.hypot(col - cx, row - cy) / reach;
        base[i] = 1 - d * d;
        phase[i] = col * 0.9 + row * 0.7;
      }
      return {
        name: role.name,
        count: role.count,
        xs,
        ys,
        base,
        phase,
        lit: color(role.hue, plain, 0.74, 0.95),
        hot: color(role.hue, plain, 0.95, 1),
        dim: color(role.hue, plain, 0.5, 0.14),
      };
    });

    const lines = document.createElement("canvas");
    lines.width = node.width;
    lines.height = node.height;
    const lctx = lines.getContext("2d");
    if (lctx) {
      lctx.fillStyle = "#000";
      for (let x = 0; x < lines.width; x += 3 * dpr) lctx.fillRect(x, 0, Math.max(1, dpr), lines.height);
    }

    let frame = 0;
    let visible = true;
    let last = 0;
    const TWO_PI = Math.PI * 2;

    const paint = (time: number) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, node.width, node.height);
      ctx.drawImage(back, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const focus = activeRef.current;
      const p = pointer.current;
      const reachPx = pitch * 6;
      const slow = time / 900;
      const fast = time / 160;
      for (const dot of dots) {
        const on = !focus || focus === dot.name;
        const hotPath = new Path2D();
        const litPath = new Path2D();
        for (let i = 0; i < dot.count; i++) {
          let field = dot.base[i] + 0.12 * Math.sin(slow + dot.phase[i]);
          if (p) {
            const pd = Math.hypot(dot.xs[i] - p.x, dot.ys[i] - p.y);
            if (pd < reachPx) field += 0.55 * (1 - pd / reachPx) * (0.6 + 0.4 * Math.sin(fast - pd / 9));
          }
          const radius = pitch * 0.5 * Math.min(1, Math.max(0.14, 0.2 + 0.85 * field));
          const path = field > 0.85 && on ? hotPath : litPath;
          path.moveTo(dot.xs[i] + radius, dot.ys[i]);
          path.arc(dot.xs[i], dot.ys[i], radius, 0, TWO_PI);
        }
        ctx.fillStyle = on ? dot.lit : dot.dim;
        ctx.fill(litPath);
        if (on) {
          ctx.fillStyle = dot.hot;
          ctx.fill(hotPath);
        }
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 0.16;
      ctx.drawImage(lines, 0, 0);
      ctx.globalAlpha = 1;
    };

    // 30 frames a second is plenty for a slow swell and keeps the page light
    const loop = (time: number) => {
      frame = requestAnimationFrame(loop);
      if (!visible || time - last < 33) return;
      last = time;
      paint(time);
    };
    paint(0);
    if (!reduced) frame = requestAnimationFrame(loop);
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    io.observe(node);
    const redraw = () => paint(0);
    if (reduced) host.addEventListener("pointermove", redraw);
    return () => {
      cancelAnimationFrame(frame);
      host.removeEventListener("pointermove", redraw);
      io.disconnect();
    };
  }, [scene]);

  const onMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!scene) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    pointer.current = { x, y };
    const hit = scene.clusters.find((c) => x >= c.x - GAP / 2 && x <= c.x + c.w + GAP / 2 && y >= c.y - GAP / 2 && y <= c.y + c.h + GAP / 2);
    const next = hit?.role.name ?? null;
    setActive((current) => (current === next ? current : next));
  };

  return (
    <div className="overflow-hidden rounded-[28px] border border-white/10 bg-[#0c0d12] p-6 text-[#f1f3ff]">
      <div className="mb-5 flex items-end justify-between font-sans">
        <div>
          <p className="text-[22px] font-semibold leading-none tracking-tight">Composition</p>
          <p className="mt-1.5 text-[12px] text-[#9aa1c9]">One dot for each card, one cluster for each role.</p>
        </div>
        <p className="text-right font-mono text-[11px] uppercase tracking-[0.14em] text-[#9aa1c9]">
          {active ? `${active} · ${ROLES.find((r) => r.name === active)?.count}` : "100 cards"}
        </p>
      </div>

      <div
        ref={wrap}
        className="relative"
        style={{ height: scene?.height }}
        onPointerMove={onMove}
        onPointerLeave={() => {
          pointer.current = null;
          setActive(null);
        }}
        role="img"
        aria-label="Halftone clusters, one dot per card, grouped by role"
      >
        <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
        {scene?.clusters.map((cluster) => (
          <span
            key={cluster.role.name}
            className={`pointer-events-none absolute whitespace-nowrap font-sans text-[11px] leading-none transition-opacity ${active && active !== cluster.role.name ? "opacity-25" : ""}`}
            style={{ left: cluster.x, top: cluster.y - LABEL + 2 }}
          >
            <b className="font-semibold">{cluster.role.name}</b>
            <span className="ml-1.5 font-mono text-[#9aa1c9]">{cluster.role.count}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
