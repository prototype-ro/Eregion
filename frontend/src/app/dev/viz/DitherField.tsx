"use client";

import { Dither, DitheredWaves } from "ditherwave";
import { useEffect, useRef, useState } from "react";
import { CARDS, ROLE_HUES } from "./mock";

type Mode = "bayer" | "floyd" | "dots" | "ascii";

const MODES: Mode[] = ["bayer", "floyd", "dots", "ascii"];

/** The deck's cards as a field of role-coloured dots, drawn once into a canvas for the dither to read. */
function SourceCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;
    ctx.fillStyle = "#0c0d12";
    ctx.fillRect(0, 0, W, H);
    const cols = 12;
    const rows = Math.ceil(CARDS.length / cols);
    CARDS.forEach((card, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const x = 24 + col * ((W - 48) / (cols - 1));
      const y = 24 + row * ((H - 48) / Math.max(1, rows - 1));
      ctx.beginPath();
      ctx.arc(x, y, 9, 0, Math.PI * 2);
      ctx.fillStyle = `oklch(0.74 0.17 ${ROLE_HUES[card.role] ?? 250})`;
      ctx.fill();
    });
  }, []);
  return <canvas ref={ref} width={560} height={340} className="block h-full w-full" />;
}

/**
 * ditherwave: the halftone / dither register, straight from the library. `Dither` runs the live canvas
 * through a WebGL2 dithering pass; `DitheredWaves` is its animated noise background.
 */
export function DitherField() {
  const [mode, setMode] = useState<Mode>("dots");
  const [waves, setWaves] = useState(false);
  return (
    <div className="overflow-hidden rounded-[28px] border border-white/10 p-5 text-[#f1f3ff]" style={{ background: "#0c0d12" }}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[18px] leading-none font-semibold tracking-tight">Dither</p>
          <p className="mt-1.5 text-[11px]" style={{ color: "#9aa1c9" }}>
            ditherwave: the deck through a Bayer / halftone / ASCII pass.
          </p>
        </div>
        <button type="button" onClick={() => setWaves((v) => !v)} className={`rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-[0.12em] ${waves ? "border-[#5db1cf] text-[#5db1cf]" : "border-white/15 text-[#9aa1c9]"}`}>
          Waves
        </button>
      </div>
      <div className="relative h-[300px] w-full overflow-hidden rounded-xl">
        {waves ? (
          <DitheredWaves baseColor="#0c0d12" waveColor="#5db1cf" pixelSize={3} colorNum={4} className="h-full w-full" />
        ) : (
          <Dither mode={mode} palette={["#0c0d12", "#5db1cf"]} resolution={220} animate>
            <SourceCanvas />
          </Dither>
        )}
      </div>
      {!waves && (
        <div className="mt-4 flex flex-wrap gap-1">
          {MODES.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={mode === item}
              onClick={() => setMode(item)}
              className={`min-h-8 rounded-full border px-3 font-mono text-[11px] uppercase tracking-[0.12em] ${mode === item ? "border-[#f1f3ff] bg-[#f1f3ff] text-[#0c0d12]" : "border-white/15 text-[#9aa1c9]"}`}
            >
              {item}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
