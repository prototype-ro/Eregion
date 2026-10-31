"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { roleFolder, ROLE_ORDER, UNCATEGORIZED } from "@/lib/roles";
import type { AnalysisCombos, DeckCardLine } from "@/lib/types";
import { Panel, ScreenToggle, useGlow } from "./screen";

/**
 * The deck as a ring in one ice glow: one slice per role, one dot per card, dots largest at the heart of each slice, lands as
 * hollow rings. Faint orbits trace the rows, callouts name the slices, the spell count sits in the hole, and threads join the
 * cards of each combo the analysis found. Hovering a card lights its combos, or its slice.
 */

const COMMANDER = "Commander";
const LANDS = "Lands";
/** Settings chosen in the stats graphics lab (/dev/stats-graphics). */
const PITCH = 13;
const FALLOFF = 0.2;
const SCREEN = 0.02;
const HOLE = 5;
const GAP = (4 * Math.PI) / 180;
const MIN_SLICE = (14 * Math.PI) / 180;
const CALLOUT_GAP = 13;
/** How the dots give light. The lab at /dev/stats-graphics tunes these; the defaults are what the deck page shows. */
export interface Look {
  /** Dot size against the halftone size. */
  size: number;
  /** Lit at rest from this halftone field up (0 lights every dot, 1 only the very heart of a slice). */
  threshold: number;
  /** Light of a lit dot at rest. */
  brightness: number;
  /** Light of a dot in the hovered slice or combo. */
  hover: number;
  /** The wide bloom: strength and reach in dot radii. */
  wide: number;
  wideReach: number;
  /** The tight bloom just around the dot. */
  tight: number;
  tightReach: number;
  /** The white-hot centre. */
  core: number;
  /** The unlit grid dot's opacity. */
  grey: number;
  /** A soft-edged dot instead of a crisp disc. */
  soft: boolean;
  /** The cursor's spotlight: how much light it adds, how much it swells dots, and its reach in dot pitches. */
  spot: number;
  swell: number;
  spotReach: number;
  /** Light flowing around the ring; 0 is still. */
  flow: number;
}

/** Chosen in the glow lab (2026-10-21): full-size crisp dots, almost no bloom, light flowing slowly around the ring. */
export const DEFAULT_LOOK: Look = {
  size: 1,
  threshold: 0,
  brightness: 1.04,
  hover: 0.5,
  wide: 0.1,
  wideReach: 2,
  tight: 0,
  tightReach: 1.5,
  core: 0,
  grey: 0.06,
  soft: false,
  spot: 0.18,
  swell: 0,
  spotReach: 1,
  flow: 0.41,
};

/** A soft round bloom in one colour, made once per colour and stamped under every lit dot. */
const blooms = new Map<string, HTMLCanvasElement>();
function bloomSprite(color: string): HTMLCanvasElement {
  const cached = blooms.get(color);
  if (cached) return cached;
  const size = 96;
  const sprite = Object.assign(document.createElement("canvas"), { width: size, height: size });
  const ctx = sprite.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  // A gaussian falloff, as the timeline's blurred halos have.
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    g.addColorStop(t, colorWithAlpha(color, Math.exp(-((t * 2.4) ** 2))));
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  blooms.set(color, sprite);
  return sprite;
}

/** Any CSS colour at an opacity, by letting the browser resolve it. */
function colorWithAlpha(color: string, alpha: number): string {
  const probe = document.createElement("canvas").getContext("2d")!;
  probe.fillStyle = color;
  const resolved = probe.fillStyle;
  if (resolved.startsWith("#")) {
    const n = parseInt(resolved.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha.toFixed(3)})`;
  }
  return resolved.replace(/^rgba?\(([^)]+?)(,\s*[\d.]+)?\)$/, `rgba($1, ${alpha.toFixed(3)})`);
}
/** Below this share of its drawn size the callouts' text gets too small to read, so a list under the ring takes over. */
const CALLOUT_MIN_SCALE = 0.75;

interface Card {
  name: string;
  role: string;
  land: boolean;
}

interface Dot {
  id: number;
  name: string;
  role: string;
  land: boolean;
  x: number;
  y: number;
  r: number;
  /** 1 at the heart of the slice, 0 at its rim. */
  field: number;
  /** Lands and the cards without a known job glow without chroma, so the shape stays one colour but the jobs still stand out. */
  plain: boolean;
}

interface Callout {
  role: string;
  n: number;
  x: number;
  y: number;
  ax: number;
  ay: number;
  anchor: "start" | "end";
}

interface Scene {
  dots: Dot[];
  callouts: Callout[];
  radii: number[];
  cx: number;
  cy: number;
  r0: number;
  w: number;
  h: number;
}

/** Lands and cards with a role, one entry per copy, the commander first. */
function cardsOf(lines: DeckCardLine[]): Card[] {
  const counts: Record<string, number> = {};
  const rough = lines.flatMap((line) => {
    if (line.board !== "main" && line.board !== "commander") return [];
    const land = line.primaryType === "Land";
    const role = line.board === "commander" ? COMMANDER : land ? LANDS : (line.role ?? UNCATEGORIZED);
    counts[role] = (counts[role] ?? 0) + line.quantity;
    return Array.from({ length: line.quantity }, () => ({
      name: line.name,
      role,
      land,
    }));
  });
  const shown = roleFolder(counts);
  return rough.map((card) => (card.role === COMMANDER || card.role === LANDS ? card : { ...card, role: shown(card.role) }));
}

const rank = (role: string) =>
  role === COMMANDER ? -1 : role === LANDS ? 100 : role === UNCATEGORIZED ? 102 : ROLE_ORDER.includes(role) ? ROLE_ORDER.indexOf(role) : 50;
const isPlain = (role: string) => role === LANDS || role === UNCATEGORIZED || (role !== COMMANDER && !ROLE_ORDER.includes(role));

/** Pushes the callouts on one side apart so none overlap, keeping their order top to bottom. */
function spread(items: Callout[]): Callout[] {
  const sorted = [...items].sort((a, b) => a.y - b.y);
  for (let i = 1; i < sorted.length; i++) sorted[i].y = Math.max(sorted[i].y, sorted[i - 1].y + CALLOUT_GAP);
  return sorted;
}

function layout(cards: Card[]): Scene {
  const byRole = new Map<string, number[]>();
  cards.forEach((card, index) => {
    const list = byRole.get(card.role) ?? [];
    list.push(index);
    byRole.set(card.role, list);
  });
  const groups = [...byRole.entries()].sort(([a], [b]) => rank(a) - rank(b));
  const total = cards.length || 1;
  // Each slice is its share of the cards but never under the minimum, so a role of two or three cards still reads; the rest shrink to make room.
  const shares = groups.map(([, ids]) => Math.max(MIN_SLICE, (Math.PI * 2 * ids.length) / total));
  const scale = (Math.PI * 2) / shares.reduce((sum, a) => sum + a, 0);

  const r0 = PITCH * HOLE;
  const dots: Dot[] = [];
  const slices: Array<{ role: string; n: number; mid: number; out: number }> = [];
  let a0 = -Math.PI / 2;
  let outer = r0;
  let rings = 0;
  groups.forEach(([role, ids], gi) => {
    const span = shares[gi] * scale;
    const from = a0 + GAP / 2;
    const to = a0 + Math.max(span - GAP / 2, GAP / 2 + 0.001);
    const ringOf: number[] = [];
    let placed = 0;
    let k = 0;
    let sliceOuter = r0;
    while (placed < ids.length) {
      const radius = r0 + k * PITCH;
      const slots = Math.max(1, Math.floor(((to - from) * radius) / PITCH));
      const take = Math.min(slots, ids.length - placed);
      for (let j = 0; j < take; j++) {
        const a = take === 1 ? (from + to) / 2 : from + ((j + 0.5) / slots) * (to - from) + ((slots - take) / slots) * (to - from) * 0.5;
        const id = ids[placed + j];
        dots.push({
          id,
          name: cards[id].name,
          role,
          land: cards[id].land,
          x: radius * Math.cos(a),
          y: radius * Math.sin(a),
          r: 0,
          field: 0,
          plain: isPlain(role),
        });
        ringOf.push(k);
      }
      placed += take;
      sliceOuter = radius;
      k++;
    }
    rings = Math.max(rings, k);
    const own = dots.slice(dots.length - ids.length);
    own.forEach((dot, i) => {
      const g = k <= 1 ? 0 : ringOf[i] / (k - 1);
      dot.field = 1 - g * g;
      dot.r = (PITCH / 2) * Math.max(0.15, Math.min(1, 1 - FALLOFF * (1 - dot.field) * 0.85));
    });
    slices.push({ role, n: ids.length, mid: (from + to) / 2, out: sliceOuter });
    outer = Math.max(outer, sliceOuter);
    a0 += span;
  });

  const R = outer + 70;
  const cx = R + 60;
  for (const dot of dots) {
    dot.x += cx;
    dot.y += R;
  }
  const raw: Callout[] = slices.map((slice) => {
    const cos = Math.cos(slice.mid);
    const sin = Math.sin(slice.mid);
    return {
      role: slice.role,
      n: slice.n,
      x: cx + (outer + 30) * cos,
      y: R + (outer + 22) * sin,
      ax: cx + (slice.out + PITCH * 0.7) * cos,
      ay: R + (slice.out + PITCH * 0.7) * sin,
      anchor: cos < -0.1 ? "end" : "start",
    };
  });
  const callouts = [...spread(raw.filter((c) => c.anchor === "start")), ...spread(raw.filter((c) => c.anchor === "end"))];
  return {
    dots,
    callouts,
    radii: Array.from({ length: rings }, (_, k) => r0 + k * PITCH),
    cx,
    cy: R,
    r0,
    w: 2 * cx,
    h: Math.max(2 * R, ...callouts.map((c) => c.y + 8)),
  };
}

/** The front face is enough to find a card: combo data names double-faced cards by either. */
const face = (name: string) => name.split(" // ")[0].toLowerCase();

interface Props {
  lines: DeckCardLine[];
  /** Null while the analysis is on its way, or for someone who cannot ask for one. */
  combos: AnalysisCombos | null;
  className?: string;
  /** Overrides of the glow, for the stats graphics lab. */
  look?: Partial<Look>;
}

export function Composition({ lines, combos, className, look }: Props) {
  const { glow, color: strand } = useGlow();
  const cards = useMemo(() => cardsOf(lines), [lines]);
  const scene = useMemo(() => layout(cards), [cards]);
  const byId = useMemo(() => new Map(scene.dots.map((dot) => [dot.id, dot])), [scene]);
  const [hover, setHover] = useState<number | null>(null);
  const [rest, setRest] = useState<"combos" | "none">("combos");
  const svg = useRef<SVGSVGElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const node = svg.current;
    if (!node) return;
    const measure = () => setScale(node.clientWidth / scene.w);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [scene.w]);
  const narrow = scale < CALLOUT_MIN_SCALE;
  // Without callouts the ring alone is shown, cropped to its outer orbit.
  const ringReach = (scene.radii.at(-1) ?? scene.r0) + PITCH;

  const threads = useMemo(() => {
    if (!combos?.available) return [];
    const first = new Map<string, number>();
    for (const dot of [...scene.dots].sort((a, b) => a.id - b.id)) if (!first.has(face(dot.name))) first.set(face(dot.name), dot.id);
    return combos.included.flatMap((combo) => {
      const ids = combo.cards.map((card) => first.get(face(card))).filter((id): id is number => id !== undefined);
      return ids.length >= 2
        ? [
            {
              key: combo.id,
              name: combo.produces.slice(0, 2).join(", ") || "A combo",
              ids,
            },
          ]
        : [];
    });
  }, [scene, combos]);

  const hovered = hover === null ? null : (byId.get(hover) ?? null);
  const active = hover === null ? [] : threads.filter((t) => t.ids.includes(hover));
  const activeIds = new Set(active.flatMap((t) => t.ids));
  const view = narrow ? [scene.cx - ringReach, scene.cy - ringReach, ringReach * 2, ringReach * 2] : [0, 0, scene.w, scene.h];
  const focusKey = hovered ? (activeIds.size ? [...activeIds].join(",") : `role:${hovered.role}`) : "";
  const litIds = useMemo(
    () => (hovered ? new Set(activeIds.size ? activeIds : scene.dots.filter((d) => d.role === hovered.role).map((d) => d.id)) : null),
    // focusKey stands for the hovered card and its combos.
    [focusKey, scene],
  );
  const canvas = useRef<HTMLCanvasElement>(null);
  const viewKey = view.join(" ");

  const pointer = useRef<{ x: number; y: number } | null>(null);
  const redraw = useRef<() => void>(() => {});
  const lk = { ...DEFAULT_LOOK, ...look };
  const lookKey = JSON.stringify(lk);

  // The dots are light, drawn the way the version timeline draws its strands: soft points whose light adds up, with a bloom in the
  // strand colour, burning toward white where it is strongest. Dots that carry no light are a faint grey, as the timeline's unlit
  // grid is. The cursor can swell and light the dots near it, and light can flow around the ring, both as on the timeline.
  useEffect(() => {
    const node = canvas.current;
    const box = svg.current;
    if (!node || !box) return;
    const L: Look = JSON.parse(lookKey);
    const bloom = bloomSprite(strand);
    const white = bloomSprite("#ffffff");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const angle = new Map(scene.dots.map((d) => [d.id, Math.atan2(d.y - scene.cy, d.x - scene.cx)]));
    const draw = (time: number) => {
      const w = box.clientWidth;
      const h = box.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (node.width !== Math.round(w * dpr) || node.height !== Math.round(h * dpr)) {
        node.width = Math.round(w * dpr);
        node.height = Math.round(h * dpr);
      }
      const ctx = node.getContext("2d");
      if (!ctx || !w || !h) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, node.width, node.height);
      const [vx, vy, vw, vh] = viewKey.split(" ").map(Number);
      const s = Math.min(w / vw, h / vh);
      ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * ((w - vw * s) / 2 - vx * s), dpr * ((h - vh * s) / 2 - vy * s));
      ctx.globalCompositeOperation = "lighter";
      const p = pointer.current;
      const sigma = PITCH * L.spotReach;
      const t = time / 1000;
      for (const dot of scene.dots) {
        const on = litIds ? litIds.has(dot.id) : null;
        const k = p && L.spot > 0 ? Math.exp(-((dot.x - p.x) ** 2 + (dot.y - p.y) ** 2) / (2 * sigma * sigma)) : 0;
        // Light that travels around the ring, clockwise like time on the timeline, with broad swells and quicker ripples.
        const wave = L.flow > 0 && !reduced ? 0.5 + 0.35 * Math.sin(angle.get(dot.id)! * 3 - t * 0.9) + 0.15 * Math.sin(angle.get(dot.id)! * 11 - t * 2.4) : 1;
        const flow = 1 + L.flow * (wave * 1.6 - 1);
        // At rest only the heart of each slice is lit; the rest of the slice is the unlit grid.
        const core = dot.field >= L.threshold;
        let light = on === false || dot.plain ? 0 : on ? L.hover : core ? L.brightness * (0.55 + 0.45 * dot.field) * flow : 0;
        light += k * L.spot * (dot.plain ? 0.4 : 1);
        const r = (on ? Math.max(dot.r, PITCH * 0.4) : dot.r) * L.size * (1 + L.swell * k);
        if (light > 0.01) {
          if (L.wide > 0) {
            ctx.globalAlpha = Math.min(1, L.wide * light);
            ctx.drawImage(bloom, dot.x - r * L.wideReach, dot.y - r * L.wideReach, r * L.wideReach * 2, r * L.wideReach * 2);
          }
          if (L.tight > 0) {
            ctx.globalAlpha = Math.min(1, L.tight * light);
            ctx.drawImage(bloom, dot.x - r * L.tightReach, dot.y - r * L.tightReach, r * L.tightReach * 2, r * L.tightReach * 2);
          }
        }
        if (dot.land) {
          ctx.globalAlpha = on === false ? 0.08 : on ? 0.95 : Math.min(1, L.grey * 1.6 + k * 0.5);
          ctx.strokeStyle = on || k > 0.4 ? strand : "rgb(242,242,250)";
          ctx.lineWidth = 1.1;
          ctx.beginPath();
          ctx.arc(dot.x, dot.y, Math.max(1.5, r - 1), 0, Math.PI * 2);
          ctx.stroke();
          continue;
        }
        if (light > 0.01) {
          if (L.soft) {
            ctx.globalAlpha = Math.min(1, 0.5 + 0.6 * light);
            ctx.drawImage(bloom, dot.x - r * 1.35, dot.y - r * 1.35, r * 2.7, r * 2.7);
          } else {
            ctx.globalAlpha = Math.min(1, 0.35 + 0.6 * light);
            ctx.fillStyle = strand;
            ctx.beginPath();
            ctx.arc(dot.x, dot.y, r, 0, Math.PI * 2);
            ctx.fill();
          }
          // The white-hot centre, which the additive light pushes toward white where it is strongest.
          if (L.core > 0) {
            ctx.globalAlpha = Math.min(1, L.core * light * light);
            ctx.drawImage(white, dot.x - r * 1.1, dot.y - r * 1.1, r * 2.2, r * 2.2);
          }
        }
        if (light > 0.01) continue;
        // A dot without light is the unlit grid, as on the timeline.
        ctx.globalAlpha = on === false ? 0.07 : L.grey * (0.7 + 0.3 * dot.field);
        ctx.fillStyle = "rgb(242,242,250)";
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    let frame = 0;
    let last = 0;
    let visible = true;
    const animate = (L.flow > 0 || L.spot > 0) && !reduced;
    const loop = (time: number) => {
      frame = requestAnimationFrame(loop);
      // 30 frames a second is plenty for slow light and keeps the page light.
      if (!visible || time - last < 33) return;
      last = time;
      draw(time);
    };
    draw(performance.now());
    if (animate) frame = requestAnimationFrame(loop);
    redraw.current = () => !animate && draw(performance.now());
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    io.observe(node);
    const observer = new ResizeObserver(() => draw(performance.now()));
    observer.observe(box);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      io.disconnect();
    };
  }, [scene, litIds, strand, viewKey, lookKey]);

  /** The pointer in the diagram's own coordinates, for the spotlight. */
  const track = (event: React.PointerEvent<SVGSVGElement>) => {
    const box = svg.current;
    const ctm = box?.getScreenCTM();
    if (!box || !ctm) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse());
    pointer.current = { x: point.x, y: point.y };
    redraw.current();
  };

  const spells = cards.filter((card) => !card.land).length;
  const resting = hover === null && rest === "combos" ? threads : [];
  const line = (list: typeof threads, strong: boolean) =>
    list.flatMap((thread) =>
      thread.ids.slice(0, -1).map((id, i) => {
        const a = byId.get(id)!;
        const b = byId.get(thread.ids[i + 1])!;
        return (
          <g key={`${thread.key}-${i}-${strong}`}>
            {strong && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={glow(0.25)} strokeWidth={6} strokeLinecap="round" />}
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={glow()} strokeOpacity={strong ? 1 : 0.45} strokeWidth={strong ? 1.6 : 1} strokeLinecap="round" />
          </g>
        );
      }),
    );

  const comboCount = combos?.available ? combos.included.length : null;
  const foot = hovered
    ? active.length
      ? `${hovered.name} · ${active
          .map(
            (t) =>
              `${t.name} with ${t.ids
                .filter((id) => id !== hovered.id)
                .map((id) => byId.get(id)!.name)
                .join(" + ")}`,
          )
          .join(" · ")}`
      : `${hovered.name} · ${hovered.role}${hovered.role === COMMANDER ? "" : ` · ${scene.dots.filter((d) => d.role === hovered.role).length} cards`}`
    : comboCount === null
      ? "One slice for each role, one dot for each card, lands as rings. Hover a dot."
      : `${comboCount === 0 ? "No combos" : comboCount === 1 ? "1 combo" : `${comboCount} combos`} in the deck${combos!.oneCardAway.length ? `, ${combos!.oneCardAway.length} one card away` : ""}. Hover a dot to follow its threads.`;

  return (
    <Panel
      title="Composition"
      className={className}
      right={
        threads.length > 0 ? (
          <ScreenToggle
            label="Combo threads at rest"
            value={rest}
            options={[
              ["combos", "Combos"],
              ["none", "None"],
            ]}
            onChange={setRest}
          />
        ) : (
          <p className="font-mono text-[11px] tracking-[0.12em] text-muted uppercase">{cards.length} cards</p>
        )
      }
      foot={foot}
    >
      <div className="relative">
        <canvas ref={canvas} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" />
      <svg
        ref={svg}
        viewBox={viewKey}
        className="relative mx-auto block max-h-[560px] w-full"
        onPointerMove={track}
        onPointerLeave={() => {
          setHover(null);
          pointer.current = null;
          redraw.current();
        }}
        role="img"
        aria-label={`${cards.length} cards in a ring of slices by role, ${spells} spells${comboCount ? `, with threads for ${comboCount} combos` : ""}`}
      >
        <defs>
          <pattern id="composition-screen" width="3" height="3" patternUnits="userSpaceOnUse">
            <rect width="1" height="3" fill="#000" />
          </pattern>
        </defs>


        {scene.radii.map((r) => (
          <circle key={r} cx={scene.cx} cy={scene.cy} r={r} fill="none" stroke={glow(0.12)} strokeDasharray="1 3" />
        ))}

        {!narrow &&
          scene.callouts.map((c) => (
            <g key={c.role} opacity={hovered && (activeIds.size || c.role !== hovered.role) ? 0.35 : 1}>
              <path d={`M${c.ax} ${c.ay} L${c.anchor === "start" ? c.x - 6 : c.x + 6} ${c.y - 4}`} stroke="rgba(241,243,255,0.25)" fill="none" />
              <circle cx={c.ax} cy={c.ay} r={1.6} fill="rgba(241,243,255,0.5)" />
              <text x={c.x} y={c.y} textAnchor={c.anchor} fontSize="9" fill="var(--text)">
                <tspan fontWeight="600" fontFamily="var(--font-mono), monospace" letterSpacing="0.08em">
                  {c.role.toUpperCase()}
                </tspan>
                <tspan dx="6" fill="var(--muted)" fontFamily="var(--font-mono), monospace">
                  {c.n}
                </tspan>
              </text>
            </g>
          ))}

        <text
          x={scene.cx}
          y={scene.cy + 4}
          textAnchor="middle"
          fontSize={Math.min(34, scene.r0 * 0.8)}
          fontWeight="500"
          letterSpacing="-0.04em"
          fill="var(--text)"
        >
          {spells}
        </text>
        <text
          x={scene.cx}
          y={scene.cy + 18}
          textAnchor="middle"
          fontSize="8"
          fontFamily="var(--font-mono), monospace"
          letterSpacing="0.12em"
          fill="var(--muted)"
        >
          SPELLS
        </text>

        <rect width={scene.w} height={scene.h} fill="url(#composition-screen)" opacity={SCREEN} pointerEvents="none" />
        {line(resting, false)}
        {line(active, true)}
        {[...activeIds].map((id) => {
          const dot = byId.get(id)!;
          return <circle key={`ring${id}`} cx={dot.x} cy={dot.y} r={PITCH * 0.4 + 3.5} fill="none" stroke={glow()} strokeWidth="1.4" />;
        })}
        {hovered && !activeIds.size && (
          <circle cx={hovered.x} cy={hovered.y} r={Math.max(hovered.r, PITCH * 0.4) + 3.5} fill="none" stroke="rgba(241,243,255,0.8)" strokeWidth="1.2" />
        )}
        {scene.dots.map((dot) => (
          <circle key={`hit${dot.id}`} cx={dot.x} cy={dot.y} r={PITCH / 2} fill="transparent" onPointerEnter={() => setHover(dot.id)} />
        ))}
      </svg>
      </div>
      {narrow && (
        <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5 font-mono text-[11px] tracking-[0.08em] uppercase" aria-label="Cards by role">
          {[...scene.callouts]
            .sort((a, b) => b.n - a.n)
            .map((c) => (
              <li key={c.role} className={`flex justify-between gap-2 ${hovered && (activeIds.size || c.role !== hovered.role) ? "opacity-35" : ""}`}>
                <span className="truncate">{c.role}</span>
                <span className="text-muted">{c.n}</span>
              </li>
            ))}
        </ul>
      )}
    </Panel>
  );
}
