"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ROLES, type Role } from "./mock";

/**
 * Neo-swiss dither: the hundred cards as a field of hard square pixels. Each role owns a run of columns, an ordered
 * (Bayer) threshold decides which cells in that run are lit, and a blurred copy of the same canvas gives the bloom.
 * The panel stays dark in both themes, like a screen set into the page.
 */

const COLS = 100;
const ROWS = 9;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

const hueColor = (hue: number, plain: boolean, alpha: number) =>
  plain ? `oklch(0.7 0.02 ${hue} / ${alpha})` : `oklch(0.72 0.17 ${hue} / ${alpha})`;

export function DitherBar() {
  const [active, setActive] = useState<Role | null>(null);
  const base = useRef<HTMLCanvasElement>(null);
  const glow = useRef<HTMLCanvasElement>(null);

  const cells = useMemo(() => {
    const owner: Array<(typeof ROLES)[number]> = [];
    ROLES.forEach((role) => {
      for (let i = 0; i < role.count; i++) owner.push(role);
    });
    return owner.slice(0, COLS);
  }, []);

  useEffect(() => {
    const canvas = base.current;
    const bloom = glow.current;
    if (!canvas || !bloom) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = canvas.clientWidth;
    const size = width / COLS;
    const height = size * ROWS;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    bloom.width = Math.round(width / 6);
    bloom.height = Math.round(height / 6);
    const draw = (target: HTMLCanvasElement, scale: number) => {
      const ctx = target.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const gap = Math.max(1, size * 0.14);
      let runStart = 0;
      cells.forEach((role, col) => {
        if (cells[col - 1] !== role) runStart = col;
        const runLength = role.count;
        const on = !active || active === role.name;
        // brightness rises toward the middle of a run and toward the bottom row, so every segment reads as a lit block
        const along = (col - runStart + 0.5) / runLength;
        const swell = Math.sin(along * Math.PI);
        for (let row = 0; row < ROWS; row++) {
          const up = 1 - row / (ROWS - 1);
          const value = 0.18 + 0.85 * (1 - up) ** 1.4 * (0.55 + 0.45 * swell);
          const threshold = (BAYER[(row % 4) * 4 + (col % 4)] + 0.5) / 16;
          if (value <= threshold) continue;
          const hot = value > 0.92 && swell > 0.8;
          const alpha = on ? 1 : 0.12;
          ctx.fillStyle = hot ? `oklch(0.97 0.03 ${role.hue} / ${alpha})` : hueColor(role.hue, "plain" in role && !!role.plain, alpha);
          ctx.fillRect(col * size + gap / 2, row * size + gap / 2, size - gap, size - gap);
        }
      });
    };
    draw(canvas, dpr);
    draw(bloom, 1 / 6);
  }, [cells, active]);

  const onMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const col = Math.min(COLS - 1, Math.max(0, Math.floor(((event.clientX - rect.left) / rect.width) * COLS)));
    const role = cells[col]?.name ?? null;
    setActive((current) => (current === role ? current : role));
  };

  return (
    <div
      className="overflow-hidden rounded-[28px] border border-white/10 p-6 text-[#e8ecff]"
      style={{ background: "radial-gradient(120% 140% at 50% 120%, #1a1650 0%, #0a0a1c 55%, #05050d 100%)" }}
    >
      <div className="mb-4 flex items-baseline justify-between font-mono text-[11px] uppercase tracking-[0.18em] text-[#8f98d8]">
        <span>Composition</span>
        <span>{String(COLS).padStart(3, "0")} cards / {ROLES.length} roles</span>
      </div>

      <div
        className="relative"
        onPointerMove={onMove}
        onPointerLeave={() => setActive(null)}
        role="img"
        aria-label="One square for each card, grouped and colored by role"
      >
        <canvas ref={glow} className="pointer-events-none absolute inset-0 h-full w-full opacity-80" style={{ imageRendering: "auto" }} />
        <canvas ref={base} className="relative block w-full" style={{ aspectRatio: `${COLS} / ${ROWS}` }} />
      </div>

      <div className="mt-1 flex h-2 border-t border-[#8f98d8]/40" aria-hidden>
        {ROLES.map((role) => (
          <span key={role.name} className="border-l border-[#8f98d8]/40" style={{ flexGrow: role.count, flexBasis: 0 }} />
        ))}
      </div>

      <ol className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-[11px] uppercase tracking-[0.12em] sm:grid-cols-5">
        {ROLES.map((role, index) => (
          <li key={role.name}>
            <button
              type="button"
              onMouseEnter={() => setActive(role.name)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(role.name)}
              onBlur={() => setActive(null)}
              className={`flex w-full items-baseline gap-2 border-t border-white/10 py-1.5 text-left transition-opacity ${active && active !== role.name ? "opacity-35" : ""}`}
            >
              <span className="text-[#6c74b8]">{String(index + 1).padStart(2, "0")}</span>
              <span className="flex-1 truncate">{role.name}</span>
              <span className="tabular-nums">{role.count}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
