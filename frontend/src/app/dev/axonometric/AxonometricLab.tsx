"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { REDUCED } from "@/lib/motion";
import { std } from "@/lib/ui";
import { clamp01, isPlain, roleHue, useCanvasScene } from "../viz/engine";
import { CARDS, MAXV, VERSIONS } from "../viz/mock";

/**
 * A lab for the Axonometric's hover. The drawing is the exploded stack of the viz lab, dressed in the look the
 * composition bar (option F) and the Versions timeline settled on: a floor is a field of halftone dots, one per card,
 * in the card's role colour; the sheet follows the page theme (glow on dark, ink on light); controls are pills;
 * the playhead is a rail of version dots like the timeline's. Pointer in, one floor lifts, the rest recede.
 */

const STACK = ["Creature", "Instant", "Sorcery", "Artifact", "Enchantment", "Land"];
const CROWN = "Commander";
const ALL_TYPES = [...STACK, CROWN];

interface Pt {
  x: number;
  y: number;
}

interface TypeStat {
  count: number;
  mv: number;
  price: number;
  /** The role of each card on the floor, grouped so a role's dots sit together. */
  roles: string[];
}

interface Settings {
  lift: number;
  dim: number;
  readout: "float" | "rail" | "off";
  shadow: boolean;
  showOthers: boolean;
}

const PRESETS: Array<[string, Settings]> = [
  ["Lift", { lift: 16, dim: 0.22, readout: "float", shadow: true, showOthers: false }],
  ["Spotlight", { lift: 0, dim: 0.12, readout: "rail", shadow: false, showOthers: false }],
  ["Step out", { lift: 34, dim: 0.16, readout: "float", shadow: true, showOthers: false }],
  ["Annotated", { lift: 12, dim: 0.3, readout: "float", shadow: true, showOthers: true }],
];

const CURRENT: Settings = PRESETS[0][1];
const STORE = "eregion-dev-axonometric-2";

/** The page's own colours, read from its theme variables so the sheet follows light, dark and the palette. */
interface Ink {
  dark: boolean;
  bg: string;
  surface: string;
  surface2: string;
  line: string;
  text: string;
  muted: string;
  accent: string;
  mono: string;
}

const FALLBACK: Ink = {
  dark: true,
  bg: "#0a0a0a",
  surface: "#141414",
  surface2: "#1c1c1c",
  line: "rgba(242,242,240,0.14)",
  text: "#f2f2f0",
  muted: "#a3a3a0",
  accent: "#5db1cf",
  mono: "ui-monospace, SFMono-Regular, Menlo, monospace",
};

function readInk(): Ink {
  const root = document.documentElement;
  const css = getComputedStyle(root);
  const get = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  const set = root.getAttribute("data-theme");
  const dark = set ? set === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  return {
    dark,
    bg: get("--bg", FALLBACK.bg),
    surface: get("--surface", FALLBACK.surface),
    surface2: get("--surface-2", FALLBACK.surface2),
    line: get("--line", FALLBACK.line),
    text: get("--text", FALLBACK.text),
    muted: get("--muted", FALLBACK.muted),
    accent: get("--accent-text", FALLBACK.accent),
    mono: get("--font-mono", "") || FALLBACK.mono,
  };
}

/** Re-reads the theme when the page switches light and dark or the palette changes. */
function useInk(): Ink {
  const [ink, setInk] = useState<Ink>(FALLBACK);
  useEffect(() => {
    const read = () => setInk(readInk());
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-palette"] });
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    query.addEventListener("change", read);
    return () => {
      observer.disconnect();
      query.removeEventListener("change", read);
    };
  }, []);
  return ink;
}

/** The halftone dot colours of F. On light the dots go darker so they read as ink, not light. */
function dotPaint(hue: number, plain: boolean, dark: boolean) {
  const chroma = plain ? 0.02 : dark ? 0.17 : 0.15;
  const lit = dark ? 0.74 : 0.5;
  const hot = dark ? 0.95 : 0.34;
  const hotChroma = plain ? 0.02 : dark ? 0.1 : 0.16;
  return {
    lit: `oklch(${lit} ${chroma} ${hue} / 0.95)`,
    hot: `oklch(${hot} ${hotChroma} ${hue})`,
  };
}

function inPolygon(px: number, py: number, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    if (poly[i].y > py !== poly[j].y > py && px < ((poly[j].x - poly[i].x) * (py - poly[i].y)) / (poly[j].y - poly[i].y) + poly[i].x) inside = !inside;
  }
  return inside;
}

const label = "font-mono text-[11px] tracking-[0.12em] uppercase";

export function AxonometricLab() {
  const [s, setS] = useState<Settings>(CURRENT);
  const [version, setVersion] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [hover, setHover] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const play = useRef(0);
  const hoverKey = useRef<string | null>(null);
  hoverKey.current = hover;
  const polys = useRef<Array<{ type: string; pts: Pt[] }>>([]);
  const pointer = useRef<Pt | null>(null);

  const ink = useInk();

  const stats = useMemo<TypeStat[][]>(() => {
    const byName = new Map(CARDS.map((card) => [card.name, card] as const));
    return VERSIONS.map((v) => {
      const sums = new Map(ALL_TYPES.map((t) => [t, { count: 0, mvSum: 0, mvN: 0, price: 0, roles: [] as string[] }]));
      for (const name of v.present) {
        const card = byName.get(name);
        const acc = card && sums.get(card.type);
        if (!card || !acc) continue;
        acc.count += 1;
        acc.price += card.price;
        acc.roles.push(card.type === "Land" ? "Land" : card.role);
        if (card.type !== "Land") {
          acc.mvSum += card.cmc;
          acc.mvN += 1;
        }
      }
      return ALL_TYPES.map((t) => {
        const a = sums.get(t)!;
        return { count: a.count, mv: a.mvN ? a.mvSum / a.mvN : 0, price: a.price, roles: [...a.roles].sort() };
      });
    });
  }, []);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) ?? "null");
      if (saved) setS({ ...CURRENT, ...saved });
    } catch {
      // Storage can be blocked.
    }
  }, []);

  useEffect(() => {
    if (window.matchMedia(REDUCED).matches) setPlaying(false);
  }, []);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setVersion((v) => (v + 1) % MAXV), 1100);
    return () => clearInterval(id);
  }, [playing]);

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
      await navigator.clipboard.writeText(JSON.stringify(s, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked.
    }
  };

  const { host, canvas } = useCanvasScene(
    (ctx, w, h, dpr) => {
      const stackLen = STACK.length;
      const thick = 7;
      const gap = 46;
      const yTop = (stackLen - 1) * gap;
      const cmdY = yTop + gap * 2.5;
      const cmdShift = 150;
      const sizeOf = (n: number) => ({ hw: 34 + 9 * Math.sqrt(Math.max(n, 1)), hd: 22 + 6 * Math.sqrt(Math.max(n, 1)) });
      const MONO = `11px ${ink.mono}`;

      const project = (x: number, z: number, y: number) => ({ x: (x - z) * 0.866, y: (x + z) * 0.5 - y });
      const ring: Array<[number, number]> = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

      const widest = sizeOf(Math.max(...stats.flatMap((entry) => entry.map((t) => t.count)), 1));
      const bounds: Pt[] = [];
      for (let i = 0; i < stackLen; i += 1) {
        const y = yTop - i * gap;
        for (const [ux, uz] of ring) bounds.push(project(ux * widest.hw, uz * widest.hd, y), project(ux * widest.hw, uz * widest.hd, y - thick));
      }
      for (const [ux, uz] of ring) bounds.push(project(cmdShift + ux * 60, -95 + uz * 40, cmdY));
      const minX = Math.min(...bounds.map((p) => p.x));
      const maxX = Math.max(...bounds.map((p) => p.x));
      const minY = Math.min(...bounds.map((p) => p.y));
      const maxY = Math.max(...bounds.map((p) => p.y));
      const sc = Math.min((w - 300) / (maxX - minX), (h - 80) / (maxY - minY));
      const tx = 130 - minX * sc;
      const ty = 40 - minY * sc;
      const put = (x: number, z: number, y: number) => {
        const p = project(x, z, y);
        return { x: p.x * sc + tx, y: p.y * sc + ty };
      };
      const off = (p: Pt, dy: number): Pt => ({ x: p.x, y: p.y - dy });

      // The scanlines of F, baked once and laid over the sheet at a whisper.
      const lines = document.createElement("canvas");
      lines.width = Math.round(w * dpr);
      lines.height = Math.round(h * dpr);
      const lctx = lines.getContext("2d");
      if (lctx) {
        lctx.fillStyle = ink.text;
        for (let x = 0; x < lines.width; x += 3 * dpr) lctx.fillRect(x, 0, Math.max(1, dpr), lines.height);
      }

      const shown = new Map<string, number>(ALL_TYPES.map((t) => [t, 0]));
      const foot = new Map<string, { hw: number; hd: number }>(STACK.map((t) => [t, sizeOf(1)]));
      const liftAnim = new Map<string, number>(ALL_TYPES.map((t) => [t, 0]));
      const alphaAnim = new Map<string, number>(ALL_TYPES.map((t) => [t, 1]));
      const paints = new Map<string, ReturnType<typeof dotPaint>>();
      const paintOf = (role: string) => {
        let found = paints.get(role);
        if (!found) {
          found = dotPaint(roleHue(role), isPlain(role) || role === "Land", ink.dark);
          paints.set(role, found);
        }
        return found;
      };
      let start = 0;

      return {
        paint: (time) => {
          if (!start) start = time;
          const vi = Math.max(0, Math.min(MAXV - 1, Math.round(play.current)));
          const row = stats[vi];
          const hovered = hoverKey.current;
          const anyHover = hovered !== null;

          for (const t of ALL_TYPES) {
            const tLift = t === hovered ? s.lift : 0;
            const tAlpha = !anyHover ? 1 : t === hovered ? 1 : s.dim;
            liftAnim.set(t, liftAnim.get(t)! + (tLift - liftAnim.get(t)!) * 0.16);
            alphaAnim.set(t, alphaAnim.get(t)! + (tAlpha - alphaAnim.get(t)!) * 0.14);
          }

          ctx.lineJoin = "round";
          ctx.lineCap = "round";

          // ground grid, hairline
          ctx.strokeStyle = ink.line;
          ctx.globalAlpha = 0.5;
          ctx.lineWidth = 1;
          ctx.beginPath();
          for (let g = -200; g <= 200; g += 45) {
            const a = put(g, -200, -thick - 2);
            const b = put(g, 200, -thick - 2);
            const c = put(-200, g, -thick - 2);
            const d = put(200, g, -thick - 2);
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.moveTo(c.x, c.y);
            ctx.lineTo(d.x, d.y);
          }
          ctx.stroke();
          ctx.globalAlpha = 1;

          // plumb prism
          ctx.strokeStyle = ink.line;
          ctx.setLineDash([2, 6]);
          ctx.beginPath();
          for (const [ux, uz] of ring) {
            const t = put(ux * widest.hw, uz * widest.hd, yTop + gap * 1.6);
            const b = put(ux * widest.hw, uz * widest.hd, -thick - 6);
            ctx.moveTo(t.x, t.y);
            ctx.lineTo(b.x, b.y);
          }
          ctx.stroke();
          ctx.setLineDash([]);

          interface Floor {
            type: string;
            i: number;
            appear: number;
            alphaMul: number;
            lift: number;
            count: number;
            cy: number;
            hw: number;
            hd: number;
            ox: number;
            oz: number;
            A: Pt;
            B: Pt;
            C: Pt;
            D: Pt;
          }

          row.forEach((st, idx) => {
            const t = ALL_TYPES[idx];
            if (t) shown.set(t, st.count);
          });
          for (const t of STACK) foot.set(t, sizeOf(shown.get(t) ?? 0));

          const floors: Floor[] = STACK.map((type, i) => {
            const f = foot.get(type)!;
            const appear = clamp01((time - start - i * 90) / 700);
            const rise = (1 - appear) * 80;
            const bob = Math.sin(time / 1100 + i) * 1.5;
            const cy = yTop - i * gap + rise + bob;
            const lift = liftAnim.get(type)!;
            return {
              type,
              i,
              appear,
              alphaMul: alphaAnim.get(type)!,
              lift,
              count: shown.get(type) ?? 0,
              cy,
              hw: f.hw,
              hd: f.hd,
              ox: 0,
              oz: 0,
              A: off(put(-f.hw, -f.hd, cy), lift),
              B: off(put(f.hw, -f.hd, cy), lift),
              C: off(put(f.hw, f.hd, cy), lift),
              D: off(put(-f.hw, f.hd, cy), lift),
            };
          });

          const cmdAppear = clamp01((time - start - 700) / 700);
          const cmdCy = cmdY + (1 - cmdAppear) * 80;
          const cmdLift = liftAnim.get(CROWN)!;
          const cmd: Floor = {
            type: CROWN,
            i: stackLen,
            appear: cmdAppear,
            alphaMul: alphaAnim.get(CROWN)!,
            lift: cmdLift,
            count: shown.get(CROWN) ?? 0,
            cy: cmdCy,
            hw: 60,
            hd: 40,
            ox: cmdShift,
            oz: -95,
            A: off(put(cmdShift - 60, -95 - 40, cmdCy), cmdLift),
            B: off(put(cmdShift + 60, -95 - 40, cmdCy), cmdLift),
            C: off(put(cmdShift + 60, -95 + 40, cmdCy), cmdLift),
            D: off(put(cmdShift - 60, -95 + 40, cmdCy), cmdLift),
          };

          // contact shadows, under the floors that have risen
          if (s.shadow) {
            ctx.fillStyle = ink.dark ? "#000" : ink.text;
            for (const floor of [...floors, cmd]) {
              if (floor.lift < 0.6) continue;
              const base = put(floor.ox, floor.oz, floor.cy);
              ctx.beginPath();
              ctx.ellipse(base.x, base.y + thick, floor.hw * sc * 0.95, floor.hd * sc * 0.7, 0, 0, Math.PI * 2);
              ctx.globalAlpha = (ink.dark ? 0.5 : 0.12) * clamp01(floor.lift / Math.max(s.lift, 1));
              ctx.fill();
            }
            ctx.globalAlpha = 1;
          }

          const highlightOf = (type: string) => !anyHover || hovered === type;

          const drawPlate = (floor: Floor, highlight: boolean, stat: TypeStat) => {
            const { A, B, C, D, cy, appear, hw, hd, ox, oz, alphaMul } = floor;
            const Cd = off(put(ox + hw, oz + hd, cy - thick), floor.lift);
            const Bd = off(put(ox + hw, oz - hd, cy - thick), floor.lift);
            const Dd = off(put(ox - hw, oz + hd, cy - thick), floor.lift);
            const a = clamp01(appear) * clamp01(alphaMul);
            const crown = floor.type === CROWN;
            ctx.globalAlpha = a;

            // sides, then the top that carries the dots
            ctx.fillStyle = ink.surface2;
            ctx.strokeStyle = ink.line;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(B.x, B.y);
            ctx.lineTo(C.x, C.y);
            ctx.lineTo(Cd.x, Cd.y);
            ctx.lineTo(Bd.x, Bd.y);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = ink.surface;
            ctx.beginPath();
            ctx.moveTo(D.x, D.y);
            ctx.lineTo(C.x, C.y);
            ctx.lineTo(Cd.x, Cd.y);
            ctx.lineTo(Dd.x, Dd.y);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(A.x, A.y);
            ctx.lineTo(B.x, B.y);
            ctx.lineTo(C.x, C.y);
            ctx.lineTo(D.x, D.y);
            ctx.closePath();
            ctx.fillStyle = ink.bg;
            ctx.fill();
            // The edge of the lifted floor glows on dark and is drawn as ink on light, like the timeline's strands.
            const lit = highlight && anyHover;
            ctx.strokeStyle = crown || lit ? ink.accent : highlight ? ink.muted : ink.line;
            ctx.lineWidth = lit || crown ? 1.5 : 1;
            if (lit && ink.dark) {
              ctx.shadowColor = ink.accent;
              ctx.shadowBlur = 10;
            }
            ctx.stroke();
            ctx.shadowBlur = 0;

            // one dot per card: the F halftone, swelling toward the middle of the floor and breathing a little
            const n = stat.roles.length;
            if (n > 0) {
              const aspect = hw / hd;
              const cols = Math.max(1, Math.ceil(Math.sqrt(n * aspect)));
              const rows = Math.max(1, Math.ceil(n / cols));
              const spanX = hw * 1.3;
              const spanZ = hd * 1.3;
              const pitch = Math.min(cols > 1 ? spanX / (cols - 1) : spanX, rows > 1 ? spanZ / (rows - 1) : spanZ);
              const cx = (cols - 1) / 2;
              const cz = (rows - 1) / 2;
              const reach = Math.hypot(cx, cz) + 0.8;
              const full = n === 1 ? 1 : 0;
              for (let k = 0; k < n; k += 1) {
                const col = k % cols;
                const rowIdx = Math.floor(k / cols);
                const d = Math.hypot(col - cx, rowIdx - cz) / reach;
                let field = 1 - d * d + 0.12 * Math.sin(time / 900 + k * 0.7);
                if (lit) field += 0.25;
                if (full) field = 1.1;
                const gx = (col - cx) * pitch;
                const gz = (rowIdx - cz) * pitch;
                const pt = off(put(ox + gx, oz + gz, cy), floor.lift);
                const swell = Math.min(1, Math.max(0.14, 0.2 + 0.85 * field));
                const rx = Math.max(0.8, pitch * 0.5 * swell * sc * 0.866 * 0.95);
                const role = stat.roles[k];
                const paint = paintOf(role);
                ctx.fillStyle = field > 0.85 ? paint.hot : paint.lit;
                ctx.beginPath();
                ctx.ellipse(pt.x, pt.y, rx, rx * 0.58, 0, 0, Math.PI * 2);
                ctx.fill();
              }
            }
            ctx.globalAlpha = 1;
          };

          for (const floor of floors) drawPlate(floor, highlightOf(floor.type), row[ALL_TYPES.indexOf(floor.type)]);
          drawPlate(cmd, highlightOf(CROWN), row[ALL_TYPES.indexOf(CROWN)]);

          // remember the hit shapes for the pointer
          polys.current = [
            ...floors.map((f) => ({ type: f.type, pts: [f.A, f.B, f.C, f.D] })),
            { type: CROWN, pts: [cmd.A, cmd.B, cmd.C, cmd.D] },
          ];

          const statFor = (type: string) => row[ALL_TYPES.indexOf(type)];
          const money = (v: number) => `$${v.toFixed(2)}`;
          const detailLine = (type: string) => {
            const st = statFor(type);
            return type === "Land" ? money(st.price) : `MV ${st.mv.toFixed(2)} · ${money(st.price)}`;
          };

          // left datum: every floor named on a hairline, the one in hand in full colour
          ctx.font = MONO;
          ctx.textAlign = "left";
          for (const floor of floors) {
            const y = off(put(floor.ox, floor.oz, floor.cy), floor.lift).y;
            const on = highlightOf(floor.type);
            ctx.globalAlpha = clamp01(floor.appear) * (on ? 1 : 0.45);
            ctx.strokeStyle = on && anyHover ? ink.accent : ink.line;
            ctx.beginPath();
            ctx.moveTo(100, y);
            ctx.lineTo(112, y);
            ctx.stroke();
            ctx.fillStyle = on && anyHover ? ink.text : ink.muted;
            ctx.fillText(floor.type.toUpperCase(), 12, y + 4);
          }
          ctx.globalAlpha = 1;

          // ---- readout ----
          const backing = ink.dark ? "rgba(10,10,10,0.82)" : "rgba(244,244,242,0.86)";
          if (s.readout === "rail") {
            const bw = 196;
            const lines: string[] = hovered ? [`${hovered.toUpperCase()}  ${statFor(hovered).count}`, detailLine(hovered)] : ["HOVER A FLOOR", "OR THE COMMANDER"];
            if (s.showOthers && hovered) lines.push(...ALL_TYPES.map((t) => `${t}  ${statFor(t).count}`));
            const bh = 24 + lines.length * 16;
            const bx = w - bw - 16;
            const by = 16;
            ctx.fillStyle = backing;
            ctx.beginPath();
            ctx.roundRect(bx, by, bw, bh, 16);
            ctx.fill();
            ctx.strokeStyle = ink.line;
            ctx.lineWidth = 1;
            ctx.stroke();
            lines.forEach((line, i) => {
              ctx.fillStyle = i === 0 && hovered ? ink.text : ink.muted;
              ctx.fillText(line, bx + 16, by + 28 + i * 16);
            });
          } else if (s.readout === "float") {
            const labelX = w - 188;
            const callout = (type: string, anchor: Pt, appear: number, highlight: boolean) => {
              ctx.globalAlpha = clamp01(appear) * (highlight ? 1 : 0.32);
              ctx.strokeStyle = highlight && anyHover ? ink.accent : ink.line;
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(anchor.x + 6, anchor.y);
              ctx.lineTo(labelX - 10, anchor.y);
              ctx.stroke();
              ctx.beginPath();
              ctx.arc(labelX - 6, anchor.y, 2.2, 0, Math.PI * 2);
              ctx.fillStyle = highlight && anyHover ? ink.accent : ink.muted;
              ctx.fill();
              ctx.fillStyle = highlight ? ink.text : ink.muted;
              ctx.fillText(`${type.toUpperCase()}  ${statFor(type).count}`, labelX, anchor.y - 3);
              ctx.fillStyle = ink.muted;
              ctx.fillText(detailLine(type), labelX, anchor.y + 12);
              ctx.globalAlpha = 1;
            };
            for (const floor of [...floors, cmd]) {
              const highlight = highlightOf(floor.type);
              if (!highlight && !s.showOthers) continue;
              const anchor = floor.B.x > floor.C.x ? floor.B : floor.C;
              callout(floor.type, floor.type === CROWN ? { x: anchor.x + 40, y: anchor.y } : anchor, floor.appear, highlight);
            }
          }

          // scanlines last, as in F
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.globalAlpha = ink.dark ? 0.05 : 0.04;
          ctx.drawImage(lines, 0, 0);
          ctx.globalAlpha = 1;
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.textAlign = "start";
        },
      };
    },
    [ink, s.lift, s.dim, s.readout, s.shadow, s.showOthers, stats],
  );

  const onMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    pointer.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const hit = polys.current.find((poly) => inPolygon(pointer.current!.x, pointer.current!.y, poly.pts));
    const next = hit?.type ?? null;
    setHover((current) => (current === next ? current : next));
  };

  const segment = (on: boolean) =>
    `min-h-8 flex-1 rounded-full px-3 ${label} transition-colors ${on ? "bg-ink text-bg" : "text-muted hover:text-ink"}`;
  const range = "w-full accent-[var(--accent-text)]";

  return (
    <div className="mx-auto max-w-[1400px] px-5 pb-24 sm:px-8">
      <header className="pt-10 pb-6">
        <h1 className="font-display text-[clamp(40px,6vw,76px)] leading-none">Axonometric lab</h1>
        <p className="mt-3 max-w-[72ch] text-muted">
          The exploded drawing built around the hover. Every floor is a field of halftone dots, one per card in its role colour. Point at one
          and it lifts and lights, the rest recede, and its numbers read out beside it. It follows the page theme: switch light and dark to
          see glow and ink.
        </p>
      </header>

      <div className="grid items-start gap-8 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="flex flex-col gap-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-32px)] lg:overflow-auto lg:pr-3">
          <div role="group" aria-label="Preset" className="grid grid-cols-2 gap-1 rounded-[22px] border border-line p-1">
            {PRESETS.map(([name, preset]) => {
              const on = JSON.stringify(preset) === JSON.stringify(s);
              return (
                <button key={name} type="button" aria-pressed={on} onClick={() => save(preset)} className={segment(on)}>
                  {name}
                </button>
              );
            })}
          </div>

          <fieldset className="flex flex-col gap-4 rounded-[28px] border border-line bg-surface p-5">
            <legend className={`px-1 text-muted ${label}`}>Hover</legend>
            <label className="grid grid-cols-[48px_1fr_36px] items-center gap-2 text-xs">
              <span className="text-muted">Lift</span>
              <input type="range" min={0} max={48} value={s.lift} onChange={(e) => set("lift", Number(e.target.value))} className={range} />
              <span className="text-right font-mono tabular-nums">{s.lift}</span>
            </label>
            <label className="grid grid-cols-[48px_1fr_36px] items-center gap-2 text-xs">
              <span className="text-muted">Dim</span>
              <input type="range" min={0.05} max={1} step={0.05} value={s.dim} onChange={(e) => set("dim", Number(e.target.value))} className={range} />
              <span className="text-right font-mono tabular-nums">{s.dim.toFixed(2)}</span>
            </label>
            <div>
              <p className={`mb-1.5 text-muted ${label}`}>Readout</p>
              <div className="flex gap-1 rounded-full border border-line p-1">
                {(["float", "rail", "off"] as const).map((key) => (
                  <button key={key} type="button" aria-pressed={s.readout === key} onClick={() => set("readout", key)} className={segment(s.readout === key)}>
                    {key}
                  </button>
                ))}
              </div>
            </div>
            {(
              [
                ["shadow", "Contact shadow"],
                ["showOthers", "Keep the other callouts"],
              ] as const
            ).map(([key, text]) => (
              <button key={key} type="button" role="switch" aria-checked={s[key]} onClick={() => set(key, !s[key])} className="flex items-center justify-between gap-3 text-xs">
                <span className="text-muted">{text}</span>
                <span className={`relative h-5 w-9 rounded-full border transition-colors ${s[key] ? "border-accent-text bg-accent" : "border-line bg-surface-2"}`}>
                  <span className={`absolute top-0.5 left-0 size-3.5 rounded-full bg-ink transition-transform ${s[key] ? "translate-x-[18px]" : "translate-x-0.5"}`} />
                </span>
              </button>
            ))}
          </fieldset>

          <button type="button" onClick={() => void copy()} className={std("secondary")}>
            {copied ? "Copied" : "Copy settings"}
          </button>
        </aside>

        <main className="min-w-0">
          <div className="overflow-hidden rounded-[28px] border border-line bg-bg">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
              <p className="text-[20px] leading-none font-semibold tracking-tight">Kaalia of the Vast</p>
              <span className={`inline-flex items-center rounded-full border px-3 py-1 transition-colors ${label} ${hover ? "border-accent-text text-accent-text" : "border-line text-muted"}`}>
                {hover ?? "hover a floor"}
              </span>
            </div>
            <div
              ref={host}
              className="relative h-[560px] w-full"
              style={{ cursor: hover ? "pointer" : "default" }}
              role="img"
              aria-label="The deck as an exploded axonometric drawing; hover a floor to lift it and read its type, count, mana value and price"
              onPointerMove={onMove}
              onPointerLeave={() => {
                pointer.current = null;
                setHover(null);
              }}
            >
              <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
            </div>

            {/* The playhead, drawn like the timeline: a hairline rail, a dot per version, the open one lit with a glow. */}
            <div className="flex items-center gap-3 border-t border-line px-4 py-3">
              <button
                type="button"
                aria-label={playing ? "Pause" : "Play"}
                onClick={() => setPlaying((v) => !v)}
                className={std(playing ? "primary" : "secondary")}
              >
                {playing ? "Pause" : "Play"}
              </button>
              <ol className="relative flex min-w-0 flex-1 items-center justify-between px-2" aria-label="Versions">
                <span aria-hidden="true" className="absolute inset-x-2 top-1/2 h-px -translate-y-1/2 bg-line" />
                {VERSIONS.map((v, i) => {
                  const open = i === version;
                  return (
                    <li key={v.n} className="relative">
                      <button
                        type="button"
                        aria-label={`Version ${i + 1}: ${v.note}`}
                        aria-current={open}
                        onClick={() => {
                          setPlaying(false);
                          setVersion(i);
                        }}
                        className="group grid size-6 place-items-center rounded-full outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent-text"
                      >
                        <span
                          className={`block rounded-full border transition-[transform,opacity] duration-150 ${
                            open ? "size-3.5 scale-110 border-accent-text bg-accent-text" : "size-2.5 border-muted bg-bg group-hover:scale-125"
                          }`}
                          style={open && ink.dark ? { boxShadow: `0 0 10px ${ink.accent}` } : undefined}
                        />
                      </button>
                    </li>
                  );
                })}
              </ol>
              <span className="font-mono text-xs text-muted tabular-nums">v{version + 1}</span>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted">
            v{version + 1}: {VERSIONS[version].note}. Hover a floor or the commander; it lifts, the rest dim, and it reads out type, count,
            average MV and price. Everything here is made up.
          </p>
        </main>
      </div>
    </div>
  );
}
