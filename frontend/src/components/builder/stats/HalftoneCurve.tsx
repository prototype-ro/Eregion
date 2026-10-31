"use client";

import { useMemo, useState } from "react";
import { CURVE_BUCKETS, isCounted } from "@/lib/stats";
import type { DeckCardLine } from "@/lib/types";
import { Panel, Stripes, useGlow } from "./screen";

/**
 * The mana curve in the composition's ice glow: one dot per spell, stacked by mana value, larger and brighter at the base and fading
 * upward like a halftone. Lands sit below as hollow rings and a tick marks the average. Sizes were chosen in the stats graphics lab.
 */

const W = 520;
const H = 300;
const LABELS = Array.from({ length: CURVE_BUCKETS }, (_, i) => (i === CURVE_BUCKETS - 1 ? `${i}+` : String(i)));

export function HalftoneCurve({ lines, average, className }: { lines: DeckCardLine[]; average: number; className?: string }) {
  const { glow, lit: glowLit, hot: GLOW_HOT, dim: GLOW_DIM } = useGlow();
  const [hover, setHover] = useState<number | null>(null);

  const { cols, lands } = useMemo(() => {
    const buckets = new Array<number>(CURVE_BUCKETS).fill(0);
    let landCount = 0;
    for (const line of lines) {
      if (!isCounted(line.board)) continue;
      if (line.primaryType === "Land") landCount += line.quantity;
      else buckets[Math.min(Math.floor(line.manaValue), CURVE_BUCKETS - 1)] += line.quantity;
    }
    return { cols: buckets, lands: landCount };
  }, [lines]);

  const spells = cols.reduce((sum, n) => sum + n, 0);
  const max = Math.max(1, ...cols);
  const colW = Math.min(84, (W - (CURVE_BUCKETS - 1) * 18) / CURVE_BUCKETS);
  const gap = (W - CURVE_BUCKETS * colW) / (CURVE_BUCKETS - 1);
  // As many dots across as keep the tallest column inside the height, and no smaller than the width allows.
  const across = Math.max(2, Math.floor(colW / Math.max(8, H / Math.ceil(max / 3))));
  const pitch = Math.min(colW / across, H / Math.ceil(max / across));
  const top = 24;
  const base = top + H;
  const avgX = Math.min(average, CURVE_BUCKETS - 1) * (colW + gap) + colW / 2;
  const landY = base + 34;
  const perRow = Math.max(1, Math.ceil(lands / 2));
  const landPitch = Math.min(16, W / perRow);
  const height = landY + 40;

  return (
    <Panel
      title="Mana curve"
      className={className}
      right={<p className="font-mono text-[11px] tracking-[0.12em] text-muted uppercase">{`avg ${average.toFixed(2)} · ${spells} spells`}</p>}
      foot={
        hover !== null
          ? `Mana value ${LABELS[hover]} · ${cols[hover]} ${cols[hover] === 1 ? "card" : "cards"}`
          : "One dot per spell, bottom up. Lands are the rings below, the tick is the average. Hover a column."
      }
    >
      <svg
        viewBox={`0 0 ${W} ${height}`}
        className="block w-full"
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label={`Mana curve: ${cols.map((n, i) => `${n} at ${LABELS[i]}`).join(", ")}. ${lands} lands.`}
      >
        <defs>
          <Stripes id="st-curve" />
        </defs>
        {cols.map((count, i) => {
          const x0 = i * (colW + gap);
          const rows = Math.ceil(count / across);
          const on = hover === null || hover === i;
          return (
            <g key={i} onPointerEnter={() => setHover(i)}>
              <rect x={x0 - gap / 2} y={0} width={colW + gap} height={base + 24} fill="transparent" />
              <text
                x={x0 + colW / 2}
                y={top - 10}
                textAnchor="middle"
                fontSize="11"
                fontFamily="var(--font-mono), monospace"
                fill="var(--muted)"
                opacity={on ? 1 : 0.35}
              >
                {count || ""}
              </text>
              {Array.from({ length: count }, (_, k) => {
                const row = Math.floor(k / across);
                const f = rows <= 1 ? 1 : 1 - Math.pow(row / rows, 1.4);
                return (
                  <circle
                    key={k}
                    cx={x0 + (k % across) * pitch + pitch / 2 + (colW - across * pitch) / 2}
                    cy={base - row * pitch - pitch / 2}
                    r={pitch * 0.5 * (0.42 + 0.55 * f)}
                    fill={!on ? GLOW_DIM : f > 0.92 ? GLOW_HOT : glowLit(f)}
                  />
                );
              })}
              <text
                x={x0 + colW / 2}
                y={base + 18}
                textAnchor="middle"
                fontSize="11"
                fontFamily="var(--font-mono), monospace"
                fill={on ? "var(--text)" : "var(--muted)"}
              >
                {LABELS[i]}
              </text>
            </g>
          );
        })}
        <rect width={W} height={base} fill="url(#st-curve)" opacity={0.02} pointerEvents="none" />
        <line x1={0} x2={W} y1={base + 4} y2={base + 4} stroke="rgba(255,255,255,0.12)" />
        {spells > 0 && <line x1={avgX} x2={avgX} y1={base} y2={base + 9} stroke={glow()} strokeWidth="2" />}
        <text x={0} y={landY - 6} fontSize="10" fill="var(--muted)" fontFamily="var(--font-mono), monospace" letterSpacing="0.12em">
          LANDS {lands}
        </text>
        {Array.from({ length: lands }, (_, k) => (
          <circle
            key={k}
            cx={(k % perRow) * landPitch + landPitch / 2}
            cy={landY + 8 + Math.floor(k / perRow) * 16}
            r={4.8}
            fill="none"
            stroke={hover === null ? "rgba(241,243,255,0.5)" : "rgba(241,243,255,0.2)"}
            strokeWidth="1.2"
          />
        ))}
      </svg>
    </Panel>
  );
}
