"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ROLES } from "./mock";

/**
 * Halftone field in a square. The hundred dots are the hundred cards and keep their role color; the choice at the top
 * regroups them (by role, mana value, type or color) and every dot glides to its new cluster. Dot size follows a soft
 * field inside each cluster. Same performance rules as the constellation: one canvas, baked scanlines, 30fps.
 */

const MODES = ["Role", "Mana value", "Type", "Color"] as const;
type Mode = (typeof MODES)[number];

const TYPES = ["Creature", "Instant", "Sorcery", "Artifact", "Enchantment"];
const COLORS = ["White", "Blue", "Black", "Red", "Green", "Colorless"];

type Card = { role: string; hue: number; plain: boolean; cmc: number; type: string; color: string };

function makeCards(): Card[] {
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const cards: Card[] = [];
  ROLES.forEach((role) => {
    for (let i = 0; i < role.count; i++) {
      const land = role.name === "Lands";
      cards.push({
        role: role.name,
        hue: role.hue,
        plain: "plain" in role && !!role.plain,
        cmc: land ? 0 : Math.min(7, 1 + Math.floor(rand() * rand() * 8)),
        type: land ? "Land" : TYPES[Math.floor(rand() * TYPES.length)],
        color: land ? "Colorless" : COLORS[Math.floor(rand() * COLORS.length)],
      });
    }
  });
  return cards;
}

const keyOf = (card: Card, mode: Mode) =>
  mode === "Role" ? card.role : mode === "Mana value" ? (card.cmc >= 7 ? "7+" : String(card.cmc)) : mode === "Type" ? card.type : card.color;

type Group = { key: string; ids: number[]; cols: number; rows: number; x: number; y: number; w: number; h: number };

const GAP = 18;
const LABEL = 18;

function pack(groups: Map<string, number[]>, size: number, keepOrder = false): { list: Group[]; pitch: number } {
  const sorted = keepOrder ? [...groups.entries()] : [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  for (let pitch = Math.floor(size / 9); pitch >= 7; pitch--) {
    const list: Group[] = [];
    let x = 0;
    let y = 0;
    let rowH = 0;
    for (const [key, ids] of sorted) {
      const cols = Math.max(1, Math.ceil(Math.sqrt(ids.length)));
      const rows = Math.ceil(ids.length / cols);
      const w = cols * pitch;
      const slot = Math.max(w, 64);
      if (x > 0 && x + slot > size) {
        x = 0;
        y += rowH + GAP + LABEL;
        rowH = 0;
      }
      list.push({ key, ids, cols, rows, x, y: y + LABEL, w, h: rows * pitch });
      x += slot + GAP;
      rowH = Math.max(rowH, rows * pitch);
    }
    if (y + LABEL + rowH <= size || pitch === 7) return { list, pitch };
  }
  return { list: [], pitch: 7 };
}

export function SquareField() {
  const cards = useMemo(makeCards, []);
  const [mode, setMode] = useState<Mode>("Role");
  const [side, setSide] = useState(0);
  const [focus, setFocus] = useState<string | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const focusRef = useRef<string | null>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  focusRef.current = focus;

  useEffect(() => {
    const node = wrap.current;
    if (!node) return;
    const measure = () => setSide(node.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const scene = useMemo(() => {
    if (!side) return null;
    const groups = new Map<string, number[]>();
    cards.forEach((card, id) => {
      const key = keyOf(card, mode);
      groups.set(key, [...(groups.get(key) ?? []), id]);
    });
    if (mode === "Mana value") {
      const ordered = new Map<string, number[]>();
      ["0", "1", "2", "3", "4", "5", "6", "7+"].forEach((k) => groups.has(k) && ordered.set(k, groups.get(k)!));
      return { ...pack(ordered, side, true), groups: ordered };
    }
    return { ...pack(groups, side), groups };
  }, [cards, mode, side]);

  // current dot state survives regrouping, so dots glide instead of jumping
  const state = useRef<{ x: Float32Array; y: Float32Array; tx: Float32Array; ty: Float32Array; field: Float32Array; gid: string[] } | null>(null);

  useEffect(() => {
    const node = canvas.current;
    if (!node || !scene || !side) return;
    const ctx = node.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    node.width = Math.round(side * dpr);
    node.height = Math.round(side * dpr);
    const { list, pitch } = scene;
    const n = cards.length;
    if (!state.current) {
      state.current = { x: new Float32Array(n), y: new Float32Array(n), tx: new Float32Array(n), ty: new Float32Array(n), field: new Float32Array(n), gid: new Array(n).fill("") };
      state.current.x.fill(side / 2);
      state.current.y.fill(side / 2);
    }
    const st = state.current;
    for (const g of list) {
      const cx = (g.cols - 1) / 2;
      const cy = (g.rows - 1) / 2;
      const reach = Math.hypot(cx, cy) + 0.8;
      // keep dots of one role together inside a cluster
      const ids = [...g.ids].sort((a, b) => (cards[a].role < cards[b].role ? -1 : 1));
      ids.forEach((id, i) => {
        const col = i % g.cols;
        const row = Math.floor(i / g.cols);
        st.tx[id] = g.x + col * pitch + pitch / 2;
        st.ty[id] = g.y + row * pitch + pitch / 2;
        const d = Math.hypot(col - cx, row - cy) / reach;
        st.field[id] = 1 - d * d;
        st.gid[id] = g.key;
      });
    }

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const lines = document.createElement("canvas");
    lines.width = node.width;
    lines.height = node.height;
    const lctx = lines.getContext("2d");
    if (lctx) {
      lctx.fillStyle = "#000";
      for (let x = 0; x < lines.width; x += 3 * dpr) lctx.fillRect(x, 0, Math.max(1, dpr), lines.height);
    }
    const back = document.createElement("canvas");
    back.width = node.width;
    back.height = node.height;
    const bctx = back.getContext("2d");
    if (bctx) {
      bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      bctx.strokeStyle = "rgba(160,170,255,0.07)";
      bctx.beginPath();
      for (let g = 0; g <= side; g += pitch) {
        bctx.moveTo(g + 0.5, 0);
        bctx.lineTo(g + 0.5, side);
        bctx.moveTo(0, g + 0.5);
        bctx.lineTo(side, g + 0.5);
      }
      bctx.stroke();
    }

    const style = cards.map((card) => ({
      lit: card.plain ? `oklch(0.74 0.02 ${card.hue} / 0.95)` : `oklch(0.74 0.17 ${card.hue} / 0.95)`,
      hot: card.plain ? `oklch(0.95 0.02 ${card.hue})` : `oklch(0.95 0.1 ${card.hue})`,
      dim: card.plain ? `oklch(0.5 0.02 ${card.hue} / 0.14)` : `oklch(0.5 0.17 ${card.hue} / 0.14)`,
    }));
    const roleIds = new Map<string, number[]>();
    cards.forEach((card, id) => roleIds.set(card.role, [...(roleIds.get(card.role) ?? []), id]));

    let frame = 0;
    let last = 0;
    let visible = true;
    const TWO_PI = Math.PI * 2;

    const paint = (time: number) => {
      // glide toward targets
      for (let i = 0; i < n; i++) {
        st.x[i] += (st.tx[i] - st.x[i]) * 0.16;
        st.y[i] += (st.ty[i] - st.y[i]) * 0.16;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, node.width, node.height);
      ctx.drawImage(back, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const f = focusRef.current;
      const p = pointer.current;
      const reach = pitch * 5;
      for (const ids of roleIds.values()) {
        const lit = new Path2D();
        const hot = new Path2D();
        const dim = new Path2D();
        for (const id of ids) {
          const on = !f || st.gid[id] === f;
          let field = st.field[id] + 0.12 * Math.sin(time / 900 + id * 0.7);
          if (p) {
            const pd = Math.hypot(st.x[id] - p.x, st.y[id] - p.y);
            if (pd < reach) field += 0.55 * (1 - pd / reach) * (0.6 + 0.4 * Math.sin(time / 160 - pd / 9));
          }
          const r = pitch * 0.5 * Math.min(1, Math.max(0.14, 0.2 + 0.85 * field));
          const path = !on ? dim : field > 0.85 ? hot : lit;
          path.moveTo(st.x[id] + r, st.y[id]);
          path.arc(st.x[id], st.y[id], r, 0, TWO_PI);
        }
        const s = style[ids[0]];
        ctx.fillStyle = s.lit;
        ctx.fill(lit);
        ctx.fillStyle = s.hot;
        ctx.fill(hot);
        ctx.fillStyle = s.dim;
        ctx.fill(dim);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 0.16;
      ctx.drawImage(lines, 0, 0);
      ctx.globalAlpha = 1;
    };

    const loop = (time: number) => {
      frame = requestAnimationFrame(loop);
      if (!visible || time - last < 33) return;
      last = time;
      paint(time);
    };
    paint(0);
    if (!reduced) frame = requestAnimationFrame(loop);
    else for (let i = 0; i < 30; i++) paint(0);
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    io.observe(node);
    return () => {
      cancelAnimationFrame(frame);
      io.disconnect();
    };
  }, [scene, side, cards]);

  const onMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!scene) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    pointer.current = { x, y };
    const hit = scene.list.find((g) => x >= g.x - GAP / 2 && x <= g.x + Math.max(g.w, 64) + GAP / 2 && y >= g.y - LABEL && y <= g.y + g.h + GAP / 2);
    const next = hit?.key ?? null;
    setFocus((current) => (current === next ? current : next));
  };

  return (
    <div className="mx-auto w-full max-w-[640px] overflow-hidden rounded-[28px] border border-white/10 bg-[#0c0d12] p-5 text-[#f1f3ff]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[20px] font-semibold leading-none tracking-tight">Composition</p>
        <div className="flex gap-1 rounded-full border border-white/10 p-1" role="group" aria-label="Group the cards by">
          {MODES.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={mode === item}
              onClick={() => {
                setFocus(null);
                setMode(item);
              }}
              className={`min-h-8 rounded-full px-3 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors ${mode === item ? "bg-[#f1f3ff] text-[#0c0d12]" : "text-[#9aa1c9] hover:text-white"}`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div
        ref={wrap}
        className="relative aspect-square w-full"
        onPointerMove={onMove}
        onPointerLeave={() => {
          pointer.current = null;
          setFocus(null);
        }}
        role="img"
        aria-label={`The hundred cards grouped by ${mode.toLowerCase()}`}
      >
        <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
        {scene?.list.map((g) => (
          <span
            key={g.key}
            className={`pointer-events-none absolute whitespace-nowrap font-sans text-[11px] leading-none transition-[opacity,transform] duration-500 ${focus && focus !== g.key ? "opacity-25" : ""}`}
            style={{ transform: `translate(${g.x}px, ${g.y - LABEL + 2}px)` }}
          >
            <b className="font-semibold">{g.key}</b>
            <span className="ml-1.5 font-mono text-[#9aa1c9]">{g.ids.length}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
