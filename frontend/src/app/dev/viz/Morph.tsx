"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { interpolate } from "flubber";
import { useCanvasScene } from "./engine";
import { aggregate } from "./mock";

/** The mana curve of one version as a closed ring, in a fixed 100x60 space, for flubber to interpolate. */
function ringOf(curve: number[], max: number): Array<[number, number]> {
  const ring: Array<[number, number]> = [];
  for (let i = 0; i < curve.length; i += 1) ring.push([6 + (i / (curve.length - 1)) * 88, 54 - (curve[i] / max) * 48]);
  ring.push([94, 54]);
  ring.push([6, 54]);
  return ring;
}

const toPath = (ring: Array<[number, number]>) => `M${ring.map((p) => p.join(",")).join("L")}Z`;

/**
 * Flubber: interpolate the whole curve shape from one version to another. Flubber morphs arbitrary shapes
 * smoothly even when the point counts differ, which is exactly the case as the curve gains and loses cards.
 */
export function Morph() {
  const agg = useMemo(aggregate, []);
  const max = useMemo(() => Math.max(...agg.flatMap((entry) => entry.curve), 1), [agg]);
  const [from, setFrom] = useState(0);
  const [to, setTo] = useState(agg.length - 1);
  const [playing, setPlaying] = useState(true);
  const tRef = useRef(0);
  const dirRef = useRef(1);
  const interpRef = useRef<((t: number) => string) | null>(null);

  useEffect(() => {
    try {
      interpRef.current = interpolate(ringOf(agg[from].curve, max), ringOf(agg[to].curve, max), { maxSegmentLength: 1.2 });
    } catch {
      interpRef.current = null;
    }
  }, [from, to, agg, max]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      tRef.current += dirRef.current * 0.012;
      if (tRef.current > 1) {
        tRef.current = 1;
        dirRef.current = -1;
      } else if (tRef.current < 0) {
        tRef.current = 0;
        dirRef.current = 1;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const { host, canvas } = useCanvasScene(
    (ctx, w, h) => {
      const s = Math.min(w / 100, h / 60);
      const ox = (w - 100 * s) / 2;
      const oy = (h - 60 * s) / 2;
      return {
        paint: () => {
          ctx.save();
          ctx.translate(ox, oy);
          ctx.scale(s, s);
          ctx.lineWidth = 1.2 / s;
          ctx.strokeStyle = "rgba(154,161,201,0.32)";
          ctx.setLineDash([3 / s, 4 / s]);
          for (const index of [from, to]) ctx.stroke(new Path2D(toPath(ringOf(agg[index].curve, max))));
          ctx.setLineDash([]);
          const shape = interpRef.current?.(tRef.current);
          if (shape) {
            const path = new Path2D(shape);
            ctx.fillStyle = "oklch(0.7 0.15 235 / 0.5)";
            ctx.strokeStyle = "#7fd4ff";
            ctx.lineWidth = 1.6 / s;
            ctx.fill(path);
            ctx.stroke(path);
          }
          ctx.restore();
        },
      };
    },
    [from, to, agg, max],
  );

  return (
    <div className="overflow-hidden rounded-[28px] border border-white/10 p-5 text-[#f1f3ff]" style={{ background: "#0c0d12" }}>
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-[18px] leading-none font-semibold tracking-tight">Morph</p>
          <p className="mt-1.5 text-[11px]" style={{ color: "#9aa1c9" }}>
            flubber interpolates the whole curve shape between two versions, point counts and all.
          </p>
        </div>
        <p className="font-mono text-[11px] tracking-[0.12em] uppercase" style={{ color: "#9aa1c9" }}>
          v{from + 1} → v{to + 1}
        </p>
      </div>
      <div ref={host} className="relative h-[260px] w-full">
        <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3 text-[11px]" style={{ color: "#9aa1c9" }}>
        <label className="flex items-center gap-2">
          From
          <select value={from} onChange={(e) => setFrom(Number(e.target.value))} className="rounded-full border border-white/15 bg-transparent px-3 py-1 font-mono text-[#f1f3ff]">
            {agg.map((_, i) => (
              <option key={i} value={i} className="bg-[#0c0d12]">
                v{i + 1}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          To
          <select value={to} onChange={(e) => setTo(Number(e.target.value))} className="rounded-full border border-white/15 bg-transparent px-3 py-1 font-mono text-[#f1f3ff]">
            {agg.map((_, i) => (
              <option key={i} value={i} className="bg-[#0c0d12]">
                v{i + 1}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => setPlaying((v) => !v)} className="ml-auto rounded-full border border-white/15 px-3 py-1">
          {playing ? "Pause" : "Play"}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          defaultValue={0}
          onChange={(e) => {
            setPlaying(false);
            tRef.current = Number(e.target.value);
          }}
          aria-label="Morph amount"
          className="w-32 accent-[#5db1cf]"
        />
      </div>
    </div>
  );
}
