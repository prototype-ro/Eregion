"use client";

import { formatHex, interpolate, oklch, wcagContrast } from "culori";
import { useMemo } from "react";
import { ROLE_HUES, ROLE_ORDER } from "./mock";

const BG = "#0c0d12";

/**
 * culori: everything here is computed in OKLCH rather than written as CSS strings — the role colours are
 * built as oklch objects, converted to hex for display, and placed in the a/b chroma plane so the hues are
 * seen as the eye sees them. The ramp and the contrast numbers come from culori too.
 */
export function OklchPanel() {
  const roles = useMemo(
    () =>
      ROLE_ORDER.map((role) => {
        const color = { mode: "oklch", l: 0.74, c: 0.15, h: ROLE_HUES[role] ?? 250 };
        const parsed = oklch(color) ?? { l: 0.74, c: 0.15, h: 0 };
        return {
          role,
          hex: formatHex(color),
          a: parsed.c * Math.cos((parsed.h * Math.PI) / 180),
          b: parsed.c * Math.sin((parsed.h * Math.PI) / 180),
        };
      }),
    [],
  );
  const ramp = useMemo(() => {
    const mix = interpolate([BG, "#5db1cf"], "oklab");
    return Array.from({ length: 12 }, (_, i) => formatHex(mix(i / 11)));
  }, []);
  const contrast = Math.round(wcagContrast(BG, "#5db1cf") * 100) / 100;
  const W = 540;
  const H = 380;
  const cx = W / 2;
  const cy = H / 2;
  const scale = 700; // chroma units to px

  return (
    <div className="overflow-hidden rounded-[28px] border border-white/10 p-5 text-[#f1f3ff]" style={{ background: "#0c0d12" }}>
      <p className="text-[18px] leading-none font-semibold tracking-tight">OKLCH</p>
      <p className="mt-1.5 text-[11px]" style={{ color: "#9aa1c9" }}>
        culori: the role colours in the OKLCH a/b plane, and an OKLab ramp with its contrast.
      </p>
      <div className="mt-3 grid gap-4 sm:grid-cols-[1fr_minmax(0,220px)]">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Role colours in the OKLCH chroma plane">
          <line x1={0} y1={cy} x2={W} y2={cy} stroke="rgba(160,170,255,0.12)" />
          <line x1={cx} y1={0} x2={cx} y2={H} stroke="rgba(160,170,255,0.12)" />
          {[0.05, 0.1, 0.15].map((r) => (
            <circle key={r} cx={cx} cy={cy} r={r * scale} fill="none" stroke="rgba(160,170,255,0.1)" />
          ))}
          {roles.map((role) => (
            <g key={role.role}>
              <line x1={cx} y1={cy} x2={cx + role.a * scale} y2={cy - role.b * scale} stroke="rgba(160,170,255,0.18)" />
              <circle cx={cx + role.a * scale} cy={cy - role.b * scale} r={9} fill={role.hex} />
              <text x={cx + role.a * scale + 14} y={cy - role.b * scale + 4} fontSize="11" fontFamily="var(--font-mono)" fill="#9aa1c9">
                {role.role}
              </text>
            </g>
          ))}
        </svg>
        <div className="flex flex-col justify-center gap-4">
          <div>
            <p className="mb-1.5 font-mono text-[11px] tracking-[0.12em] uppercase" style={{ color: "#9aa1c9" }}>
              OKLab ramp
            </p>
            <div className="flex h-6 overflow-hidden rounded-full">
              {ramp.map((hex, i) => (
                <span key={i} className="flex-1" style={{ background: hex }} />
              ))}
            </div>
          </div>
          <p className="font-mono text-[11px]" style={{ color: "#9aa1c9" }}>
            accent on the ground: <span className="text-[#f1f3ff]">{contrast}:1</span>
          </p>
        </div>
      </div>
    </div>
  );
}
