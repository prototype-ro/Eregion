"use client";

import { useRef, useState } from "react";
import { clamp01, useCanvasScene } from "./engine";
import { aggregate, CARDS, MAXV, presenceOf } from "./mock";

type Play = { current: number };

/** Floors, top to bottom. The commander sits detached above as the crown. */
const STACK = ["Creature", "Instant", "Sorcery", "Artifact", "Enchantment", "Land"];

interface Ink {
  bg: string;
  line: string;
  faint: string;
  dim: string;
  mark: string;
  markDim: string;
  side1: string;
  side2: string;
  text: string;
  textHi: string;
}

const NIGHT: Ink = {
  bg: "#0b0d12",
  line: "rgba(223,230,255,0.72)",
  faint: "rgba(223,230,255,0.22)",
  dim: "rgba(223,230,255,0.1)",
  mark: "rgba(127,212,255,0.92)",
  markDim: "rgba(127,212,255,0.55)",
  side1: "rgba(20,28,40,0.9)",
  side2: "rgba(13,19,28,0.9)",
  text: "#9aa1c9",
  textHi: "#f1f3ff",
};
const SHEET: Ink = {
  bg: "#ecece7",
  line: "rgba(26,30,22,0.72)",
  faint: "rgba(26,30,22,0.3)",
  dim: "rgba(26,30,22,0.12)",
  mark: "rgba(31,111,139,0.85)",
  markDim: "rgba(31,111,139,0.45)",
  side1: "rgba(206,210,201,0.95)",
  side2: "rgba(220,224,215,0.95)",
  text: "#5a6157",
  textHi: "#171a14",
};

/** Average mana value per type at a version, lands out. */
function avgMvByType(version: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const type of STACK) {
    let sum = 0;
    let n = 0;
    if (type !== "Land") {
      for (const card of CARDS) {
        if (card.type !== type || !presenceOf(card.name)[version]) continue;
        sum += card.cmc;
        n += 1;
      }
    }
    out[type] = n === 0 ? 0 : sum / n;
  }
  return out;
}

interface Pt {
  x: number;
  y: number;
}

/**
 * The deck as an exploded axonometric drawing. Card types are the floors — lands the foundation, the commander
 * the detached crown — and each floor's footprint grows with its card count, so the silhouette is read, not
 * counted. A four-corner plumb prism bounds the stack, a datum runs down the left, each floor carries an inset
 * rebate and a ticked callout, and a title block closes the sheet. Scrubbing the playhead changes the storeys.
 */
export function Axonometric({ play, version }: { play: Play; version: number }) {
  const [medium, setMedium] = useState<"night" | "sheet">("night");
  const ink = medium === "night" ? NIGHT : SHEET;
  const pointer = useRef<Pt | null>(null);

  const { host, canvas } = useCanvasScene(
    (ctx, w, h) => {
      const agg = aggregate();
      const stackLen = STACK.length;
      const thick = 7;
      const gap = 46;
      const yTop = (stackLen - 1) * gap;
      const cmdY = yTop + gap * 2.5;
      const cmdShift = 150;
      const sizeOf = (n: number) => ({ hw: 34 + 9 * Math.sqrt(Math.max(n, 1)), hd: 22 + 6 * Math.sqrt(Math.max(n, 1)) });

      const project = (x: number, z: number, y: number) => ({ X: (x - z) * 0.866, Y: (x + z) * 0.5 - y });
      const ring: Array<[number, number]> = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

      // Bounds from the widest possible floor, so the view never jumps.
      const widest = sizeOf(Math.max(...agg.flatMap((entry) => Object.values(entry.types)), 1));
      const bounds: Array<{ X: number; Y: number }> = [];
      for (let i = 0; i < stackLen; i += 1) {
        const y = yTop - i * gap;
        for (const [ux, uz] of ring) bounds.push(project(ux * widest.hw, uz * widest.hd, y), project(ux * widest.hw, uz * widest.hd, y - thick));
      }
      for (const [ux, uz] of ring) bounds.push(project(cmdShift + ux * 60, -95 + uz * 40, cmdY));
      const minX = Math.min(...bounds.map((p) => p.X));
      const maxX = Math.max(...bounds.map((p) => p.X));
      const minY = Math.min(...bounds.map((p) => p.Y));
      const maxY = Math.max(...bounds.map((p) => p.Y));
      const sc = Math.min((w - 250) / (maxX - minX), (h - 80) / (maxY - minY));
      const tx = 96 - minX * sc;
      const ty = 40 - minY * sc;
      const put = (x: number, z: number, y: number) => {
        const p = project(x, z, y);
        return { x: p.X * sc + tx, y: p.Y * sc + ty };
      };

      const inPolygon = (px: number, py: number, poly: Pt[]) => {
        let inside = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
          if (poly[i].y > py !== poly[j].y > py && px < ((poly[j].x - poly[i].x) * (py - poly[i].y)) / (poly[j].y - poly[i].y) + poly[i].x) inside = !inside;
        }
        return inside;
      };

      const shown = new Map<string, number>([...STACK, "Commander"].map((t) => [t, 0]));
      const foot = new Map<string, { hw: number; hd: number }>(STACK.map((t) => [t, sizeOf(1)]));
      let start = 0;

      return {
        paint: (time) => {
          if (!start) start = time;
          const vi = Math.max(0, Math.min(MAXV - 1, Math.round(play.current)));
          const entry = agg[vi];
          for (const type of [...STACK, "Commander"]) shown.set(type, (shown.get(type) ?? 0) + ((entry.types[type] ?? 0) - (shown.get(type) ?? 0)) * 0.12);
          for (const type of STACK) {
            const target = sizeOf(shown.get(type) ?? 0);
            const cur = foot.get(type)!;
            foot.set(type, { hw: cur.hw + (target.hw - cur.hw) * 0.12, hd: cur.hd + (target.hd - cur.hd) * 0.12 });
          }
          const mv = avgMvByType(vi);

          ctx.fillStyle = ink.bg;
          ctx.fillRect(0, 0, w, h);
          ctx.lineJoin = "round";
          ctx.lineCap = "round";

          // ground grid
          ctx.strokeStyle = ink.dim;
          ctx.lineWidth = 1;
          for (let g = -200; g <= 200; g += 45) {
            const a = put(g, -200, -thick - 2);
            const b = put(g, 200, -thick - 2);
            const c = put(-200, g, -thick - 2);
            const d = put(200, g, -thick - 2);
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.moveTo(c.x, c.y);
            ctx.lineTo(d.x, d.y);
            ctx.stroke();
          }

          // plumb prism: dashed verticals at the widest floor's corners
          ctx.strokeStyle = ink.faint;
          ctx.setLineDash([4, 6]);
          for (const [ux, uz] of ring) {
            const t = put(ux * widest.hw, uz * widest.hd, yTop + gap * 1.6);
            const b = put(ux * widest.hw, uz * widest.hd, -thick - 6);
            ctx.beginPath();
            ctx.moveTo(t.x, t.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
          ctx.setLineDash([]);

          // left datum with a tick per storey
          const datumX = 62;
          ctx.strokeStyle = ink.faint;
          ctx.beginPath();
          ctx.moveTo(datumX, put(0, 0, yTop + gap * 0.6).y);
          ctx.lineTo(datumX, put(0, 0, -thick).y);
          ctx.stroke();
          for (let i = 0; i < stackLen; i += 1) {
            const y = put(0, 0, yTop - i * gap).y;
            ctx.beginPath();
            ctx.moveTo(datumX - 6, y);
            ctx.lineTo(datumX + 6, y);
            ctx.stroke();
          }

          // ---- floors ----
          interface Floor {
            type: string;
            i: number;
            appear: number;
            hw: number;
            hd: number;
            cy: number;
            count: number;
            A: Pt;
            B: Pt;
            C: Pt;
            D: Pt;
          }
          const floors: Floor[] = STACK.map((type, i) => {
            const f = foot.get(type)!;
            const appear = clamp01((time - start - i * 110) / 900);
            const rise = (1 - appear) * 90;
            const bob = Math.sin(time / 1100 + i) * 2;
            const cy = yTop - i * gap + rise + bob;
            return {
              type,
              i,
              appear,
              hw: f.hw,
              hd: f.hd,
              cy,
              count: shown.get(type) ?? 0,
              A: put(-f.hw, -f.hd, cy),
              B: put(f.hw, -f.hd, cy),
              C: put(f.hw, f.hd, cy),
              D: put(-f.hw, f.hd, cy),
            };
          });
          const p = pointer.current;
          const hovered = p ? floors.find((floor) => inPolygon(p.x, p.y, [floor.A, floor.B, floor.C, floor.D]))?.type ?? null : null;

          const drawPlate = (floor: { hw: number; hd: number; cy: number; A: Pt; B: Pt; C: Pt; D: Pt; appear: number; count: number }, highlight: boolean) => {
            const { A, B, C, D, cy, appear, hw, hd, count } = floor;
            const Cd = put(hw, hd, cy - thick);
            const Bd = put(hw, -hd, cy - thick);
            const Dd = put(-hw, hd, cy - thick);
            ctx.globalAlpha = clamp01(appear);
            // shaded side faces
            ctx.fillStyle = ink.side1;
            ctx.strokeStyle = ink.faint;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(B.x, B.y);
            ctx.lineTo(C.x, C.y);
            ctx.lineTo(Cd.x, Cd.y);
            ctx.lineTo(Bd.x, Bd.y);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = ink.side2;
            ctx.beginPath();
            ctx.moveTo(D.x, D.y);
            ctx.lineTo(C.x, C.y);
            ctx.lineTo(Cd.x, Cd.y);
            ctx.lineTo(Dd.x, Dd.y);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            // top face
            ctx.beginPath();
            ctx.moveTo(A.x, A.y);
            ctx.lineTo(B.x, B.y);
            ctx.lineTo(C.x, C.y);
            ctx.lineTo(D.x, D.y);
            ctx.closePath();
            ctx.strokeStyle = highlight ? ink.line : ink.faint;
            ctx.lineWidth = highlight ? 1.5 : 1;
            ctx.stroke();
            // inset rebate
            const cen = { x: (A.x + B.x + C.x + D.x) / 4, y: (A.y + B.y + C.y + D.y) / 4 };
            const inset = (pt: Pt) => ({ x: pt.x + (cen.x - pt.x) * 0.1, y: pt.y + (cen.y - pt.y) * 0.1 });
            const iA = inset(A);
            const iB = inset(B);
            const iC = inset(C);
            const iD = inset(D);
            ctx.globalAlpha = clamp01(appear) * 0.55;
            ctx.beginPath();
            ctx.moveTo(iA.x, iA.y);
            ctx.lineTo(iB.x, iB.y);
            ctx.lineTo(iC.x, iC.y);
            ctx.lineTo(iD.x, iD.y);
            ctx.closePath();
            ctx.stroke();
            ctx.globalAlpha = clamp01(appear);
            // one mark per card, on a grid inside the plan
            const n = Math.max(0, Math.round(count));
            const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
            const rows = Math.max(1, Math.ceil(n / cols));
            const size = 3.2;
            ctx.fillStyle = highlight ? ink.mark : ink.markDim;
            for (let k = 0; k < n; k += 1) {
              const gx = cols === 1 ? 0 : (k % cols) / (cols - 1) - 0.5;
              const gz = rows === 1 ? 0 : Math.floor(k / cols) / (rows - 1) - 0.5;
              const pt = put(gx * hw * 1.5, gz * hd * 1.5, cy);
              ctx.fillRect(pt.x - size / 2, pt.y - size / 2, size, size);
            }
            ctx.globalAlpha = 1;
          };

          for (const floor of floors) drawPlate(floor, hovered === null || hovered === floor.type);

          // commander, detached
          const cmdAppear = clamp01((time - start - 700) / 900);
          const cmdCy = cmdY + (1 - cmdAppear) * 90;
          const cmd = {
            hw: 60,
            hd: 40,
            cy: cmdCy,
            appear: cmdAppear,
            count: shown.get("Commander") ?? 0,
            A: put(cmdShift - 60, -95 - 40, cmdCy),
            B: put(cmdShift + 60, -95 - 40, cmdCy),
            C: put(cmdShift + 60, -95 + 40, cmdCy),
            D: put(cmdShift - 60, -95 + 40, cmdCy),
          };
          drawPlate(cmd, true);

          // ---- callouts ----
          const labelX = w - 176;
          const callout = (anchor: Pt, text: string, appear: number, highlight: boolean) => {
            ctx.globalAlpha = clamp01(appear) * (highlight ? 1 : 0.32);
            ctx.strokeStyle = ink.faint;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(anchor.x + 6, anchor.y);
            ctx.lineTo(labelX - 10, anchor.y);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(labelX - 2, anchor.y, 1.8, 0, Math.PI * 2);
            ctx.fillStyle = ink.line;
            ctx.fill();
            ctx.fillStyle = highlight ? ink.textHi : ink.text;
            ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, monospace";
            ctx.textAlign = "left";
            ctx.fillText(text, labelX, anchor.y + 4);
            ctx.globalAlpha = 1;
          };
          for (const floor of floors) {
            const anchor = floor.B.x > floor.C.x ? floor.B : floor.C;
            const mvText = floor.type === "Land" ? "" : `   MV ${mv[floor.type].toFixed(2)}`;
            callout(anchor, `${floor.type}  ${Math.round(floor.count)}${mvText}`, floor.appear, hovered === null || hovered === floor.type);
          }
          const cmdAnchor = cmd.B.x > cmd.C.x ? cmd.B : cmd.C;
          callout({ x: cmdAnchor.x + 40, y: cmdAnchor.y }, `Commander  ${Math.round(cmd.count)}`, cmdAppear, true);
        },
      };
    },
    [medium],
  );

  const tone = medium === "night" ? { text: "#9aa1c9", hi: "#f1f3ff", line: "rgba(255,255,255,0.16)" } : { text: "#5a6157", hi: "#171a14", line: "rgba(20,24,16,0.2)" };

  return (
    <div className="relative overflow-hidden rounded-[28px] border border-white/10 p-5" style={{ background: ink.bg, color: tone.hi }}>
      <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[18px] leading-none font-semibold tracking-tight">Axonometric</p>
          <p className="mt-1.5 max-w-[62ch] text-[11px]" style={{ color: tone.text }}>
            The deck as an exploded drawing: each card type a floor, its footprint grown by its count — lands the foundation, the commander the
            detached crown. Hover a floor to isolate it; the playhead changes the storeys.
          </p>
        </div>
        <div className="flex gap-1 rounded-full border p-1" style={{ borderColor: tone.line }} role="group" aria-label="Sheet medium">
          {(["night", "sheet"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={medium === m}
              onClick={() => setMedium(m)}
              className="min-h-7 rounded-full px-3 font-mono text-[11px] tracking-[0.12em] uppercase"
              style={{ background: medium === m ? tone.hi : "transparent", color: medium === m ? ink.bg : tone.text }}
            >
              {m}
            </button>
          ))}
        </div>
      </div>
      <div
        ref={host}
        className="relative h-[460px] w-full"
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          pointer.current = { x: e.clientX - r.left, y: e.clientY - r.top };
        }}
        onPointerLeave={() => {
          pointer.current = null;
        }}
      >
        <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
        {/* title block, the way a sheet is signed */}
        <div className="pointer-events-none absolute right-3 bottom-3 w-44 border p-2 font-mono text-[10px] leading-relaxed" style={{ borderColor: tone.line, color: tone.text }}>
          <p className="text-[13px] tracking-tight" style={{ color: tone.hi }}>
            Kaalia of the Vast
          </p>
          <p>Eregion · deck sheet</p>
          <p>scale 1:100 · v{version + 1}</p>
          <p>N ↑ · {medium === "night" ? "line on black" : "ink on vellum"}</p>
        </div>
      </div>
    </div>
  );
}
