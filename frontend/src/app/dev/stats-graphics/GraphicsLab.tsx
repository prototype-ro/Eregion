"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Panel } from "@/components/builder/stats/screen";
import { DEFAULT_STRAND } from "@/lib/artColor";
import { CARDS, LINKS, ROLES, type Card } from "../dot-concepts/mock";

/**
 * Lab for the two halftone graphics of the statistics section: the composition (every card by role, with combo threads) and the mana
 * curve. Made-up deck. Every look decision is on a control; Copy settings and paste them in chat.
 */

const STORE = "eregion-dev-stats-graphics";

interface Settings {
  /** How the hundred cards are arranged. */
  layout: "clusters" | "square" | "ring" | "strands";
  /** One glow colour, ink with glow on focus, or a hue per role. */
  colour: "glow" | "mono" | "role";
  /** "versions" follows the strand colour picked on the version timeline. */
  glow: "copper" | "teal" | "red" | "ice" | "versions";
  pitch: number;
  /** How much dots shrink away from the core; 0 keeps them all one size. */
  falloff: number;
  /** Where the core is: each group's centre, the middle of the whole shape, or nowhere. */
  field: "group" | "global" | "flat";
  halo: boolean;
  /** Opacity of the vertical line screen over the dots. */
  screen: number;
  grid: "off" | "fine" | "cross";
  frame: "none" | "brackets" | "ticks";
  labels: "inline" | "callout" | "off";
  threads: "arc" | "trace" | "straight";
  rest: "faint" | "none";
  curve: "dots" | "halftone" | "ticks" | "discs";
  curveH: number;
  lands: "rings" | "ticks" | "off";
  avg: "tick" | "line" | "off";
  counts: boolean;
  arrange: "side" | "stacked";
  /** Ring: the empty middle, in dot pitches. */
  hole: number;
  /** Ring: the gap between slices, in degrees. */
  gap: number;
  /** Ring: the smallest slice, in degrees, so a role of two or three cards still reads. */
  minSlice: number;
  /** Ring: a schematic outline around each slice, faint orbit circles, or nothing. */
  outline: "none" | "slices" | "orbits";
  /** Ring: what sits in the middle. */
  centre: "empty" | "commander" | "count";
  /** Ring: a slow radar sweep. */
  sweep: boolean;
  /** Filled dots for spells and hollow rings for lands, like parts present or empty on a schematic. */
  hollow: boolean;
  /** Ring: callouts pushed apart so they never overlap. */
  spreadLabels: boolean;
  /** Mana curve: a hue per role, or the composition's glow. */
  curveTint: "role" | "glow";
}

const CURRENT: Settings = {
  layout: "clusters",
  colour: "role",
  glow: "copper",
  pitch: 20,
  falloff: 0.8,
  field: "group",
  halo: false,
  screen: 0.16,
  grid: "fine",
  frame: "none",
  labels: "inline",
  threads: "arc",
  rest: "faint",
  curve: "dots",
  curveH: 180,
  lands: "rings",
  avg: "tick",
  counts: true,
  arrange: "side",
  hole: 2.2,
  gap: 3.4,
  minSlice: 0,
  outline: "none",
  centre: "empty",
  sweep: false,
  hollow: false,
  spreadLabels: false,
  curveTint: "role",
};

/** What was picked in round one: the Andor ring for the composition, the current dot stacks for the curve. */
const CHOSEN: Settings = {
  ...CURRENT,
  layout: "ring",
  colour: "glow",
  glow: "red",
  pitch: 15,
  field: "group",
  falloff: 0.55,
  halo: true,
  labels: "callout",
  threads: "straight",
  grid: "off",
  frame: "ticks",
  screen: 0.1,
  centre: "commander",
  spreadLabels: true,
  curveTint: "role",
  curveH: 300,
  minSlice: 14,
};

const PRESETS: Array<[string, Settings]> = [
  ["Current", CURRENT],
  ["Chosen", CHOSEN],
  [
    "Schematic",
    {
      ...CHOSEN,
      outline: "slices",
      hollow: true,
      halo: false,
      falloff: 0.35,
      gap: 6,
      hole: 3,
      centre: "count",
      curveTint: "glow",
    },
  ],
  [
    "Radar",
    {
      ...CHOSEN,
      outline: "orbits",
      sweep: true,
      hole: 3.4,
      gap: 2,
      centre: "commander",
      screen: 0.16,
    },
  ],
  [
    "Gauge",
    {
      ...CHOSEN,
      outline: "slices",
      hole: 5,
      gap: 4,
      pitch: 13,
      falloff: 0.2,
      centre: "count",
      hollow: true,
      frame: "brackets",
    },
  ],
  [
    "Copper square",
    {
      ...CURRENT,
      layout: "square",
      colour: "glow",
      glow: "copper",
      pitch: 24,
      field: "global",
      falloff: 0.75,
      halo: true,
      labels: "callout",
      threads: "trace",
      grid: "off",
      frame: "brackets",
      curve: "halftone",
      curveH: 200,
      lands: "ticks",
      avg: "line",
      arrange: "side",
    },
  ],
  [
    "Andor red",
    {
      ...CURRENT,
      layout: "ring",
      colour: "glow",
      glow: "red",
      pitch: 15,
      field: "group",
      falloff: 0.55,
      halo: true,
      labels: "callout",
      threads: "straight",
      grid: "off",
      frame: "ticks",
      curve: "ticks",
      curveH: 200,
      lands: "ticks",
      avg: "line",
      screen: 0.1,
    },
  ],
  [
    "Ice mono",
    {
      ...CURRENT,
      layout: "clusters",
      colour: "mono",
      glow: "ice",
      pitch: 22,
      falloff: 0.9,
      halo: false,
      labels: "inline",
      threads: "arc",
      grid: "cross",
      frame: "brackets",
      curve: "discs",
      lands: "rings",
      avg: "tick",
      arrange: "stacked",
    },
  ],
  [
    "Teal strands",
    {
      ...CURRENT,
      layout: "strands",
      colour: "glow",
      glow: "teal",
      pitch: 14,
      field: "flat",
      falloff: 0,
      halo: true,
      labels: "inline",
      threads: "trace",
      grid: "off",
      frame: "ticks",
      curve: "ticks",
      curveH: 220,
      lands: "ticks",
      avg: "line",
      arrange: "stacked",
    },
  ],
];

interface Glow {
  hue: number;
  c: number;
  l: number;
}

const GLOW: Record<Exclude<Settings["glow"], "versions">, Glow> = {
  copper: { hue: 50, c: 0.13, l: 0.8 },
  teal: { hue: 190, c: 0.12, l: 0.82 },
  red: { hue: 25, c: 0.21, l: 0.66 },
  ice: { hue: 250, c: 0.05, l: 0.92 },
};

/** sRGB hex to OKLCH, so a strand colour can drive the same lightness ramps as the fixed glows. */
function hexToOklch(hex: string): Glow {
  const n = parseInt(hex.slice(1), 16);
  const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => lin(v / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const q = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * q;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * q;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * q;
  // Kept a touch under the neon strand so dots at full size do not bloom into one blob.
  return {
    l: Math.min(L, 0.8),
    c: Math.min(Math.hypot(A, B), 0.2),
    hue: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360,
  };
}

/** The version timeline's strand colour: its saved pick, or its default cyan (the lab has no commander art for "auto"). */
const STRAND_KEY = "eregion-strand-color";
let strandGlow: Glow = hexToOklch(DEFAULT_STRAND);
let strandName = "Cyan, the default";

function readStrand() {
  try {
    const saved = localStorage.getItem(STRAND_KEY);
    if (saved && saved.startsWith("#")) {
      strandGlow = hexToOklch(saved);
      strandName = saved;
    } else if (saved === "auto") strandName = "auto (commander art); the lab shows the default cyan";
  } catch {}
}

const glowOf = (s: Settings): Glow => (s.glow === "versions" ? strandGlow : GLOW[s.glow]);

/* ------------------------------------------------------------------ controls */

function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Array<[T, string]>; onChange: (next: T) => void }) {
  return (
    <div>
      <p className="mb-1.5 text-xs text-muted">{label}</p>
      <div className="flex flex-wrap gap-1" role="group" aria-label={label}>
        {options.map(([key, text]) => (
          <button
            key={key}
            type="button"
            aria-pressed={value === key}
            onClick={() => onChange(key)}
            className={`min-h-8 rounded-full border px-3 text-xs transition-colors ${value === key ? "border-ink bg-ink text-bg" : "border-line text-muted hover:text-ink"}`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

function Slide({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (next: number) => void;
}) {
  return (
    <label className="grid grid-cols-[84px_1fr_44px] items-center gap-2 text-xs">
      <span className="text-muted">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="accent-[var(--accent-text)]"
      />
      <span className="text-right font-mono tabular-nums">
        {value}
        {unit}
      </span>
    </label>
  );
}

function Flag({ label, value, onChange }: { label: string; value: boolean; onChange: (next: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={value} onClick={() => onChange(!value)} className="flex items-center justify-between gap-3 text-xs">
      <span className="text-muted">{label}</span>
      <span className={`relative h-5 w-9 rounded-full border transition-colors ${value ? "border-accent-text bg-accent" : "border-line bg-surface"}`}>
        <span className={`absolute top-0.5 size-3.5 rounded-full bg-ink transition-all ${value ? "left-[18px]" : "left-0.5"}`} />
      </span>
    </button>
  );
}

function Group({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-3 border-t border-line pt-4">
      <legend className="pr-2 font-mono text-[11px] tracking-[0.14em] text-muted uppercase">{legend}</legend>
      {children}
    </fieldset>
  );
}

/* ------------------------------------------------------------------ colour */

type Kind = "lit" | "hot" | "dim";

function paint(s: Settings, card: Pick<Card, "hue" | "plain">, field: number, kind: Kind): string {
  const g = glowOf(s);
  if (s.colour === "role") {
    if (kind === "dim") return card.plain ? `oklch(0.5 0.012 ${card.hue} / 0.16)` : `oklch(0.5 0.11 ${card.hue} / 0.16)`;
    if (kind === "hot") return card.plain ? `oklch(0.94 0.015 ${card.hue})` : `oklch(0.9 0.07 ${card.hue})`;
    return card.plain ? `oklch(0.68 0.012 ${card.hue})` : `oklch(0.68 0.12 ${card.hue})`;
  }
  if (kind === "dim") return s.colour === "mono" ? "rgba(241,243,255,0.1)" : `oklch(${g.l} ${g.c} ${g.hue} / 0.12)`;
  if (kind === "hot")
    return s.colour === "mono" ? `oklch(${GLOW.copper.l} ${GLOW.copper.c} ${GLOW.copper.hue})` : `oklch(${Math.min(0.97, g.l + 0.12)} ${g.c * 0.7} ${g.hue})`;
  const light = 0.42 + 0.5 * field;
  if (s.colour === "mono") return `oklch(${light} 0 0)`;
  // Lands and the unknown take the glow at low chroma, so the shape stays one colour but the jobs still stand out.
  return `oklch(${g.l * (0.55 + 0.45 * field)} ${card.plain ? g.c * 0.25 : g.c} ${g.hue})`;
}

const glowColor = (s: Settings, alpha = 1) => {
  const g = s.colour === "mono" ? GLOW.copper : glowOf(s);
  return `oklch(${g.l} ${g.c} ${g.hue} / ${alpha})`;
};

/* ------------------------------------------------------------------ composition geometry */

interface Dot {
  id: number;
  role: string;
  x: number;
  y: number;
  /** 0 at the group's rim, 1 at its core. */
  g: number;
  r: number;
  field: number;
}

interface Label {
  role: string;
  n: number;
  x: number;
  y: number;
  /** Where a callout's leader line starts, on the shape. */
  ax?: number;
  ay?: number;
  anchor: "start" | "end";
}

interface Shape {
  dots: Dot[];
  labels: Label[];
  w: number;
  h: number;
  ring?: {
    cx: number;
    cy: number;
    r0: number;
    outer: number;
    radii: number[];
    slices: Array<{ role: string; from: number; to: number; out: number }>;
  };
}

const order = [...ROLES]
  .filter((r) => r.name !== "Lands")
  .map((r) => r.name as string)
  .concat("Lands");
const groups = order.map((name) => ({
  name,
  ids: CARDS.filter((c) => c.role === name).map((c) => c.id),
}));

function clusters(W: number, p: number, callout: boolean): Shape {
  const sorted = [...groups].sort((a, b) => b.ids.length - a.ids.length);
  const dots: Dot[] = [];
  const labels: Label[] = [];
  let x = 0;
  let y = 0;
  let rowH = 0;
  const top = callout ? 0 : 20;
  for (const grp of sorted) {
    const cols = Math.max(2, Math.ceil(Math.sqrt(grp.ids.length)));
    const rows = Math.ceil(grp.ids.length / cols);
    const slot = Math.max(cols * p, 96);
    if (x > 0 && x + slot > W) {
      x = 0;
      y += rowH + 22 + top;
      rowH = 0;
    }
    labels.push({
      role: grp.name,
      n: grp.ids.length,
      x,
      y: y + 12,
      anchor: "start",
    });
    const cx = (cols - 1) / 2;
    const cy = (rows - 1) / 2;
    const reach = Math.hypot(cx, cy) + 0.8;
    grp.ids.forEach((id, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      dots.push({
        id,
        role: grp.name,
        x: x + col * p + p / 2,
        y: y + top + row * p + p / 2,
        g: Math.hypot(col - cx, row - cy) / reach,
        r: 0,
        field: 0,
      });
    });
    x += slot + 20;
    rowH = Math.max(rowH, rows * p);
  }
  return { dots, labels, w: W, h: y + top + rowH + 4 };
}

/** Group centres, for the group field and callouts. */
function centres(dots: Dot[]) {
  const out = new Map<string, { x: number; y: number; reach: number; right: number }>();
  for (const grp of groups) {
    const own = dots.filter((d) => d.role === grp.name);
    if (!own.length) continue;
    const x = own.reduce((s, d) => s + d.x, 0) / own.length;
    const y = own.reduce((s, d) => s + d.y, 0) / own.length;
    out.set(grp.name, {
      x,
      y,
      reach: Math.max(1, ...own.map((d) => Math.hypot(d.x - x, d.y - y))),
      right: Math.max(...own.map((d) => d.x)),
    });
  }
  return out;
}

/** Callout labels in a column beside the shape, spread so they never overlap, with a leader line back to their group. */
function calloutColumn(dots: Dot[], x: number, anchor: "start" | "end"): Label[] {
  const c = centres(dots);
  const items = groups
    .filter((g) => c.has(g.name))
    .map((g) => ({
      role: g.name,
      n: g.ids.length,
      ax: c.get(g.name)!.right + 8,
      ay: c.get(g.name)!.y,
    }))
    .sort((a, b) => a.ay - b.ay);
  let last = -Infinity;
  return items.map((item) => {
    const y = Math.max(item.ay, last + 17);
    last = y;
    return { ...item, x, y, anchor };
  });
}

function square(p: number): Shape {
  const cols = 10;
  const dots: Dot[] = [];
  let i = 0;
  for (const grp of groups) {
    for (const id of grp.ids) {
      dots.push({
        id,
        role: grp.name,
        x: (i % cols) * p + p / 2,
        y: Math.floor(i / cols) * p + p / 2,
        g: 0,
        r: 0,
        field: 0,
      });
      i++;
    }
  }
  const c = centres(dots);
  for (const d of dots) {
    const k = c.get(d.role)!;
    d.g = Math.hypot(d.x - k.x, d.y - k.y) / (k.reach + p * 0.6);
  }
  const side = cols * p;
  const labels = calloutColumn(dots, side + 40, "start");
  const h = Math.max(Math.ceil(i / cols) * p, (labels.at(-1)?.y ?? 0) + 10);
  return { dots, labels, w: side + 190, h };
}

function ring(s: Settings): Shape {
  const p = s.pitch;
  const total = CARDS.length;
  const r0 = p * s.hole;
  const gap = (s.gap * Math.PI) / 180;
  const dots: Dot[] = [];
  let a0 = -Math.PI / 2;
  let outer = r0;
  let maxK = 0;
  const spans: Array<{
    role: string;
    n: number;
    from: number;
    to: number;
    mid: number;
    out: number;
  }> = [];
  // Each slice is its share of the cards, but never under the minimum; the rest shrink to make room.
  const min = (s.minSlice * Math.PI) / 180;
  const shares = groups.map((grp) => Math.max(min, (Math.PI * 2 * grp.ids.length) / total));
  const scale = (Math.PI * 2) / shares.reduce((sum, a) => sum + a, 0);
  for (const [gi, grp] of groups.entries()) {
    const span = shares[gi] * scale;
    const from = a0 + gap / 2;
    const to = a0 + Math.max(span - gap / 2, gap / 2 + 0.001);
    let placed = 0;
    let k = 0;
    let groupOuter = r0;
    while (placed < grp.ids.length) {
      const radius = r0 + k * p;
      const slots = Math.max(1, Math.floor(((to - from) * radius) / p));
      const take = Math.min(slots, grp.ids.length - placed);
      for (let j = 0; j < take; j++) {
        const a = take === 1 ? (from + to) / 2 : from + ((j + 0.5) / slots) * (to - from) + ((slots - take) / slots) * (to - from) * 0.5;
        const id = grp.ids[placed + j];
        dots.push({
          id,
          role: grp.name,
          x: radius * Math.cos(a),
          y: radius * Math.sin(a),
          g: k,
          r: 0,
          field: 0,
        });
      }
      placed += take;
      groupOuter = radius;
      k++;
    }
    maxK = Math.max(maxK, k);
    for (const d of dots) if (d.role === grp.name) d.g = k <= 1 ? 0 : d.g / (k - 1);
    spans.push({
      role: grp.name,
      n: grp.ids.length,
      from,
      to,
      mid: (from + to) / 2,
      out: groupOuter,
    });
    outer = Math.max(outer, groupOuter);
    a0 += span;
  }
  const R = outer + 70;
  const cx = R + 60;
  for (const d of dots) {
    d.x += cx;
    d.y += R;
  }
  const raw: Label[] = spans.map((sp) => ({
    role: sp.role,
    n: sp.n,
    x: cx + (outer + 30) * Math.cos(sp.mid),
    y: R + (outer + 22) * Math.sin(sp.mid),
    ax: cx + (sp.out + p * 0.7) * Math.cos(sp.mid),
    ay: R + (sp.out + p * 0.7) * Math.sin(sp.mid),
    anchor: Math.cos(sp.mid) < -0.1 ? "end" : "start",
  }));
  const spread = (items: Label[]) => {
    const sorted = [...items].sort((a, b) => a.y - b.y);
    for (let i = 1; i < sorted.length; i++) sorted[i].y = Math.max(sorted[i].y, sorted[i - 1].y + 13);
    return sorted;
  };
  const labels = s.spreadLabels ? [...spread(raw.filter((l) => l.anchor === "start")), ...spread(raw.filter((l) => l.anchor === "end"))] : raw;
  const h = Math.max(2 * R, ...labels.map((l) => l.y + 8));
  return {
    dots,
    labels,
    w: 2 * cx,
    h,
    ring: {
      cx,
      cy: R,
      r0,
      outer,
      radii: Array.from({ length: maxK }, (_, k) => r0 + k * p),
      slices: spans.map(({ role, from, to, out }) => ({ role, from, to, out })),
    },
  };
}

/** A slice of a ring between two radii, from angle a0 to a1 (radians), around (cx, cy). */
function annular(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): string {
  const pt = (r: number, a: number) => `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${pt(r1, a0)} A ${r1} ${r1} 0 ${large} 1 ${pt(r1, a1)} L ${pt(r0, a1)} A ${r0} ${r0} 0 ${large} 0 ${pt(r0, a0)} Z`;
}

function strands(W: number, p: number): Shape {
  const dots: Dot[] = [];
  const labels: Label[] = [];
  const left = 130;
  const perRow = Math.max(8, Math.floor((W - left - 40) / p));
  let y = 0;
  for (const grp of [...groups].sort((a, b) => b.ids.length - a.ids.length)) {
    const rows = Math.ceil(grp.ids.length / perRow);
    labels.push({
      role: grp.name,
      n: grp.ids.length,
      x: 0,
      y: y + p / 2 + 4,
      anchor: "start",
    });
    grp.ids.forEach((id, i) => {
      dots.push({
        id,
        role: grp.name,
        x: left + (i % perRow) * p + p / 2,
        y: y + Math.floor(i / perRow) * p + p / 2,
        g: grp.ids.length <= 1 ? 0 : (i % perRow) / Math.max(1, Math.min(perRow, grp.ids.length) - 1),
        r: 0,
        field: 0,
      });
    });
    y += rows * p + 8;
  }
  return { dots, labels, w: W, h: y };
}

function shapeOf(s: Settings, W: number): Shape {
  const shape =
    s.layout === "square" ? square(s.pitch) : s.layout === "ring" ? ring(s) : s.layout === "strands" ? strands(W, s.pitch) : clusters(W, s.pitch, false);
  const minX = Math.min(...shape.dots.map((d) => d.x));
  const maxX = Math.max(...shape.dots.map((d) => d.x));
  const minY = Math.min(...shape.dots.map((d) => d.y));
  const maxY = Math.max(...shape.dots.map((d) => d.y));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const reach = Math.max(1, Math.hypot(maxX - cx, maxY - cy));
  for (const d of shape.dots) {
    const local = 1 - d.g * d.g;
    const global = 1 - Math.pow(Math.hypot(d.x - cx, d.y - cy) / reach, 2);
    d.field = s.field === "flat" ? 1 : s.field === "global" ? global : local;
    d.r = (s.pitch / 2) * Math.max(0.15, Math.min(1, 1 - s.falloff * (1 - Math.max(0, d.field)) * 0.85));
  }
  return shape;
}

/* ------------------------------------------------------------------ composition */

function thread(s: Settings, a: Dot, b: Dot): string {
  if (s.threads === "straight") return `M${a.x} ${a.y} L${b.x} ${b.y}`;
  if (s.threads === "trace") {
    // A circuit trace: up and out, a 45 degree corner, then across.
    const lift = Math.max(14, s.pitch);
    const top = Math.min(a.y, b.y) - lift;
    const dx = Math.sign(b.x - a.x || 1) * Math.min(lift / 2, Math.abs(b.x - a.x) / 2);
    return `M${a.x} ${a.y} L${a.x} ${top + Math.abs(dx)} L${a.x + dx} ${top} L${b.x - dx} ${top} L${b.x} ${top + Math.abs(dx)} L${b.x} ${b.y}`;
  }
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  return `M${a.x} ${a.y} Q${mx} ${my - Math.max(48, Math.min(120, len * 0.35))} ${b.x} ${b.y}`;
}

function Frame({ s, children }: { s: Settings; children: ReactNode }) {
  const c = glowColor(s, 0.8);
  return (
    <div className="relative">
      {s.frame === "brackets" &&
        [
          "-left-2 -top-2 border-t border-l",
          "-right-2 -top-2 border-t border-r",
          "-left-2 -bottom-2 border-b border-l",
          "-right-2 -bottom-2 border-b border-r",
        ].map((place) => <span key={place} className={`pointer-events-none absolute size-4 ${place}`} style={{ borderColor: c }} aria-hidden="true" />)}
      {s.frame === "ticks" && (
        <svg viewBox="0 0 200 6" preserveAspectRatio="none" className="mb-3 block h-2 w-full" aria-hidden="true">
          {Array.from({ length: 100 }, (_, i) => (
            <rect key={i} x={i * 2} y={0} width={1} height={6} fill={i < CARDS.filter((card) => !card.land).length ? c : "rgba(241,243,255,0.15)"} />
          ))}
        </svg>
      )}
      {children}
    </div>
  );
}

function Composition({ s, W }: { s: Settings; W: number }) {
  const shape = useMemo(() => shapeOf(s, W), [s, W]);
  const [hover, setHover] = useState<number | null>(null);
  const byId = useMemo(() => new Map(shape.dots.map((d) => [d.id, d])), [shape]);
  const combos = LINKS.filter((l) => l.kind === "combo");
  const active = hover === null ? [] : combos.filter((l) => l.ids.includes(hover));
  const activeIds = new Set(active.flatMap((l) => l.ids));
  const hoverRole = hover === null ? null : CARDS[hover].role;
  const focus = (id: number) => (hover === null ? null : activeIds.size ? activeIds.has(id) : CARDS[id].role === hoverRole);
  const pad = s.layout === "clusters" ? 0 : 8;
  const vbW = shape.w;
  const vbH = shape.h + pad * 2;
  const glowLine = glowColor(s);
  const ring = s.layout === "ring" ? shape.ring : undefined;
  const restThreads = hover === null && s.rest === "faint" ? combos : [];

  const threads = (list: typeof combos, strong: boolean) =>
    list.flatMap((l) =>
      l.ids.slice(0, -1).map((id, i) => {
        const d = thread(s, byId.get(id)!, byId.get(l.ids[i + 1])!);
        return (
          <g key={`${l.name}-${id}-${strong}`}>
            {strong && <path d={d} fill="none" stroke={glowColor(s, 0.25)} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />}
            <path
              d={d}
              fill="none"
              stroke={glowLine}
              strokeOpacity={strong ? 1 : 0.45}
              strokeWidth={strong ? 1.6 : 1}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        );
      }),
    );

  const card = hover === null ? null : CARDS[hover];
  const foot = card
    ? active.length
      ? `${card.name} · ${active
          .map(
            (l) =>
              `${l.name} with ${l.ids
                .filter((id) => id !== card.id)
                .map((id) => CARDS[id].name)
                .join(" + ")}`,
          )
          .join(" · ")}`
      : `${card.name} · ${card.role} · ${CARDS.filter((c) => c.role === card.role).length} cards`
    : `${combos.length} combos in the deck. Hover a dot to follow its threads.`;

  return (
    <Panel
      title="Composition"
      right={<p className="font-mono text-[11px] tracking-[0.12em] text-muted uppercase">{CARDS.length} cards</p>}
      foot={foot}
      className="h-full"
    >
      <Frame s={s}>
        <svg
          viewBox={`0 ${-pad} ${vbW} ${vbH}`}
          className="mx-auto block w-full"
          style={{ maxHeight: s.layout === "ring" ? 520 : undefined }}
          onPointerLeave={() => setHover(null)}
          role="img"
          aria-label="Every card by role, with combo threads"
        >
          <defs>
            <pattern id="lab-screen" width="3" height="3" patternUnits="userSpaceOnUse">
              <rect width="1" height="3" fill="#000" />
            </pattern>
            <pattern id="lab-grid" width={s.pitch} height={s.pitch} patternUnits="userSpaceOnUse">
              {s.grid === "fine" && <path d={`M${s.pitch} 0 V${s.pitch} M0 ${s.pitch} H${s.pitch}`} stroke="rgba(160,170,255,0.07)" fill="none" />}
              {s.grid === "cross" && (
                <path
                  d={`M${s.pitch - 2} ${s.pitch} H${s.pitch + 2} M${s.pitch} ${s.pitch - 2} V${s.pitch + 2} M-2 0 H2 M0 -2 V2`}
                  stroke="rgba(160,170,255,0.25)"
                  fill="none"
                />
              )}
            </pattern>
          </defs>
          {s.grid !== "off" && <rect x={0} y={-pad} width={vbW} height={vbH} fill="url(#lab-grid)" />}
          {ring &&
            s.outline === "orbits" &&
            ring.radii.map((r) => <circle key={r} cx={ring.cx} cy={ring.cy} r={r} fill="none" stroke={glowColor(s, 0.12)} strokeDasharray="1 3" />)}
          {ring &&
            s.outline === "slices" &&
            ring.slices.map((sl) => {
              const lit = hover === null || (activeIds.size ? false : sl.role === hoverRole);
              return (
                <path
                  key={sl.role}
                  d={annular(ring.cx, ring.cy, ring.r0 - s.pitch * 0.7, sl.out + s.pitch * 0.7, sl.from, sl.to)}
                  fill={lit && hover !== null ? glowColor(s, 0.06) : "none"}
                  stroke={glowColor(s, lit ? 0.7 : 0.25)}
                  strokeWidth={1}
                  strokeLinejoin="round"
                />
              );
            })}
          {ring && s.sweep && (
            <g
              className="origin-center animate-[spin_9s_linear_infinite] motion-reduce:animate-none"
              style={{
                transformOrigin: `${ring.cx}px ${ring.cy}px`,
                transformBox: "view-box",
              }}
              aria-hidden="true"
            >
              {Array.from({ length: 12 }, (_, i) => (
                <path
                  key={i}
                  d={annular(ring.cx, ring.cy, ring.r0 * 0.6, ring.outer + s.pitch, -Math.PI / 2 - (i + 1) * 0.05, -Math.PI / 2 - i * 0.05)}
                  fill={glowColor(s, 0.16 * (1 - i / 12))}
                />
              ))}
              <line x1={ring.cx} y1={ring.cy - ring.r0 * 0.6} x2={ring.cx} y2={ring.cy - ring.outer - s.pitch} stroke={glowColor(s, 0.9)} strokeWidth="1.2" />
            </g>
          )}

          {s.labels !== "off" &&
            shape.labels.map((l) => {
              const dimmed = hover !== null && (activeIds.size ? true : l.role !== hoverRole);
              const callout = l.ax !== undefined && s.labels === "callout";
              if (l.ax !== undefined && s.labels === "inline") return null;
              return (
                <g key={l.role} opacity={dimmed ? 0.35 : 1}>
                  {callout && (
                    <path d={`M${l.ax} ${l.ay} L${l.anchor === "start" ? l.x - 6 : l.x + 6} ${l.y - 4}`} stroke="rgba(241,243,255,0.25)" fill="none" />
                  )}
                  {callout && <circle cx={l.ax} cy={l.ay} r={1.6} fill="rgba(241,243,255,0.5)" />}
                  <text x={l.x} y={l.y} textAnchor={l.anchor} fontSize={callout ? 9 : 11} fill="var(--text)">
                    <tspan fontWeight="600" fontFamily={callout ? "var(--font-mono), monospace" : undefined} letterSpacing={callout ? "0.08em" : undefined}>
                      {callout ? l.role.toUpperCase() : l.role}
                    </tspan>
                    <tspan dx="6" fill="var(--muted)" fontFamily="var(--font-mono), monospace">
                      {l.n}
                    </tspan>
                  </text>
                </g>
              );
            })}

          {s.halo &&
            shape.dots.map((d) => {
              const f = focus(d.id);
              if (f === false || (f === null && d.field < 0.8)) return null;
              return (
                <circle
                  key={`h${d.id}`}
                  cx={d.x}
                  cy={d.y}
                  r={d.r * 2.1}
                  fill={f ? glowColor(s, 0.16) : paint(s, CARDS[d.id], d.field, "lit")}
                  opacity={f ? 1 : 0.1}
                />
              );
            })}
          {shape.dots.map((d) => {
            const f = focus(d.id);
            const kind: Kind = f === false ? "dim" : f ? "hot" : s.colour === "role" && d.field > 0.9 ? "hot" : "lit";
            const r = f ? Math.max(d.r, s.pitch * 0.4) : d.r;
            if (s.hollow && CARDS[d.id].land)
              return (
                <circle
                  key={d.id}
                  cx={d.x}
                  cy={d.y}
                  r={Math.max(1.5, r - 1)}
                  fill="none"
                  stroke={paint(s, CARDS[d.id], Math.max(d.field, 0.7), kind)}
                  strokeWidth={1.1}
                />
              );
            return <circle key={d.id} cx={d.x} cy={d.y} r={r} fill={paint(s, CARDS[d.id], d.field, kind)} />;
          })}
          {ring && s.centre === "commander" && (
            <g>
              <circle cx={ring.cx} cy={ring.cy} r={s.pitch * 1.4} fill={glowColor(s, 0.14)} />
              <circle cx={ring.cx} cy={ring.cy} r={s.pitch * 0.75} fill={paint(s, { hue: glowOf(s).hue, plain: false }, 1, "hot")} />
              <text
                x={ring.cx}
                y={ring.cy + s.pitch * 0.75 + 12}
                textAnchor="middle"
                fontSize="8"
                fontFamily="var(--font-mono), monospace"
                letterSpacing="0.1em"
                fill="var(--muted)"
              >
                KAALIA
              </text>
            </g>
          )}
          {ring && s.centre === "count" && (
            <g>
              <text
                x={ring.cx}
                y={ring.cy + 4}
                textAnchor="middle"
                fontSize={Math.min(34, ring.r0 * 0.8)}
                fontWeight="500"
                fill="var(--text)"
                letterSpacing="-0.04em"
              >
                {CARDS.filter((c) => !c.land).length}
              </text>
              <text
                x={ring.cx}
                y={ring.cy + 18}
                textAnchor="middle"
                fontSize="8"
                fontFamily="var(--font-mono), monospace"
                letterSpacing="0.12em"
                fill="var(--muted)"
              >
                SPELLS
              </text>
            </g>
          )}
          {s.screen > 0 && <rect x={0} y={-pad} width={vbW} height={vbH} fill="url(#lab-screen)" opacity={s.screen} pointerEvents="none" />}
          {threads(restThreads, false)}
          {threads(active, true)}
          {[...activeIds].map((id) => {
            const d = byId.get(id)!;
            return <circle key={`ring${id}`} cx={d.x} cy={d.y} r={s.pitch * 0.4 + 3.5} fill="none" stroke={glowLine} strokeWidth="1.4" />;
          })}
          {shape.dots.map((d) => (
            <circle key={`hit${d.id}`} cx={d.x} cy={d.y} r={s.pitch / 2} fill="transparent" onPointerEnter={() => setHover(d.id)} />
          ))}
        </svg>
      </Frame>
    </Panel>
  );
}

/* ------------------------------------------------------------------ curve */

const MVS = ["0", "1", "2", "3", "4", "5", "6+"];

function Curve({ s: own, W }: { s: Settings; W: number }) {
  // The curve can keep a hue per role while the composition glows in one colour.
  const s: Settings = own.curveTint === "role" ? { ...own, colour: "role" } : own.colour === "role" ? { ...own, colour: "glow" } : own;
  const [hover, setHover] = useState<number | null>(null);
  const spells = CARDS.filter((c) => !c.land);
  const lands = CARDS.filter((c) => c.land);
  const cols = MVS.map((_, i) => spells.filter((c) => Math.min(6, c.cmc) === i).sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role)));
  const max = Math.max(...cols.map((c) => c.length));
  const colW = Math.min(84, (W - 6 * 18) / 7);
  const gap = (W - 7 * colW) / 6;
  const top = s.counts ? 24 : 8;
  const H = s.curveH;
  const base = top + H;
  const avg = spells.reduce((sum, c) => sum + c.cmc, 0) / spells.length;
  const avgX = Math.min(avg, 6) * (colW + gap) + colW / 2;
  const landY = base + 34;
  const height = s.lands === "off" ? base + 30 : landY + (s.lands === "rings" ? 40 : 26);
  const glowLine = glowColor(s);
  const tone = { hue: glowOf(s).hue, plain: false };

  const column = (col: Card[], i: number) => {
    const x0 = i * (colW + gap);
    const on = hover === null || hover === i;
    const share = col.length / max;
    const kindOf = (f: number): Kind => (!on ? "dim" : f > 0.92 ? "hot" : "lit");
    if (s.curve === "halftone") {
      const pitch = 6;
      const h = share * H;
      const out: ReactNode[] = [];
      for (let y = 0; y < h; y += pitch) {
        const f = 1 - y / H;
        for (let x = pitch / 2; x < colW; x += pitch) {
          out.push(
            <circle
              key={`${x}-${y}`}
              cx={x0 + x}
              cy={base - y - pitch / 2}
              r={(pitch / 2) * (0.35 + 0.6 * f)}
              fill={paint(s, s.colour === "role" ? (col[0] ?? tone) : tone, f, kindOf(y + pitch >= h ? 1 : f))}
            />,
          );
        }
      }
      return out;
    }
    if (s.curve === "ticks") {
      const step = Math.min(8, H / max);
      return col.map((c, k) => (
        <rect
          key={c.id}
          x={x0}
          y={base - (k + 1) * step + 1}
          width={colW}
          height={Math.max(1.5, step - 3)}
          rx={1}
          fill={paint(s, s.colour === "role" ? c : tone, 1 - k / max, k === col.length - 1 && on ? "hot" : kindOf(0.8))}
        />
      ));
    }
    if (s.curve === "discs") {
      const R = (colW / 2) * Math.sqrt(share);
      const cy = base - colW / 2;
      const out: ReactNode[] = [];
      const pitch = 5;
      for (let y = -R; y <= R; y += pitch) {
        for (let x = -R; x <= R; x += pitch) {
          const d = Math.hypot(x, y) / Math.max(1, R);
          if (d <= 1)
            out.push(
              <circle key={`${x}-${y}`} cx={x0 + colW / 2 + x} cy={cy + y} r={(pitch / 2) * (1 - 0.7 * d * d)} fill={paint(s, tone, 1 - d, kindOf(1 - d))} />,
            );
        }
      }
      return out;
    }
    const across = Math.max(2, Math.floor(colW / Math.max(8, H / Math.ceil(max / 3))));
    const p = Math.min(colW / across, H / Math.ceil(max / across));
    const rows = Math.ceil(col.length / across);
    return col.map((c, k) => {
      const row = Math.floor(k / across);
      const f = rows <= 1 ? 1 : 1 - Math.pow(row / rows, 1.4);
      return (
        <circle
          key={c.id}
          cx={x0 + (k % across) * p + p / 2 + (colW - across * p) / 2}
          cy={base - row * p - p / 2}
          r={p * 0.5 * (0.42 + 0.55 * f)}
          fill={paint(s, s.colour === "role" ? c : tone, f, kindOf(f))}
        />
      );
    });
  };

  return (
    <Panel
      title="Mana curve"
      right={<p className="font-mono text-[11px] tracking-[0.12em] text-muted uppercase">{`avg ${avg.toFixed(2)} · ${spells.length} spells`}</p>}
      foot={hover !== null ? `Mana value ${MVS[hover]} · ${cols[hover].length} cards` : "One mark per spell. Hover a column."}
      className="h-full"
    >
      <Frame s={s}>
        <svg viewBox={`0 0 ${W} ${height}`} className="block w-full" onPointerLeave={() => setHover(null)} role="img" aria-label="Mana curve">
          <defs>
            <pattern id="lab-screen-c" width="3" height="3" patternUnits="userSpaceOnUse">
              <rect width="1" height="3" fill="#000" />
            </pattern>
          </defs>
          {cols.map((col, i) => {
            const x0 = i * (colW + gap);
            const on = hover === null || hover === i;
            return (
              <g key={i} onPointerEnter={() => setHover(i)}>
                <rect x={x0 - gap / 2} y={0} width={colW + gap} height={base + 24} fill="transparent" />
                {s.counts && (
                  <text
                    x={x0 + colW / 2}
                    y={
                      s.curve === "discs"
                        ? base - colW - 8
                        : base - (s.curve === "ticks" ? Math.min(8, H / max) * col.length : s.curve === "halftone" ? (col.length / max) * H : 0) - 8
                    }
                    textAnchor="middle"
                    fontSize="11"
                    fontFamily="var(--font-mono), monospace"
                    fill={on ? "var(--text)" : "var(--muted)"}
                    opacity={s.curve === "dots" ? 0 : 1}
                  >
                    {col.length || ""}
                  </text>
                )}
                {s.counts && s.curve === "dots" && (
                  <text x={x0 + colW / 2} y={top - 10} textAnchor="middle" fontSize="11" fontFamily="var(--font-mono), monospace" fill="var(--muted)">
                    {col.length || ""}
                  </text>
                )}
                {column(col, i)}
                <text
                  x={x0 + colW / 2}
                  y={base + 18}
                  textAnchor="middle"
                  fontSize="11"
                  fontFamily="var(--font-mono), monospace"
                  fill={on ? "var(--text)" : "var(--muted)"}
                >
                  {MVS[i]}
                </text>
              </g>
            );
          })}
          {s.screen > 0 && <rect width={W} height={base} fill="url(#lab-screen-c)" opacity={s.screen} pointerEvents="none" />}
          <line x1={0} x2={W} y1={base + 4} y2={base + 4} stroke="rgba(255,255,255,0.12)" />
          {s.avg === "tick" && <line x1={avgX} x2={avgX} y1={base} y2={base + 9} stroke={glowLine} strokeWidth="2" />}
          {s.avg === "line" && (
            <g>
              <line x1={avgX} x2={avgX} y1={top - 6} y2={base + 9} stroke={glowLine} strokeDasharray="2 4" />
              <text x={avgX + 6} y={top} fontSize="10" fontFamily="var(--font-mono), monospace" fill={glowLine} letterSpacing="0.1em">
                AVG {avg.toFixed(2)}
              </text>
            </g>
          )}
          {s.lands !== "off" && (
            <text x={0} y={landY - 6} fontSize="10" fill="var(--muted)" fontFamily="var(--font-mono), monospace" letterSpacing="0.12em">
              LANDS {lands.length}
            </text>
          )}
          {s.lands === "rings" &&
            lands.map((c, k) => {
              const per = Math.ceil(lands.length / 2);
              const pitch = Math.min(16, W / per);
              return (
                <circle
                  key={c.id}
                  cx={(k % per) * pitch + pitch / 2}
                  cy={landY + 8 + Math.floor(k / per) * 16}
                  r={4.8}
                  fill="none"
                  stroke="rgba(241,243,255,0.5)"
                  strokeWidth="1.2"
                />
              );
            })}
          {s.lands === "ticks" &&
            lands.map((c, k) => {
              const pitch = W / lands.length;
              return <rect key={c.id} x={k * pitch} y={landY} width={Math.max(1, pitch - 3)} height={14} fill="rgba(241,243,255,0.4)" />;
            })}
        </svg>
      </Frame>
    </Panel>
  );
}

/* ------------------------------------------------------------------ page */

export function GraphicsLab() {
  const [s, setS] = useState<Settings>(CURRENT);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    readStrand();
    try {
      const saved = localStorage.getItem(STORE);
      if (saved) setS({ ...CURRENT, ...JSON.parse(saved) });
    } catch {}
  }, []);

  const apply = (next: Settings) => {
    setS(next);
    try {
      localStorage.setItem(STORE, JSON.stringify(next));
    } catch {}
  };
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => apply({ ...s, [key]: value });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(s, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const side = s.arrange === "side";

  return (
    <main className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6">
      <header className="mb-6">
        <p className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase">Dev lab</p>
        <h1 className="mt-1 text-[28px] leading-tight font-semibold tracking-tight">Statistics graphics</h1>
        <p className="mt-2 max-w-[720px] text-sm text-muted">
          The composition and the mana curve of the statistics section. Made-up 100-card deck with three combos. Hover a dot to see its threads.
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="flex flex-col gap-5 lg:sticky lg:top-4 lg:max-h-[calc(100vh-32px)] lg:overflow-auto lg:pr-2">
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map(([name, preset]) => (
              <button key={name} type="button" onClick={() => apply(preset)} className="min-h-8 rounded-full border border-line px-3 text-xs hover:border-ink">
                {name}
              </button>
            ))}
          </div>
          <button type="button" onClick={copy} className="min-h-9 rounded-full bg-ink px-4 text-sm text-bg">
            {copied ? "Copied" : "Copy these settings"}
          </button>

          <Group legend="Colour">
            <Seg
              label="Colour"
              value={s.colour}
              onChange={(v) => set("colour", v)}
              options={[
                ["glow", "One glow"],
                ["mono", "Ink + glow on focus"],
                ["role", "Hue per role"],
              ]}
            />
            <Seg
              label="Glow colour"
              value={s.glow}
              onChange={(v) => set("glow", v)}
              options={[
                ["copper", "Copper"],
                ["teal", "Teal"],
                ["red", "Red"],
                ["ice", "Ice"],
                ["versions", "Versions"],
              ]}
            />
            {s.glow === "versions" && <p className="text-xs text-muted">Same as the version timeline strand: {strandName}.</p>}
            <Flag label="Halo on bright dots" value={s.halo} onChange={(v) => set("halo", v)} />
            <Slide label="Line screen" value={s.screen} min={0} max={0.4} step={0.02} onChange={(v) => set("screen", v)} />
          </Group>

          <Group legend="Composition">
            <Seg
              label="Layout"
              value={s.layout}
              onChange={(v) => set("layout", v)}
              options={[
                ["clusters", "Clusters"],
                ["square", "Square"],
                ["ring", "Ring"],
                ["strands", "Strands"],
              ]}
            />
            <Slide label="Dot pitch" value={s.pitch} min={10} max={30} unit="px" onChange={(v) => set("pitch", v)} />
            <Seg
              label="Halftone core"
              value={s.field}
              onChange={(v) => set("field", v)}
              options={[
                ["group", "Each group"],
                ["global", "Whole shape"],
                ["flat", "None"],
              ]}
            />
            <Slide label="Falloff" value={s.falloff} min={0} max={1} step={0.05} onChange={(v) => set("falloff", v)} />
            <Seg
              label="Grid"
              value={s.grid}
              onChange={(v) => set("grid", v)}
              options={[
                ["off", "Off"],
                ["fine", "Fine"],
                ["cross", "Crosshairs"],
              ]}
            />
            <Seg
              label="Labels"
              value={s.labels}
              onChange={(v) => set("labels", v)}
              options={[
                ["inline", "Inline"],
                ["callout", "Callouts"],
                ["off", "Off"],
              ]}
            />
            <Seg
              label="Threads"
              value={s.threads}
              onChange={(v) => set("threads", v)}
              options={[
                ["arc", "Arcs"],
                ["trace", "Circuit"],
                ["straight", "Straight"],
              ]}
            />
            <Seg
              label="Threads at rest"
              value={s.rest}
              onChange={(v) => set("rest", v)}
              options={[
                ["faint", "Faint"],
                ["none", "Hidden"],
              ]}
            />
            <Flag label="Hollow rings for lands" value={s.hollow} onChange={(v) => set("hollow", v)} />
          </Group>

          <Group legend="Ring">
            <Slide label="Hole" value={s.hole} min={1} max={6} step={0.2} onChange={(v) => set("hole", v)} />
            <Slide label="Slice gap" value={s.gap} min={0} max={12} step={0.2} unit="°" onChange={(v) => set("gap", v)} />
            <Slide label="Min slice" value={s.minSlice} min={0} max={36} unit="°" onChange={(v) => set("minSlice", v)} />
            <Seg
              label="Outline"
              value={s.outline}
              onChange={(v) => set("outline", v)}
              options={[
                ["none", "None"],
                ["slices", "Slice outlines"],
                ["orbits", "Orbits"],
              ]}
            />
            <Seg
              label="Centre"
              value={s.centre}
              onChange={(v) => set("centre", v)}
              options={[
                ["empty", "Empty"],
                ["commander", "Commander"],
                ["count", "Spell count"],
              ]}
            />
            <Flag label="Radar sweep" value={s.sweep} onChange={(v) => set("sweep", v)} />
            <Flag label="Spread callouts" value={s.spreadLabels} onChange={(v) => set("spreadLabels", v)} />
          </Group>

          <Group legend="Mana curve">
            <Seg
              label="Marks"
              value={s.curve}
              onChange={(v) => set("curve", v)}
              options={[
                ["dots", "Dot stacks"],
                ["halftone", "Halftone bars"],
                ["ticks", "Tick bars"],
                ["discs", "Discs"],
              ]}
            />
            <Slide label="Height" value={s.curveH} min={100} max={320} step={10} unit="px" onChange={(v) => set("curveH", v)} />
            <Seg
              label="Lands"
              value={s.lands}
              onChange={(v) => set("lands", v)}
              options={[
                ["rings", "Rings"],
                ["ticks", "Ticks"],
                ["off", "Hidden"],
              ]}
            />
            <Seg
              label="Average"
              value={s.avg}
              onChange={(v) => set("avg", v)}
              options={[
                ["tick", "Tick"],
                ["line", "Line + label"],
                ["off", "Off"],
              ]}
            />
            <Seg
              label="Curve colour"
              value={s.curveTint}
              onChange={(v) => set("curveTint", v)}
              options={[
                ["role", "Hue per role"],
                ["glow", "Composition glow"],
              ]}
            />
            <Flag label="Counts" value={s.counts} onChange={(v) => set("counts", v)} />
          </Group>

          <Group legend="Section">
            <Seg
              label="Frame"
              value={s.frame}
              onChange={(v) => set("frame", v)}
              options={[
                ["none", "None"],
                ["brackets", "Corner brackets"],
                ["ticks", "Tick ruler"],
              ]}
            />
            <Seg
              label="Arrangement"
              value={s.arrange}
              onChange={(v) => set("arrange", v)}
              options={[
                ["side", "Side by side"],
                ["stacked", "Stacked"],
              ]}
            />
          </Group>
        </aside>

        <div id="lab-preview" className={`grid gap-5 self-start ${side ? "xl:grid-cols-12" : ""}`}>
          <div className={`min-w-0 ${side ? "xl:col-span-7" : ""}`}>
            <Composition s={s} W={side ? 640 : 1000} />
          </div>
          <div className={`min-w-0 ${side ? "xl:col-span-5" : ""}`}>
            <Curve s={s} W={side ? 520 : 1000} />
          </div>
        </div>
      </div>
    </main>
  );
}
