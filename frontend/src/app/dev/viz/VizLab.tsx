"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { REDUCED } from "@/lib/motion";
import { aggregate, CARDS, COMBOS, MAXV, presenceOf, ROLE_ORDER, SIGIL, VERSIONS } from "./mock";
import { clamp01, dotColor, isPlain, lerp, offscreen, pack, roleHue, useCanvasScene, type Cluster } from "./engine";
import { Caveats } from "./Caveats";
import { Axonometric } from "./Axonometric";
import { DitherField } from "./DitherField";
import { Morph } from "./Morph";
import { OklchPanel } from "./OklchPanel";
import { ChordPanel, RadarPanel, RidgelinePanel, VoronoiPanel } from "./VisxCharts";

const Surface3D = dynamic(() => import("./Surface3D").then((m) => m.Surface3D), {
  ssr: false,
  loading: () => <div className="grid h-[360px] place-items-center rounded-[28px] border border-line text-sm text-muted">Loading the 3D terrain…</div>,
});

const STORE = "eregion-dev-viz-lab";

interface Settings {
  medium: "glow" | "ink";
  view: "flat" | "iso";
  guides: boolean;
  labels: boolean;
  speed: number;
}

const CURRENT: Settings = { medium: "glow", view: "iso", guides: true, labels: true, speed: 1100 };

const PRESETS: Array<[string, Settings]> = [
  ["Glow / iso", CURRENT],
  ["Ink / flat", { ...CURRENT, medium: "ink", view: "flat" }],
  ["Bare", { ...CURRENT, guides: false, labels: false }],
  ["Fast", { ...CURRENT, speed: 420 }],
];

const DARK = "#0c0d12";
const GRID = "rgba(160,170,255,0.07)";
const TRACE = "rgba(220,226,255,0.28)";
const MUTED = "#9aa1c9";
const INK = "#f1f3ff";
const ACCENT = "#5db1cf";
const FONT = '11px ui-monospace, SFMono-Regular, Menlo, monospace';

type Play = { current: number };

interface VizProps {
  s: Settings;
  play: Play;
  version: number;
  dark: boolean;
}

function wrapPanel(children: ReactNode, title: string, sub: string, right?: string) {
  return (
    <div className="overflow-hidden rounded-[28px] border border-white/10 p-5 text-[#f1f3ff]" style={{ background: DARK }}>
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <p className="text-[18px] leading-none font-semibold tracking-tight">{title}</p>
          <p className="mt-1.5 text-[11px]" style={{ color: MUTED }}>
            {sub}
          </p>
        </div>
        {right && <p className="text-right font-mono text-[11px] tracking-[0.12em] uppercase" style={{ color: MUTED }}>{right}</p>}
      </div>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ 1. Night sky */

function NightSky({ play, version }: VizProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [focus, setFocus] = useState<string | null>(null);
  const focusRef = useRef<string | null>(null);
  focusRef.current = focus;
  const pointer = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const node = wrap.current;
    if (!node) return;
    const measure = () => setWidth(node.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const cardsByRole = useMemo(() => {
    const map = new Map<string, string[]>();
    CARDS.forEach((card) => map.set(card.role, [...(map.get(card.role) ?? []), card.name]));
    return map;
  }, []);
  const pitch = clamp01(width / 900) * 12 + 12;
  const scene = useMemo<{ clusters: Cluster[]; height: number }>(() => {
    if (!width) return { clusters: [], height: 0 };
    const order = [...ROLE_ORDER, ...[...cardsByRole.keys()].filter((role) => !ROLE_ORDER.includes(role))];
    const items = order
      .filter((role) => cardsByRole.has(role))
      .map((role) => ({ key: role, hue: roleHue(role), plain: isPlain(role), count: cardsByRole.get(role)!.length }));
    return pack(items, width, pitch);
  }, [width, cardsByRole, pitch]);

  const { host, canvas } = useCanvasScene(
    (ctx, w, h, dpr) => {
      const back = offscreen(w * dpr, h * dpr);
      const gctx = back.ctx;
      if (gctx) {
        gctx.scale(dpr, dpr);
        gctx.strokeStyle = GRID;
        gctx.lineWidth = 1;
        gctx.beginPath();
        for (let gx = 0; gx <= w; gx += pitch) {
          gctx.moveTo(gx + 0.5, 0);
          gctx.lineTo(gx + 0.5, h);
        }
        for (let gy = 0; gy <= h; gy += pitch) {
          gctx.moveTo(0, gy + 0.5);
          gctx.lineTo(w, gy + 0.5);
        }
        gctx.stroke();
        gctx.strokeStyle = TRACE;
        gctx.beginPath();
        for (let i = 1; i < scene.clusters.length; i++) {
          const a = scene.clusters[i - 1];
          const b = scene.clusters[i];
          gctx.moveTo(a.x + a.w / 2, a.y + a.h / 2);
          gctx.lineTo(b.x + b.w / 2, b.y + b.h / 2);
        }
        gctx.stroke();
      }
      const scan = offscreen(w * dpr, h * dpr);
      const sctx = scan.ctx;
      if (sctx) {
        sctx.fillStyle = "#000";
        for (let x = 0; x < scan.canvas.width; x += 3 * dpr) sctx.fillRect(x, 0, Math.max(1, dpr), scan.canvas.height);
      }
      const dots = scene.clusters.map((cluster) => {
        const names = cardsByRole.get(cluster.key) ?? [];
        const n = cluster.count;
        const xs = new Float32Array(n);
        const ys = new Float32Array(n);
        const base = new Float32Array(n);
        const phase = new Float32Array(n);
        const op = new Float32Array(n).fill(1);
        const pres = names.slice(0, n).map((name) => presenceOf(name));
        const cx = (cluster.cols - 1) / 2;
        const cy = (cluster.rows - 1) / 2;
        const reach = Math.hypot(cx, cy) + 0.8;
        for (let i = 0; i < n; i++) {
          const col = i % cluster.cols;
          const row = Math.floor(i / cluster.cols);
          xs[i] = cluster.x + col * pitch + pitch / 2;
          ys[i] = cluster.y + row * pitch + pitch / 2;
          const d = Math.hypot(col - cx, row - cy) / reach;
          base[i] = 1 - d * d;
          phase[i] = col * 0.9 + row * 0.7;
        }
        return { ...cluster, xs, ys, base, phase, op, pres };
      });
      return {
        paint: (time) => {
          ctx.drawImage(back.canvas, 0, 0, w, h);
          const vi = Math.max(0, Math.min(MAXV - 1, Math.round(play.current)));
          const slow = time / 900;
          const fast = time / 160;
          const p = pointer.current;
          const reachPx = pitch * 6;
          for (const dot of dots) {
            const on = !focusRef.current || focusRef.current === dot.key;
            for (let i = 0; i < dot.count; i++) {
              const target = dot.pres[i]?.[vi] ? 1 : 0;
              dot.op[i] += (target - dot.op[i]) * 0.12;
              if (dot.op[i] < 0.02 && target === 0) continue;
              let field = dot.base[i] + 0.12 * Math.sin(slow + dot.phase[i]);
              if (p) {
                const pd = Math.hypot(dot.xs[i] - p.x, dot.ys[i] - p.y);
                if (pd < reachPx) field += 0.55 * (1 - pd / reachPx) * (0.6 + 0.4 * Math.sin(fast - pd / 9));
              }
              const r = pitch * 0.5 * Math.min(1, Math.max(0.14, 0.2 + 0.85 * field)) * (0.35 + 0.65 * dot.op[i]);
              if (r < 0.3) continue;
              const light = !on ? 0.5 : field > 0.85 ? 0.95 : 0.74;
              const alpha = (!on ? 0.14 : 0.95) * (0.25 + 0.75 * dot.op[i]);
              ctx.beginPath();
              ctx.arc(dot.xs[i], dot.ys[i], r, 0, Math.PI * 2);
              ctx.fillStyle = dotColor(dot.hue, dot.plain, light, alpha);
              ctx.fill();
            }
          }
          ctx.globalAlpha = 0.16;
          ctx.drawImage(scan.canvas, 0, 0, w, h);
          ctx.globalAlpha = 1;
        },
      };
    },
    [scene, pitch],
  );

  const active = focus ? `${focus} · ${cardsByRole.get(focus)?.length ?? 0}` : `${VERSIONS[version].present.size} cards`;

  return wrapPanel(
    <div
      ref={wrap}
      className="relative mx-auto w-full max-w-[620px]"
      style={{ height: scene.height }}
      role="img"
      aria-label={`Every card as a dot, grouped by role, at v${version + 1}`}
      onPointerMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        pointer.current = { x, y };
        const hit = scene.clusters.find((c) => x >= c.x - 12 && x <= c.x + c.w + 12 && y >= c.y - 18 && y <= c.y + c.h + 12);
        const next = hit?.key ?? null;
        setFocus((current) => (current === next ? current : next));
      }}
      onPointerLeave={() => {
        pointer.current = null;
        setFocus(null);
      }}
    >
      <div ref={host} className="absolute inset-0">
        <canvas ref={canvas} className="h-full w-full" />
      </div>
      {scene.clusters.map((cluster) => (
        <span key={cluster.key} className={`pointer-events-none absolute font-sans text-[11px] leading-none transition-opacity ${focus && focus !== cluster.key ? "opacity-25" : ""}`} style={{ left: cluster.x, top: cluster.y - 18 + 2 }}>
          <b className="font-semibold">{cluster.key}</b>
          <span className="ml-1.5 font-mono" style={{ color: MUTED }}>
            {cluster.count}
          </span>
        </span>
      ))}
    </div>,
    "Composition",
    "One dot per card, halftone by a soft field; the playhead eases cards in and out.",
    active,
  );
}

/* ------------------------------------------------------------------ 2. Constellation */

function Constellation({ play }: VizProps) {
  const involved = useMemo(() => [...new Set(COMBOS.flatMap((combo) => [...combo.cards, ...combo.missing]))], []);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const { host, canvas } = useCanvasScene(
    (ctx, w, h) => {
      const cx = w / 2;
      const cy = h / 2;
      const Rc = Math.min(w, h) / 2 - 40;
      const nodes = involved.map((name, index) => {
        const theta = -Math.PI / 2 + (index / involved.length) * Math.PI * 2;
        return { name, x: cx + Math.cos(theta) * Rc, y: cy + Math.sin(theta) * Rc, op: 1 };
      });
      const at = new Map(nodes.map((node) => [node.name, node]));
      const degree = new Map<string, number>();
      COMBOS.forEach((combo) => combo.cards.forEach((name) => degree.set(name, (degree.get(name) ?? 0) + 1)));
      return {
        paint: (time) => {
          const vi = Math.max(0, Math.min(MAXV - 1, Math.round(play.current)));
          const present = (name: string) => presenceOf(name)[vi] === true;
          const p = pointer.current;
          const dash = -(time / 40) % 8;
          // combo lines
          for (const combo of COMBOS) {
            const pts = combo.cards.filter(present).map((name) => at.get(name)).filter(Boolean) as Array<{ x: number; y: number }>;
            const live = combo.cards.every(present) && combo.missing.every((name) => !present(name));
            for (let i = 0; i < pts.length; i++)
              for (let j = i + 1; j < pts.length; j++) {
                ctx.beginPath();
                ctx.setLineDash([3, 4]);
                ctx.lineDashOffset = dash;
                ctx.moveTo(pts[i].x, pts[i].y);
                ctx.lineTo(pts[j].x, pts[j].y);
                ctx.strokeStyle = live ? `oklch(0.75 0.15 250 / 0.85)` : "rgba(154,161,201,0.14)";
                ctx.lineWidth = live ? 1.6 : 1;
                ctx.stroke();
                ctx.setLineDash([]);
              }
          }
          // nodes
          for (const node of nodes) {
            const live = present(node.name);
            node.op += ((live ? 1 : 0.14) - node.op) * 0.1;
            const deg = degree.get(node.name) ?? 0;
            let r = 4 + deg * 3;
            if (p) {
              const pd = Math.hypot(node.x - p.x, node.y - p.y);
              if (pd < 60) r += (1 - pd / 60) * 4;
            }
            const breath = 0.9 + 0.1 * Math.sin(time / 700 + node.x);
            ctx.beginPath();
            ctx.arc(node.x, node.y, r * breath, 0, Math.PI * 2);
            if (live) {
              ctx.fillStyle = `oklch(0.76 0.15 250 / ${0.4 + 0.6 * node.op})`;
              ctx.fill();
            } else {
              ctx.fillStyle = "transparent";
              ctx.setLineDash([2, 3]);
              ctx.strokeStyle = "rgba(229,120,122,0.7)";
              ctx.lineWidth = 1.5;
              ctx.stroke();
              ctx.setLineDash([]);
            }
            ctx.fillStyle = live ? `rgba(241,243,255,${0.5 + 0.5 * node.op})` : "rgba(229,120,122,0.75)";
            ctx.font = FONT;
            ctx.textAlign = "center";
            const label = node.name.length > 18 ? `${node.name.slice(0, 17)}…` : node.name;
            ctx.fillText(label, node.x, node.y - r - 7);
          }
          ctx.textAlign = "start";
        },
      };
    },
    [],
  );
  return wrapPanel(
    <div
      ref={host}
      className="relative mx-auto aspect-square w-full max-w-[520px]"
      role="img"
      aria-label="Combos at the current version"
      onPointerMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        pointer.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      }}
      onPointerLeave={() => {
        pointer.current = null;
      }}
    >
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
    </div>,
    "Constellation",
    "Cards that share a combo, with the playhead lighting each one as it completes.",
  );
}

/* ------------------------------------------------------------------ 3. Terrain */

function Terrain({ play, s, version }: VizProps) {
  const agg = useMemo(aggregate, []);
  const { host, canvas } = useCanvasScene(
    (ctx, w, h, dpr) => {
      const C = 8;
      const R = agg.length;
      const AX = 30;
      const AY = 15;
      const HZ = 6;
      const H = (c: number, r: number) => agg[r]?.curve[c] ?? 0;
      const maxH = Math.max(...agg.flatMap((entry) => entry.curve), 1);
      const P = (c: number, r: number, hh: number) => ({ x: (c - r) * AX, y: (c + r) * AY - hh * HZ });
      if (s.view === "flat") {
        return {
          paint: (time) => {
            const vi = Math.max(0, Math.min(R - 1, Math.round(play.current)));
            const cellW = (w - 60) / C;
            const cellH = (h - 40) / R;
            for (let r = 0; r < R; r++)
              for (let c = 0; c < C; c++) {
                const count = agg[r].curve[c];
                const a = 0.1 + 0.85 * (count / maxH);
                const breathe = 0.9 + 0.1 * Math.sin(time / 900 + r);
                ctx.fillStyle = `oklch(0.7 0.14 235 / ${(r === vi ? a : a * 0.4) * breathe})`;
                ctx.fillRect(40 + c * cellW, 20 + r * cellH, cellW - 2, cellH - 2);
              }
            ctx.fillStyle = ACCENT;
            ctx.fillRect(40 + 0 * cellW - 2, 20 + vi * cellH, 2, cellH - 2);
          },
        };
      }
      const corners: Array<{ x: number; y: number }> = [];
      for (let c = 0; c < C; c++) for (let r = 0; r < R; r++) corners.push(P(c, r, H(c, r)));
      const minX = Math.min(...corners.map((p) => p.x)) - 10;
      const maxX = Math.max(...corners.map((p) => p.x)) + 10;
      const minY = Math.min(...corners.map((p) => p.y)) - 16;
      const maxY = Math.max(...corners.map((p) => p.y)) + 24;
      const sc = Math.min((w - 20) / (maxX - minX), (h - 20) / (maxY - minY));
      const tx = (w - (maxX - minX) * sc) / 2 - minX * sc;
      const ty = (h - (maxY - minY) * sc) / 2 - minY * sc;
      const mp = (p: { x: number; y: number }) => ({ x: p.x * sc + tx, y: p.y * sc + ty });
      const back = offscreen(w * dpr, h * dpr);
      const bctx = back.ctx;
      if (bctx) {
        bctx.scale(dpr, dpr);
        if (s.guides) {
          bctx.strokeStyle = GRID;
          bctx.lineWidth = 1;
          bctx.beginPath();
          for (let c = 0; c < C; c++) {
            const a = mp(P(c, 0, 0));
            const b = mp(P(c, R - 1, 0));
            bctx.moveTo(a.x, a.y);
            bctx.lineTo(b.x, b.y);
          }
          for (let r = 0; r < R; r++) {
            const a = mp(P(0, r, 0));
            const b = mp(P(C - 1, r, 0));
            bctx.moveTo(a.x, a.y);
            bctx.lineTo(b.x, b.y);
          }
          bctx.stroke();
        }
        const quads: Array<{ r: number; d: Array<{ x: number; y: number }>; h: number; depth: number }> = [];
        for (let r = 0; r < R - 1; r++)
          for (let c = 0; c < C - 1; c++) {
            const a = mp(P(c, r, H(c, r)));
            const b = mp(P(c + 1, r, H(c + 1, r)));
            const dd = mp(P(c + 1, r + 1, H(c + 1, r + 1)));
            const e = mp(P(c, r + 1, H(c, r + 1)));
            quads.push({ r, d: [a, b, dd, e], h: (H(c, r) + H(c + 1, r) + H(c + 1, r + 1) + H(c, r + 1)) / 4, depth: c + r });
          }
        quads.sort((p, q) => p.depth - q.depth);
        for (const q of quads) {
          bctx.beginPath();
          bctx.moveTo(q.d[0].x, q.d[0].y);
          for (let i = 1; i < 4; i++) bctx.lineTo(q.d[i].x, q.d[i].y);
          bctx.closePath();
          bctx.fillStyle = `oklch(0.7 0.15 240 / ${0.1 + (q.h / maxH) * 0.55})`;
          bctx.fill();
          bctx.strokeStyle = "oklch(0.8 0.12 240 / 0.35)";
          bctx.lineWidth = 0.5;
          bctx.stroke();
        }
      }
      return {
        paint: (time) => {
          ctx.drawImage(back.canvas, 0, 0, w, h);
          const pv = play.current;
          const r0 = Math.max(0, Math.min(R - 2, Math.floor(pv)));
          const frac = pv - r0;
          ctx.beginPath();
          for (let c = 0; c < C; c++) {
            const hh = lerp(H(c, r0), H(c, r0 + 1), frac);
            const pt = mp(P(c, pv, hh));
            if (c === 0) ctx.moveTo(pt.x, pt.y);
            else ctx.lineTo(pt.x, pt.y);
          }
          ctx.strokeStyle = ACCENT;
          ctx.lineWidth = 2.5;
          ctx.lineJoin = "round";
          ctx.shadowColor = ACCENT;
          ctx.shadowBlur = 12;
          ctx.stroke();
          ctx.shadowBlur = 0;
        },
      };
    },
    [agg, s.view, s.guides],
  );
  return wrapPanel(
    <div ref={host} className="relative h-[400px] w-full" role="img" aria-label={`Mana curve terrain, v${version + 1}`}>
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
    </div>,
    "Terrain",
    "The curve across every version; the playhead glides a ridge over the surface.",
  );
}

/* ------------------------------------------------------------------ 4. River */

function River({ play, s, version }: VizProps) {
  const agg = useMemo(aggregate, []);
  const { host, canvas } = useCanvasScene(
    (ctx, w, h, dpr) => {
      const pad = 30;
      const roles = ROLE_ORDER.filter((role) => agg.some((entry) => (entry.roles[role] ?? 0) > 0));
      const stepX = (w - pad * 2) / Math.max(MAXV - 1, 1);
      const totals = agg.map((entry) => roles.reduce((sum, role) => sum + (entry.roles[role] ?? 0), 0));
      const maxTotal = Math.max(...totals, 1);
      const scaleY = (h - pad * 2) / maxTotal;
      const xOf = (i: number) => pad + i * stepX;
      const yOf = (base: number, count: number) => h - pad - (base + count) * scaleY;
      const bands = roles.map((role, ri) => {
        const top: Array<{ x: number; y: number }> = [];
        const bottom: Array<{ x: number; y: number }> = [];
        agg.forEach((entry, index) => {
          let base = 0;
          for (let k = 0; k < ri; k++) base += entry.roles[roles[k]] ?? 0;
          top.push({ x: xOf(index), y: yOf(base, entry.roles[role] ?? 0) });
          bottom.push({ x: xOf(index), y: yOf(base, 0) });
        });
        return { role, ri, top, bottom };
      });
      const center = (band: (typeof bands)[number], i: number) => {
        let below = 0;
        for (let k = 0; k < band.ri; k++) below += agg[i].roles[roles[k]] ?? 0;
        return (band.top[i].y + yOf(below, 0)) / 2;
      };
      const back = offscreen(w * dpr, h * dpr);
      const bctx = back.ctx;
      if (bctx) {
        bctx.scale(dpr, dpr);
        for (const band of bands) {
          bctx.beginPath();
          band.top.forEach((p, i) => (i === 0 ? bctx.moveTo(p.x, p.y) : bctx.lineTo(p.x, p.y)));
          for (let i = band.bottom.length - 1; i >= 0; i--) bctx.lineTo(band.bottom[i].x, band.bottom[i].y);
          bctx.closePath();
          bctx.fillStyle = dotColor(roleHue(band.role), false, 0.62, 0.7);
          bctx.fill();
        }
      }
      return {
        paint: (time) => {
          ctx.drawImage(back.canvas, 0, 0, w, h);
          const pv = play.current;
          const px = pad + pv * stepX;
          // flowing particles along each band's top
          for (const band of bands) {
            const speed = 60;
            for (let k = 0; k < 6; k++) {
              const pos = ((time / speed + k * (w / 6)) % (w - pad * 2)) + pad;
              const fi = clamp01((pos - pad) / (w - pad * 2)) * (MAXV - 1);
              const i0 = Math.max(0, Math.min(MAXV - 2, Math.floor(fi)));
              const fr = fi - i0;
              const y = lerp(band.top[i0].y, band.top[i0 + 1].y, fr);
              ctx.beginPath();
              ctx.arc(pos, y, 1.8, 0, Math.PI * 2);
              ctx.fillStyle = "rgba(241,243,255,0.7)";
              ctx.fill();
            }
          }
          // playhead
          ctx.beginPath();
          ctx.moveTo(px, pad - 10);
          ctx.lineTo(px, h - pad);
          ctx.strokeStyle = ACCENT;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([3, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
          const vi = Math.max(0, Math.min(MAXV - 1, Math.round(pv)));
          for (const band of bands) {
            ctx.beginPath();
            ctx.arc(px, center(band, vi), 4, 0, Math.PI * 2);
            ctx.fillStyle = dotColor(roleHue(band.role), false, 0.8, 1);
            ctx.fill();
          }
          if (s.labels) {
            ctx.fillStyle = MUTED;
            ctx.font = FONT;
            ctx.textAlign = "center";
            for (let i = 0; i < MAXV; i++) ctx.fillText(`v${i + 1}`, xOf(i), h - pad + 16);
            ctx.textAlign = "start";
            bands.forEach((band, index) => {
              ctx.fillStyle = dotColor(roleHue(band.role), false, 0.78, 1);
              ctx.fillText(band.role, w - pad + 2, pad + index * 15);
            });
          }
        },
      };
    },
    [agg, s.labels],
  );
  return wrapPanel(
    <div ref={host} className="relative h-[320px] w-full" role="img" aria-label={`Roles flowing across versions, v${version + 1}`}>
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
    </div>,
    "The river",
    "Roles as streams; the playhead rides the composition and the current carries a flow.",
  );
}

/* ------------------------------------------------------------------ 5. Bump */

function Bump({ play, s, version }: VizProps) {
  const agg = useMemo(aggregate, []);
  const { host, canvas } = useCanvasScene(
    (ctx, w, h) => {
      const pad = 70;
      const roles = ROLE_ORDER.filter((role) => agg.some((entry) => (entry.roles[role] ?? 0) > 0));
      const ranks = agg.map((entry) => {
        const sorted = [...roles].sort((a, b) => (entry.roles[b] ?? 0) - (entry.roles[a] ?? 0) || roles.indexOf(a) - roles.indexOf(b));
        const map = new Map<string, number>();
        sorted.forEach((role, index) => map.set(role, index));
        return map;
      });
      const stepX = (w - pad * 2) / Math.max(MAXV - 1, 1);
      const rowY = (rank: number) => pad + rank * ((h - pad * 2) / Math.max(roles.length - 1, 1));
      const xOf = (i: number) => pad + i * stepX;
      let start = 0;
      return {
        paint: (time) => {
          if (!start) start = time;
          const progress = clamp01((time - start) / 1400);
          if (s.guides) {
            ctx.strokeStyle = GRID;
            ctx.lineWidth = 1;
            ctx.setLineDash([2, 6]);
            roles.forEach((_, rank) => {
              ctx.beginPath();
              ctx.moveTo(pad, rowY(rank));
              ctx.lineTo(w - pad, rowY(rank));
              ctx.stroke();
            });
            ctx.setLineDash([]);
          }
          const pv = play.current;
          const vi = Math.max(0, Math.min(MAXV - 1, Math.round(pv)));
          for (const role of roles) {
            const pts = ranks.map((map, i) => ({ x: xOf(i), y: rowY(map.get(role) ?? 0) }));
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let i = 0; i < pts.length - 1; i++) {
              const t = clamp01(progress * (pts.length - 1) - i);
              ctx.lineTo(lerp(pts[i].x, pts[i + 1].x, t), lerp(pts[i].y, pts[i + 1].y, t));
              if (t < 1) break;
            }
            ctx.strokeStyle = dotColor(roleHue(role), false, 0.72, 1);
            ctx.lineWidth = 2.5;
            ctx.lineJoin = "round";
            ctx.stroke();
            // marker glides between versions
            const r0 = Math.max(0, Math.min(MAXV - 2, Math.floor(pv)));
            const fr = pv - r0;
            const y = lerp(rowY(ranks[r0].get(role) ?? 0), rowY(ranks[r0 + 1].get(role) ?? 0), fr);
            const x = xOf(pv);
            ctx.beginPath();
            ctx.arc(x, y, 5, 0, Math.PI * 2);
            ctx.fillStyle = dotColor(roleHue(role), false, 0.8, 1);
            ctx.fill();
            if (s.labels) {
              ctx.fillStyle = dotColor(roleHue(role), false, 0.78, 1);
              ctx.font = FONT;
              ctx.fillText(role, pts[pts.length - 1].x + 8, pts[pts.length - 1].y + 4);
            }
          }
          ctx.fillStyle = MUTED;
          ctx.font = FONT;
          ctx.textAlign = "center";
          ctx.fillText(`v${vi + 1}`, xOf(pv), h - pad + 18);
          ctx.textAlign = "start";
        },
      };
    },
    [agg, s.guides, s.labels],
  );
  return wrapPanel(
    <div ref={host} className="relative h-[340px] w-full" role="img" aria-label={`Role ranks across versions, v${version + 1}`}>
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
    </div>,
    "Bump",
    "Each role's rank per version, drawn in; the markers glide with the playhead.",
  );
}

/* ------------------------------------------------------------------ 6. Spiral */

function Spiral({ play, s, version }: VizProps) {
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const { host, canvas } = useCanvasScene(
    (ctx, w, h) => {
      const size = Math.min(w, h);
      const cx = w / 2;
      const cy = h / 2;
      const golden = 2.399963229728653;
      const entered = CARDS.map((card) => {
        const first = presenceOf(card.name).indexOf(true);
        return { card, entered: first < 0 ? 0 : first };
      }).sort((a, b) => a.entered - b.entered || a.card.name.localeCompare(b.card.name));
      const maxR = size / 2 - 16;
      const pts = entered.map((entry, index) => {
        const angle = index * golden;
        const r = 10 + (maxR - 10) * Math.sqrt(index / entered.length);
        return { ...entry, x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r, op: 1 };
      });
      return {
        paint: (time) => {
          const vi = Math.max(0, Math.min(MAXV - 1, Math.round(play.current)));
          const p = pointer.current;
          if (s.guides) {
            ctx.strokeStyle = GRID;
            ctx.beginPath();
            pts.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
            ctx.stroke();
          }
          for (const pt of pts) {
            const target = pt.entered <= vi ? 1 : 0.05;
            pt.op += (target - pt.op) * 0.1;
            if (pt.op < 0.03) continue;
            let r = 2 + Math.min(pt.card.cmc, 6) * 0.35;
            if (p) {
              const pd = Math.hypot(pt.x - p.x, pt.y - p.y);
              if (pd < 40) r += (1 - pd / 40) * 3;
            }
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, r * (0.9 + 0.1 * Math.sin(time / 800 + pt.x)), 0, Math.PI * 2);
            ctx.fillStyle = dotColor(roleHue(pt.card.role), isPlain(pt.card.role), 0.76, 0.3 + 0.7 * pt.op);
            ctx.fill();
          }
        },
      };
    },
    [s.guides],
  );
  const count = useMemo(() => CARDS.filter((card) => presenceOf(card.name)[version]).length, [version]);
  return wrapPanel(
    <div
      ref={host}
      className="relative mx-auto aspect-square w-full max-w-[480px]"
      role="img"
      aria-label={`Cards along a spiral, ${count} in by v${version + 1}`}
      onPointerMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        pointer.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      }}
      onPointerLeave={() => {
        pointer.current = null;
      }}
    >
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
    </div>,
    "Spiral codex",
    "Cards in the order they entered; the ring fills as the playhead advances.",
    `${count} of ${CARDS.length}`,
  );
}

/* ------------------------------------------------------------------ 7. Exploded */

function Exploded({ play, s, version }: VizProps) {
  const agg = useMemo(aggregate, []);
  const { host, canvas } = useCanvasScene(
    (ctx, w, h) => {
      const types = [...new Set(CARDS.map((card) => card.type))].filter((type) => type !== "Land").concat("Land");
      const countsFor = (vi: number) => types.map((type) => agg[Math.max(0, Math.min(agg.length - 1, vi))].types[type] ?? 0);
      const maxCount = Math.max(1, ...agg.flatMap((entry) => Object.values(entry.types)));
      let start = 0;
      return {
        paint: (time) => {
          if (!start) start = time;
          const progress = clamp01((time - start) / 900);
          const pv = play.current;
          const r0 = Math.max(0, Math.min(agg.length - 2, Math.floor(pv)));
          const fr = pv - r0;
          const a = countsFor(r0);
          const b = countsFor(r0 + 1);
          const counts = a.map((value, index) => lerp(value, b[index], fr));
          const slab = Math.min(140, (w - 80) / types.length - 24);
          const depthX = slab * 0.36;
          const depthY = slab * 0.18;
          const gapX = slab + 24;
          const originX = 40;
          const baseY = h - 40;
          types.forEach((type, index) => {
            const hh = 20 + (counts[index] / maxCount) * (h - 120);
            const x0 = originX + index * gapX;
            const y0 = baseY - index * (h / 40);
            const rise = (1 - progress) * 24;
            ctx.globalAlpha = 0.4 + 0.6 * progress;
            ctx.beginPath();
            ctx.moveTo(x0, y0 - hh + rise);
            ctx.lineTo(x0 + depthX, y0 - hh - depthY + rise);
            ctx.lineTo(x0 + depthX + slab, y0 - hh - depthY + rise);
            ctx.lineTo(x0 + slab, y0 - hh + rise);
            ctx.closePath();
            ctx.fillStyle = `oklch(0.72 0.14 235 / ${0.25 + (counts[index] / maxCount) * 0.5})`;
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(x0, y0 - hh + rise);
            ctx.lineTo(x0 + slab, y0 - hh + rise);
            ctx.lineTo(x0 + slab, y0 + rise);
            ctx.lineTo(x0, y0 + rise);
            ctx.closePath();
            ctx.fillStyle = `oklch(0.66 0.14 235 / ${0.1 + (counts[index] / maxCount) * 0.35})`;
            ctx.fill();
            ctx.strokeStyle = "oklch(0.8 0.12 235 / 0.5)";
            ctx.lineWidth = 0.8;
            ctx.stroke();
            ctx.globalAlpha = 1;
            if (s.labels) {
              ctx.fillStyle = INK;
              ctx.font = FONT;
              ctx.textAlign = "center";
              ctx.fillText(`${type} ${Math.round(counts[index])}`, x0 + slab / 2, y0 - hh - depthY - 8 + rise);
              ctx.textAlign = "start";
            }
          });
        },
      };
    },
    [agg, s.labels, s.view],
  );
  return wrapPanel(
    <div ref={host} className="relative h-[340px] w-full" role="img" aria-label={`Card types as slabs, v${version + 1}`}>
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
    </div>,
    "Exploded",
    "Types as slabs; the counts ease between versions as the playhead moves.",
  );
}

/* ------------------------------------------------------------------ 8. Small multiples */

function SmallMultiples({ play, version }: VizProps) {
  const agg = useMemo(aggregate, []);
  const { host, canvas } = useCanvasScene(
    (ctx, w, h) => {
      const maxCount = Math.max(1, ...agg.flatMap((entry) => entry.curve));
      const cols = 5;
      const rows = Math.ceil(agg.length / cols);
      const cellW = w / cols;
      const cellH = h / rows;
      let start = 0;
      return {
        paint: (time) => {
          if (!start) start = time;
          const progress = clamp01((time - start) / 1000);
          const vi = Math.max(0, Math.min(agg.length - 1, Math.round(play.current)));
          agg.forEach((entry, index) => {
            const cx = (index % cols) * cellW;
            const cy = Math.floor(index / cols) * cellH;
            const grow = clamp01(progress * (agg.length / 2) - index);
            const barsW = (cellW - 16) / 8;
            const breathe = index === vi ? 1.06 : 1;
            ctx.save();
            ctx.translate(cx + cellW / 2, cy + cellH / 2);
            ctx.scale(breathe, breathe);
            ctx.translate(-(cellW / 2 - 8), -(cellH / 2 - 8));
            entry.curve.forEach((count, c) => {
              const bh = (count / maxCount) * (cellH - 30) * grow;
              ctx.fillStyle = index === vi ? "oklch(0.75 0.15 235 / 0.95)" : "oklch(0.6 0.1 235 / 0.4)";
              ctx.fillRect(c * barsW + 1, cellH - 24 - bh, barsW - 2, bh);
            });
            ctx.restore();
            ctx.fillStyle = MUTED;
            ctx.font = FONT;
            ctx.fillText(`v${index + 1}`, cx + 4, cy + 14);
            ctx.fillText(String(entry.total), cx + cellW - 26, cy + 14);
          });
        },
      };
    },
    [agg],
  );
  return wrapPanel(
    <div ref={host} className="relative h-[320px] w-full" role="img" aria-label={`Every version's curve, v${version + 1} highlighted`}>
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
    </div>,
    "Small multiples",
    "Every version at one scale; bars grow in and the current one breathes.",
  );
}

/* ------------------------------------------------------------------ 9. Sigil */

function Sigil({ s }: VizProps) {
  const dot = s.medium === "glow" ? "var(--accent-text)" : "color-mix(in srgb, var(--accent-text) 45%, var(--text))";
  const score = useCount(SIGIL.score);
  const colors = useCount(SIGIL.colors, 1200);
  return (
    <div className="flex flex-col items-center justify-center py-6">
      <span
        className="sigil-glyph font-display leading-none"
        style={{
          fontSize: "clamp(140px,22vw,280px)",
          backgroundImage: `radial-gradient(${dot} 1.6px, transparent 1.8px)`,
          backgroundSize: "7px 7px",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
          WebkitTextFillColor: "transparent",
        }}
        aria-label={`${SIGIL.label}: ${SIGIL.figure}`}
      >
        {SIGIL.figure}
      </span>
      <style>
        {"@keyframes sigil-drift { to { background-position: 7px 7px; } } .sigil-glyph { animation: sigil-drift 6s linear infinite; } @media (prefers-reduced-motion: reduce) { .sigil-glyph { animation: none !important; } }"}
      </style>
      <p className="mt-4 text-xs tracking-[0.14em] text-muted uppercase">{SIGIL.label}</p>
      <div className="mt-6 flex gap-10 font-mono text-sm text-muted">
        <span>
          <span className="text-2xl text-ink tabular-nums">{score}</span> {SIGIL.scoreLabel}
        </span>
        <span>
          <span className="text-2xl text-ink tabular-nums">{colors}</span> {SIGIL.colorsLabel}
        </span>
      </div>
    </div>
  );
}

function useCount(target: number, duration = 900): number {
  const [value, setValue] = useState(target);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      return;
    }
    setValue(0);
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      setValue(Math.round(target * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

/* ------------------------------------------------------------------ main */

export function VizLab() {
  const [s, setS] = useState<Settings>(CURRENT);
  const [version, setVersion] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [copied, setCopied] = useState(false);
  const play = useRef(0);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) ?? "null");
      if (saved) setS({ ...CURRENT, ...saved });
    } catch {
      // Storage can be blocked.
    }
  }, []);

  // Reduced motion is read after mount, so the server and the first client render agree.
  useEffect(() => {
    if (window.matchMedia(REDUCED).matches) setPlaying(false);
  }, []);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setVersion((value) => (value + 1) % MAXV), Math.max(150, s.speed));
    return () => clearInterval(id);
  }, [playing, s.speed]);

  // The playhead eases toward the chosen version, so every canvas glides instead of jumping.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      play.current += (version - play.current) * 0.1;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [version]);

  const save = (next: Settings) => {
    setS(next);
    try {
      localStorage.setItem(STORE, JSON.stringify(next));
    } catch {
      // Not remembered.
    }
  };
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => save({ ...s, [key]: value });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify({ ...s, version }, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked.
    }
  };

  const props: VizProps = { s, play, version, dark: s.medium === "glow" };

  return (
    <div className="viz-lab mx-auto max-w-[1800px] px-5 pb-24 sm:px-8">
      <header className="pt-10 pb-6">
        <h1 className="font-display text-[clamp(44px,6vw,84px)] leading-none">Viz lab</h1>
        <p className="mt-3 max-w-[74ch] text-muted">
          Canvas fields on a shared, gliding playhead. Dots breathe on a halftone field and ripple under the pointer, lines carry a flow, and the
          ridge tracks the deck&rsquo;s life. The canvas panels are always dark, like the concept posters. Play, scrub, hover. All cards are made up.
        </p>
      </header>

      <div className="grid items-start gap-8 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="flex flex-col gap-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-32px)] lg:overflow-auto lg:pr-3">
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map(([name, preset]) => (
              <button key={name} type="button" onClick={() => save(preset)} className="min-h-8 rounded-full border border-line px-3 text-xs hover:border-ink">
                {name}
              </button>
            ))}
          </div>
          <fieldset className="flex flex-col gap-3 rounded-2xl border border-accent-text/40 p-3">
            <legend className="px-1 text-[11px] tracking-[0.14em] text-accent-text uppercase">Playhead</legend>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setPlaying((value) => !value)} className={`min-h-9 flex-1 rounded-full border text-xs transition-colors ${playing ? "border-accent-text bg-accent text-on-accent" : "border-line text-muted hover:text-ink"}`}>
                {playing ? "Pause" : "Play"}
              </button>
              <button type="button" onClick={() => { setPlaying(false); setVersion(0); }} className="min-h-9 rounded-full border border-line px-3 text-xs text-muted hover:text-ink">
                Reset
              </button>
            </div>
            <label className="grid grid-cols-[60px_1fr_48px] items-center gap-2 text-xs">
              <span className="text-muted">Version</span>
              <input type="range" min={1} max={MAXV} value={version + 1} onChange={(event) => { setPlaying(false); setVersion(Number(event.target.value) - 1); }} className="accent-[var(--accent-text)]" />
              <span className="text-right font-mono tabular-nums">{version + 1}</span>
            </label>
            <label className="grid grid-cols-[60px_1fr_48px] items-center gap-2 text-xs">
              <span className="text-muted">Speed</span>
              <input type="range" min={200} max={2400} step={100} value={s.speed} onChange={(event) => set("speed", Number(event.target.value))} className="accent-[var(--accent-text)]" />
              <span className="text-right font-mono tabular-nums">{s.speed}</span>
            </label>
            <p className="text-xs text-muted">v{version + 1}: {VERSIONS[version].note}</p>
          </fieldset>
          <fieldset className="flex flex-col gap-3 border-t border-line pt-4">
            <legend className="sr-only">Options</legend>
            <p className="text-[11px] tracking-[0.14em] text-muted uppercase">Options</p>
            <div>
              <p className="mb-1.5 text-xs text-muted">Projection</p>
              <div className="flex gap-1">
                {(["flat", "iso"] as const).map((key) => (
                  <button key={key} type="button" aria-pressed={s.view === key} onClick={() => set("view", key)} className={`min-h-8 rounded-full border px-3 text-xs transition-colors ${s.view === key ? "border-ink bg-ink text-bg" : "border-line text-muted hover:text-ink"}`}>
                    {key === "flat" ? "Flat" : "Isometric"}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs text-muted">Sigil medium</p>
              <div className="flex gap-1">
                {(["glow", "ink"] as const).map((key) => (
                  <button key={key} type="button" aria-pressed={s.medium === key} onClick={() => set("medium", key)} className={`min-h-8 rounded-full border px-3 text-xs transition-colors ${s.medium === key ? "border-ink bg-ink text-bg" : "border-line text-muted hover:text-ink"}`}>
                    {key === "glow" ? "Glow" : "Ink"}
                  </button>
                ))}
              </div>
            </div>
            <button type="button" role="switch" aria-checked={s.guides} onClick={() => set("guides", !s.guides)} className="flex items-center justify-between gap-3 text-xs">
              <span className="text-muted">Guide lines</span>
              <span className={`relative h-5 w-9 rounded-full border transition-colors ${s.guides ? "border-accent-text bg-accent" : "border-line bg-surface"}`}>
                <span className={`absolute top-0.5 size-3.5 rounded-full bg-ink transition-all ${s.guides ? "left-[18px]" : "left-0.5"}`} />
              </span>
            </button>
            <button type="button" role="switch" aria-checked={s.labels} onClick={() => set("labels", !s.labels)} className="flex items-center justify-between gap-3 text-xs">
              <span className="text-muted">Labels</span>
              <span className={`relative h-5 w-9 rounded-full border transition-colors ${s.labels ? "border-accent-text bg-accent" : "border-line bg-surface"}`}>
                <span className={`absolute top-0.5 size-3.5 rounded-full bg-ink transition-all ${s.labels ? "left-[18px]" : "left-0.5"}`} />
              </span>
            </button>
          </fieldset>
          <button type="button" onClick={() => void copy()} className="min-h-9 rounded-full border border-line text-xs hover:border-ink">
            {copied ? "Copied" : "Copy settings"}
          </button>
        </aside>

        <main className="grid min-w-0 gap-6 xl:grid-cols-2">
          <Plate title="Composition" wide>
            <NightSky {...props} />
          </Plate>
          <Plate title="Constellation">
            <Constellation {...props} />
          </Plate>
          <Plate title="Terrain" wide>
            <Terrain {...props} />
          </Plate>
          <Plate title="River" wide>
            <River {...props} />
          </Plate>
          <Plate title="Bump">
            <Bump {...props} />
          </Plate>
          <Plate title="Spiral">
            <Spiral {...props} />
          </Plate>
          <Plate title="Exploded">
            <Exploded {...props} />
          </Plate>
          <Plate title="Small multiples">
            <SmallMultiples {...props} />
          </Plate>
          <Plate title="Sigil" wide>
            <Sigil {...props} />
          </Plate>
          <Plate title="Morph" wide>
            <Morph />
          </Plate>
          <Plate title="Axonometric" wide>
            <Axonometric play={play} version={version} />
          </Plate>
          <Plate title="Terrain rotatable" wide>
            <Surface3D play={play} />
          </Plate>
          <Plate title="Dither" wide>
            <DitherField />
          </Plate>
          <Plate title="OKLCH">
            <OklchPanel />
          </Plate>
          <Plate title="Ridgeline">
            <RidgelinePanel play={play} />
          </Plate>
          <Plate title="Voronoi">
            <VoronoiPanel />
          </Plate>
          <Plate title="Chord">
            <ChordPanel />
          </Plate>
          <Plate title="Radar">
            <RadarPanel version={version} />
          </Plate>
          <Plate title="Caveats" wide>
            <Caveats />
          </Plate>
        </main>
      </div>
    </div>
  );
}

function Plate({ title, children, wide }: { title: string; children: ReactNode; wide?: boolean }) {
  void title;
  return <div className={wide ? "min-w-0 xl:col-span-2" : "min-w-0"}>{children}</div>;
}
