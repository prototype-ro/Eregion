"use client";

import { useState } from "react";
import type { AnalysisComposition } from "@/lib/types";
import { COPPER_HOT, Panel, Stripes } from "./screen";

/**
 * One halftone disc per colour, sized by how many pips the spells ask for, and a ring sized by how many sources make that colour. A
 * ring outside its disc means the colour is covered; a dashed copper ring inside it means the mana base is short.
 */

const COLORS = [
  { key: "W", name: "White", tone: "oklch(0.93 0.05 95)" },
  { key: "U", name: "Blue", tone: "oklch(0.72 0.11 240)" },
  { key: "B", name: "Black", tone: "oklch(0.7 0.06 300)" },
  { key: "R", name: "Red", tone: "oklch(0.7 0.15 32)" },
  { key: "G", name: "Green", tone: "oklch(0.74 0.13 150)" },
] as const;

const BOX = 130;
const PITCH = 7;
const MAX_R = 52;

function Eclipse({ tone, ring, R, short }: { tone: string; ring: number; R: number; short: boolean }) {
  const c = BOX / 2;
  const dots: Array<{ x: number; y: number; r: number }> = [];
  for (let y = c - R; y <= c + R; y += PITCH) {
    for (let x = c - R; x <= c + R; x += PITCH) {
      const d = Math.hypot(x - c, y - c) / R;
      if (d <= 1) dots.push({ x, y, r: (PITCH / 2) * (1 - 0.75 * d * d) });
    }
  }
  return (
    <svg viewBox={`0 0 ${BOX} ${BOX}`} className="block w-full" aria-hidden="true">
      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={d.r} fill={tone} />
      ))}
      <rect width={BOX} height={BOX} fill="url(#st-eclipse)" opacity={0.16} />
      <circle
        cx={c}
        cy={c}
        r={Math.min(ring, c - 2)}
        fill="none"
        stroke={short ? COPPER_HOT : "rgba(241,243,255,0.7)"}
        strokeWidth={short ? 1.6 : 1.1}
        strokeDasharray={short ? "3 3" : undefined}
      />
    </svg>
  );
}

export function ColourEclipses({ composition }: { composition: AnalysisComposition }) {
  const [hover, setHover] = useState<string | null>(null);
  const present = COLORS.filter((color) => (composition.pips[color.key] ?? 0) > 0 || (composition.sources[color.key] ?? 0) > 0);
  const totalPips = present.reduce((sum, color) => sum + (composition.pips[color.key] ?? 0), 0);
  const totalSources = present.reduce((sum, color) => sum + (composition.sources[color.key] ?? 0), 0);
  const maxShare = Math.max(...present.map((color) => (composition.pips[color.key] ?? 0) / Math.max(1, totalPips)), 0.01);
  const rows = present.map((color) => {
    const pips = composition.pips[color.key] ?? 0;
    const sources = composition.sources[color.key] ?? 0;
    const share = totalPips ? pips / totalPips : 0;
    const needed = share * totalSources;
    const R = Math.max(10, MAX_R * Math.sqrt(share / maxShare));
    // The ring is the disc scaled by what the mana base makes against what the spells ask for.
    const ring = needed > 0 ? R * Math.sqrt(sources / needed) : R * 0.6;
    return {
      ...color,
      pips,
      sources,
      needed,
      R,
      ring,
      short: sources < needed - 0.5,
    };
  });
  const h = rows.find((row) => row.key === hover);
  const colorless = composition.sources.C ?? 0;

  return (
    <Panel
      title="Colour"
      right={<p className="font-mono text-[11px] tracking-[0.12em] text-muted uppercase">pips against sources</p>}
      foot={
        h
          ? `${h.name}: ${h.pips} pips ask for about ${Math.round(h.needed)} of your ${totalSources} coloured sources; you have ${h.sources}.${h.short ? ` Short by ${Math.round(h.needed - h.sources)}.` : ""}`
          : `The disc is how much the spells ask for a colour, the ring is how much the mana base makes. A ring inside its disc is short.${colorless ? ` ${colorless} colourless sources.` : ""} Median mana value ${composition.medianManaValue}.`
      }
    >
      <svg width="0" height="0" className="absolute" aria-hidden="true">
        <defs>
          <Stripes id="st-eclipse" />
        </defs>
      </svg>
      {rows.length === 0 ? (
        <p className="text-[14px] text-muted">No coloured spells yet.</p>
      ) : (
        <ul className={`grid gap-3 ${rows.length > 3 ? "grid-cols-3 sm:grid-cols-5" : "grid-cols-3"}`}>
          {rows.map((row) => (
            <li
              key={row.key}
              onPointerEnter={() => setHover(row.key)}
              onPointerLeave={() => setHover(null)}
              className={`transition-opacity ${hover && hover !== row.key ? "opacity-35" : ""}`}
              aria-label={`${row.name}: ${row.pips} pips, ${row.sources} sources, ${row.short ? `short by ${Math.round(row.needed - row.sources)}` : "covered"}`}
            >
              <Eclipse tone={row.tone} ring={row.ring} R={row.R} short={row.short} />
              <p className="mt-2 text-center text-[12px] font-semibold">{row.name}</p>
              <p className="text-center font-mono text-[11px]" style={{ color: row.short ? COPPER_HOT : undefined }}>
                <span className={row.short ? "" : "text-muted"}>{row.short ? `short ${Math.round(row.needed - row.sources)}` : "covered"}</span>
              </p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
