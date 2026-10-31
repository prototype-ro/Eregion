"use client";

import { useMemo, useState, type ReactNode } from "react";
import { CARDS, COLOURS, LINKS, ROLES, type Card } from "./mock";

/**
 * Three ideas that keep the deck page's own language: striped halftone dots, hollow rings against solid dots for
 * state, and one copper line for connections (the same line as the version timeline).
 */

const INK = "#f1f3ff";
const MUTED = "#9aa1c9";
const GRID = "rgba(160,170,255,0.07)";
const COPPER = "oklch(0.68 0.13 45)";
const COPPER_HOT = "oklch(0.82 0.1 50)";

const lit = (c: Pick<Card, "plain" | "hue">) => (c.plain ? `oklch(0.68 0.012 ${c.hue})` : `oklch(0.66 0.11 ${c.hue})`);
const hot = (c: Pick<Card, "plain" | "hue">) => (c.plain ? `oklch(0.94 0.015 ${c.hue})` : `oklch(0.9 0.07 ${c.hue})`);
const dim = (c: Pick<Card, "plain" | "hue">) => (c.plain ? `oklch(0.5 0.012 ${c.hue} / 0.16)` : `oklch(0.5 0.11 ${c.hue} / 0.16)`);

/** Vertical line screen laid over the dots, as on the composition square. */
function Stripes({ id }: { id: string }) {
  return (
    <pattern id={id} width="3" height="3" patternUnits="userSpaceOnUse">
      <rect width="1" height="3" fill="#000" />
    </pattern>
  );
}

function Panel({ title, right, children, foot }: { title: string; right?: ReactNode; children: ReactNode; foot?: ReactNode }) {
  return (
    <div className="w-full overflow-hidden rounded-[28px] border border-white/10 bg-[#0c0d12] p-5" style={{ color: INK }}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[20px] leading-none font-semibold tracking-tight">{title}</p>
        {right}
      </div>
      {children}
      {foot && (
        <p className="mt-3 min-h-[2.5em] font-mono text-[11px] leading-relaxed" style={{ color: MUTED }}>
          {foot}
        </p>
      )}
    </div>
  );
}

function Concept({ letter, name, children, panel }: { letter: string; name: string; children: ReactNode; panel: ReactNode }) {
  return (
    <section className="grid gap-6 border-t border-line py-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
      <div className="max-w-[420px]">
        <p className="font-mono text-[12px] text-muted">Option {letter}</p>
        <h2 className="mt-1 text-[26px] leading-tight font-semibold tracking-tight">{name}</h2>
        <div className="mt-4 space-y-3 text-[15px] leading-relaxed text-muted">{children}</div>
      </div>
      <div className="mx-auto w-full max-w-[640px]">{panel}</div>
    </section>
  );
}

/* ------------------------------------------------------------------ A. Combo threads */

const W1 = 600;
const P1 = 26;

function layoutSquare() {
  const groups = ROLES.map((r) => ({ key: r.name, ids: CARDS.filter((c) => c.role === r.name).map((c) => c.id) })).sort((a, b) => b.ids.length - a.ids.length);
  const pos = new Map<number, { x: number; y: number; r: number; field: number }>();
  const labels: Array<{ key: string; n: number; x: number; y: number }> = [];
  let x = 0;
  let y = 0;
  let rowH = 0;
  for (const g of groups) {
    const cols = Math.ceil(Math.sqrt(g.ids.length));
    const rows = Math.ceil(g.ids.length / cols);
    const slot = Math.max(cols * P1, 96);
    if (x > 0 && x + slot > W1) {
      x = 0;
      y += rowH + 40;
      rowH = 0;
    }
    labels.push({ key: g.key, n: g.ids.length, x, y });
    const cx = (cols - 1) / 2;
    const cy = (rows - 1) / 2;
    const reach = Math.hypot(cx, cy) + 0.8;
    g.ids.forEach((id, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const d = Math.hypot(col - cx, row - cy) / reach;
      const field = 1 - d * d;
      pos.set(id, { x: x + col * P1 + P1 / 2, y: y + 22 + row * P1 + P1 / 2, r: P1 * 0.5 * Math.min(1, Math.max(0.2, 0.2 + 0.85 * field)), field });
    });
    x += slot + 22;
    rowH = Math.max(rowH, rows * P1 + 22);
  }
  return { pos, labels, height: y + rowH + 4 };
}

/** A soft arc between two dots, bowed upward like the branch lines on the timeline. */
function arc(a: { x: number; y: number }, b: { x: number; y: number }) {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  return `M${a.x} ${a.y} Q${mx} ${my - Math.min(120, len * 0.35)} ${b.x} ${b.y}`;
}

function ComboThreads() {
  const { pos, labels, height } = useMemo(layoutSquare, []);
  const [hover, setHover] = useState<number | null>(null);
  const [rest, setRest] = useState<"combos" | "all" | "none">("combos");

  const active = hover === null ? [] : LINKS.filter((l) => l.ids.includes(hover));
  const activeIds = new Set(active.flatMap((l) => l.ids));
  const resting = hover !== null ? [] : LINKS.filter((l) => rest === "all" || (rest === "combos" && l.kind === "combo"));
  const card = hover === null ? null : CARDS[hover];

  const threads = (list: typeof LINKS, strong: boolean) =>
    list.flatMap((l) =>
      l.ids.slice(0, -1).map((id, i) => {
        const d = arc(pos.get(id)!, pos.get(l.ids[i + 1])!);
        const combo = l.kind === "combo";
        return (
          <g key={`${l.name}-${id}-${strong}`}>
            {strong && <path d={d} fill="none" stroke={COPPER} strokeOpacity={0.25} strokeWidth={6} strokeLinecap="round" />}
            <path d={d} fill="none" stroke={strong ? COPPER_HOT : COPPER} strokeOpacity={strong ? 1 : 0.7} strokeWidth={strong ? 1.6 : 1.2} strokeDasharray={combo ? undefined : "2 4"} strokeLinecap="round" />
          </g>
        );
      }),
    );

  const foot = card
    ? active.length
      ? `${card.name} · ${active.map((l) => `${l.name} with ${l.ids.filter((id) => id !== card.id).map((id) => CARDS[id].name).join(" + ")}`).join(" · ")}`
      : `${card.name} · no known combos`
    : `${LINKS.filter((l) => l.kind === "combo").length} combos, ${LINKS.filter((l) => l.kind === "synergy").length} synergies. Hover a dot.`;

  return (
    <Panel
      title="Composition"
      right={
        <div className="flex gap-1 rounded-full border border-white/10 p-1" role="group" aria-label="Threads at rest">
          {(["combos", "all", "none"] as const).map((m) => (
            <button key={m} type="button" aria-pressed={rest === m} onClick={() => setRest(m)} className={`min-h-8 rounded-full px-3 font-mono text-[11px] tracking-[0.12em] uppercase transition-colors ${rest === m ? "bg-[#f1f3ff] text-[#0c0d12]" : "text-[#9aa1c9] hover:text-white"}`}>
              {m === "combos" ? "Combos" : m === "all" ? "All links" : "None"}
            </button>
          ))}
        </div>
      }
      foot={foot}
    >
      <svg viewBox={`0 0 ${W1} ${height}`} className="block w-full" onPointerLeave={() => setHover(null)} role="img" aria-label="The hundred cards by role, with combo threads">
        <defs>
          <Stripes id="st-a" />
          <pattern id="grid-a" width={P1} height={P1} patternUnits="userSpaceOnUse">
            <path d={`M${P1} 0 V${P1} M0 ${P1} H${P1}`} stroke={GRID} fill="none" />
          </pattern>
        </defs>
        <rect width={W1} height={height} fill="url(#grid-a)" />
        {labels.map((l) => (
          <text key={l.key} x={l.x} y={l.y + 12} fontSize="12" fill={INK} opacity={activeIds.size ? 0.4 : 1}>
            <tspan fontWeight="600">{l.key}</tspan>
            <tspan dx="6" fill={MUTED} fontFamily="var(--font-mono), monospace">
              {l.n}
            </tspan>
          </text>
        ))}
        {CARDS.map((c) => {
          const p = pos.get(c.id)!;
          const on = hover === null || activeIds.size === 0 || activeIds.has(c.id);
          const big = activeIds.has(c.id);
          return <circle key={c.id} cx={p.x} cy={p.y} r={big ? Math.max(p.r, P1 * 0.42) : p.r} fill={!on ? dim(c) : big || p.field > 0.85 ? hot(c) : lit(c)} />;
        })}
        <rect width={W1} height={height} fill="url(#st-a)" opacity={0.16} pointerEvents="none" />
        {threads(resting, false)}
        {threads(active, true)}
        {[...activeIds].map((id) => {
          const p = pos.get(id)!;
          return <circle key={`ring${id}`} cx={p.x} cy={p.y} r={P1 * 0.42 + 3.5} fill="none" stroke={COPPER_HOT} strokeWidth="1.4" />;
        })}
        {CARDS.map((c) => {
          const p = pos.get(c.id)!;
          return <circle key={`hit${c.id}`} cx={p.x} cy={p.y} r={P1 / 2} fill="transparent" onPointerEnter={() => setHover(c.id)} />;
        })}
      </svg>
    </Panel>
  );
}

/* ------------------------------------------------------------------ B. Halftone mana curve */

const W2 = 600;
const P2 = 19;
const MVS = ["0", "1", "2", "3", "4", "5", "6", "7+"];

function ManaCurve() {
  const [hover, setHover] = useState<number | null>(null);
  const spells = CARDS.filter((c) => !c.land);
  const lands = CARDS.filter((c) => c.land);
  const cols = MVS.map((_, i) => spells.filter((c) => Math.min(7, c.cmc) === i).sort((a, b) => a.role.localeCompare(b.role)));
  const across = 3;
  const colW = across * P2;
  const gap = (W2 - MVS.length * colW) / (MVS.length - 1);
  const maxRows = Math.max(...cols.map((c) => Math.ceil(c.length / across)));
  const top = 26;
  const base = top + maxRows * P2;
  const avg = spells.reduce((s, c) => s + c.cmc, 0) / spells.length;
  const avgX = Math.min(avg, 7) * (colW + gap) + colW / 2;
  const landRows = 2;
  const perRow = Math.ceil(lands.length / landRows);
  const landPitch = W2 / perRow;
  const height = base + 62 + landRows * 18;

  return (
    <Panel
      title="Mana curve"
      right={<span className="font-mono text-[11px] tracking-[0.12em] uppercase" style={{ color: MUTED }}>{`avg ${avg.toFixed(2)} · ${spells.length} spells`}</span>}
      foot={hover !== null ? `Mana value ${MVS[hover]} · ${cols[hover].length} cards · ${[...new Set(cols[hover].map((c) => c.role))].join(", ")}` : "One dot per spell, bottom up, coloured by role. Lands are the rings below. Hover a column."}
    >
      <svg viewBox={`0 0 ${W2} ${height}`} className="block w-full" onPointerLeave={() => setHover(null)} role="img" aria-label="Mana curve, one dot per card">
        <defs>
          <Stripes id="st-b" />
        </defs>
        {cols.map((col, i) => {
          const x0 = i * (colW + gap);
          const rows = Math.ceil(col.length / across);
          const on = hover === null || hover === i;
          return (
            <g key={i} onPointerEnter={() => setHover(i)}>
              <rect x={x0 - gap / 2} y={0} width={colW + gap} height={base + 30} fill="transparent" />
              <text x={x0 + colW / 2} y={top - 10} textAnchor="middle" fontSize="11" fontFamily="var(--font-mono), monospace" fill={MUTED} opacity={on ? 1 : 0.35}>
                {col.length || ""}
              </text>
              {col.map((c, k) => {
                const row = Math.floor(k / across);
                const f = rows <= 1 ? 1 : 1 - Math.pow(row / rows, 1.4);
                const r = P2 * 0.5 * (0.42 + 0.55 * f);
                return <circle key={c.id} cx={x0 + (k % across) * P2 + P2 / 2} cy={base - row * P2 - P2 / 2} r={r} fill={!on ? dim(c) : f > 0.9 ? hot(c) : lit(c)} />;
              })}
              <text x={x0 + colW / 2} y={base + 20} textAnchor="middle" fontSize="11" fontFamily="var(--font-mono), monospace" fill={on ? INK : MUTED}>
                {MVS[i]}
              </text>
            </g>
          );
        })}
        <rect width={W2} height={base} fill="url(#st-b)" opacity={0.16} pointerEvents="none" />
        <line x1={0} x2={W2} y1={base + 4} y2={base + 4} stroke="rgba(255,255,255,0.12)" />
        <line x1={avgX} x2={avgX} y1={base} y2={base + 9} stroke={COPPER_HOT} strokeWidth="1.6" />
        {lands.map((c, k) => (
          <circle key={c.id} cx={(k % perRow) * landPitch + landPitch / 2} cy={base + 54 + Math.floor(k / perRow) * 18} r={5.2} fill="none" stroke={hover === null ? "oklch(0.78 0.02 250)" : "oklch(0.5 0.02 250 / 0.4)"} strokeWidth="1.3" />
        ))}
        <text x={0} y={base + 40} fontSize="11" fill={MUTED} fontFamily="var(--font-mono), monospace">
          LANDS {lands.length}
        </text>
      </svg>
    </Panel>
  );
}

/* ------------------------------------------------------------------ C. Eclipse dots */

function Eclipse({ tone, pips, sources, needed, R }: { tone: string; pips: number; sources: number; needed: number; R: number }) {
  const ring = R * Math.sqrt(sources / needed);
  const short = sources < needed - 0.5;
  const pitch = 7;
  const box = 130;
  const c = box / 2;
  const dots: Array<{ x: number; y: number; r: number }> = [];
  for (let y = c - R; y <= c + R; y += pitch) {
    for (let x = c - R; x <= c + R; x += pitch) {
      const d = Math.hypot(x - c, y - c) / R;
      if (d <= 1) dots.push({ x, y, r: (pitch / 2) * (1 - 0.75 * d * d) });
    }
  }
  return (
    <svg viewBox={`0 0 ${box} ${box}`} className="block w-full" aria-hidden>
      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={d.r} fill={tone} />
      ))}
      <rect width={box} height={box} fill="url(#st-c)" opacity={0.16} />
      <circle cx={c} cy={c} r={Math.min(ring, c - 2)} fill="none" stroke={short ? COPPER_HOT : "rgba(241,243,255,0.7)"} strokeWidth={short ? 1.6 : 1.1} strokeDasharray={short ? "3 3" : undefined} />
    </svg>
  );
}

function ColourEclipses() {
  const [hover, setHover] = useState<string | null>(null);
  const totalPips = COLOURS.reduce((s, c) => s + c.pips, 0);
  const totalSources = COLOURS.reduce((s, c) => s + c.sources, 0);
  const maxShare = Math.max(...COLOURS.map((c) => c.pips / totalPips));
  const rows = COLOURS.map((c) => {
    const share = c.pips / totalPips;
    const needed = share * totalSources;
    return { ...c, needed, R: 52 * Math.sqrt(share / maxShare) };
  });
  const h = rows.find((r) => r.key === hover);

  return (
    <Panel
      title="Colour"
      right={<span className="font-mono text-[11px] tracking-[0.12em] uppercase" style={{ color: MUTED }}>pips against sources</span>}
      foot={
        h
          ? `${h.name}: ${h.pips} pips ask for about ${Math.round(h.needed)} of your ${totalSources} coloured sources; you have ${h.sources}.${h.sources < h.needed - 0.5 ? ` Short by ${Math.round(h.needed - h.sources)}.` : ""}`
          : "The disc is how much the spells ask for a colour. The ring is how much the mana base makes. A ring inside its disc is short."
      }
    >
      <svg width="0" height="0" className="absolute">
        <defs>
          <Stripes id="st-c" />
        </defs>
      </svg>
      <div className="grid grid-cols-3 gap-3">
        {rows.map((r) => {
          const short = r.sources < r.needed - 0.5;
          return (
            <div key={r.key} onPointerEnter={() => setHover(r.key)} onPointerLeave={() => setHover(null)} className={`transition-opacity ${hover && hover !== r.key ? "opacity-35" : ""}`}>
              <Eclipse tone={r.tone} pips={r.pips} sources={r.sources} needed={r.needed} R={r.R} />
              <p className="mt-2 text-center text-[12px] font-semibold">{r.name}</p>
              <p className="text-center font-mono text-[11px]" style={{ color: short ? COPPER_HOT : MUTED }}>
                {short ? `short ${Math.round(r.needed - r.sources)}` : "covered"}
              </p>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ page */

export function DotConcepts() {
  return (
    <main className="mx-auto max-w-[1280px] px-4 py-10 sm:px-8">
      <header className="mb-4 max-w-[720px]">
        <p className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase">Dev concepts</p>
        <h1 className="mt-2 text-[32px] leading-tight font-semibold tracking-tight">Dot concepts</h1>
        <p className="mt-3 text-[15px] text-muted">Three ideas in the deck page&apos;s own language: striped halftone dots, rings against solid dots, and the copper line from the version timeline. Made-up deck.</p>
      </header>

      <Concept letter="A" name="Combo threads" panel={<ComboThreads />}>
        <p>The composition square, plus one layer. Hover a card and copper threads arc to the cards it combos with; everything else dims.</p>
        <p>Solid threads are combos, dotted ones are looser synergies. At rest the square can show its combos faintly, all links, or nothing.</p>
        <p>The data already exists: the analysis engine finds the combos.</p>
      </Concept>

      <Concept letter="B" name="Halftone mana curve" panel={<ManaCurve />}>
        <p>A curve built from the same dots: one per spell, stacked by mana value, coloured by role, larger at the base and fading upward like a halftone.</p>
        <p>Lands sit below as hollow rings, the copper tick marks the average.</p>
      </Concept>

      <Concept letter="C" name="Eclipse dots" panel={<ColourEclipses />}>
        <p>One halftone disc per colour, sized by how many pips the spells ask for. The ring around it is sized by how many sources make that colour.</p>
        <p>A ring outside its disc means the colour is covered. A copper ring inside the disc means it is short.</p>
      </Concept>
    </main>
  );
}
