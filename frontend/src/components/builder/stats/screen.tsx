"use client";

import { createContext, useContext, type CSSProperties, type ReactNode } from "react";
import { DEFAULT_STRAND, toOklch } from "@/lib/artColor";

/**
 * The statistics panels are dark screens in both themes, in the language of the dot concepts: striped halftone dots, hollow rings
 * against solid dots for state, and one copper line for connections. A panel redefines the theme tokens for what sits inside it, so
 * the shared text-ink, text-muted and border-line classes read correctly on the screen whatever the page theme is.
 */

export const INK = "#f1f3ff";
export const MUTED = "#9aa1c9";
export const GRID = "rgba(160,170,255,0.07)";
export const COPPER = "oklch(0.68 0.13 45)";
export const COPPER_HOT = "oklch(0.82 0.1 50)";
export const SCREEN_BG = "#0c0d12";

const SCREEN_VARS = {
  "--bg": SCREEN_BG,
  "--surface": "#15161d",
  "--text": INK,
  "--muted": MUTED,
  "--line": "rgba(241,243,255,0.12)",
  "--accent-text": COPPER_HOT,
  "--on-accent": SCREEN_BG,
  color: INK,
  colorScheme: "dark",
} as CSSProperties;

/**
 * The glow of the composition and the curve: the version timeline's strand colour, so the deck page glows in one colour. Dots take
 * it at a lightness that follows their place in the halftone (1 at the core, 0 at the rim); lands and cards without a known job take
 * it at low chroma. The neon strands are capped a little so large dots do not bloom into one blob.
 */
export interface Glow {
  /** The strand colour itself, as the version timeline draws its light with it. */
  color: string;
  glow: (alpha?: number) => string;
  lit: (field: number, plain?: boolean) => string;
  hot: string;
  dim: string;
  /** Near white with a trace of the glow, for the bright centre of a lit dot. */
  core: string;
}

export function glowOf(color: string): Glow {
  const { l: rawL, c: rawC, h } = toOklch(color);
  const l = Math.min(rawL, 0.8);
  const c = Math.min(rawC, 0.2);
  const hue = h.toFixed(1);
  return {
    color,
    glow: (alpha = 1) => `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${hue} / ${alpha})`,
    lit: (field, plain = false) => `oklch(${(l * (0.55 + 0.45 * field)).toFixed(3)} ${(plain ? c * 0.25 : c).toFixed(3)} ${hue})`,
    hot: `oklch(${Math.min(0.97, l + 0.12).toFixed(3)} ${(c * 0.7).toFixed(3)} ${hue})`,
    dim: `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${hue} / 0.12)`,
    core: `oklch(${Math.min(0.98, l + 0.18).toFixed(3)} ${(c * 0.35).toFixed(3)} ${hue})`,
  };
}

const GlowContext = createContext<Glow>(glowOf(DEFAULT_STRAND));
export const GlowProvider = GlowContext.Provider;
export const useGlow = () => useContext(GlowContext);

/** Vertical line screen laid over dots, as on the composition square. */
export function Stripes({ id }: { id: string }) {
  return (
    <pattern id={id} width="3" height="3" patternUnits="userSpaceOnUse">
      <rect width="1" height="3" fill="#000" />
    </pattern>
  );
}

/** A small mono caption, the label style of the screens. */
export function Caption({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`font-mono text-[11px] tracking-[0.12em] text-muted uppercase ${className}`}>{children}</p>;
}

interface PanelProps {
  /** Left out for a panel that is all figures, such as the readout. */
  title?: string;
  right?: ReactNode;
  foot?: ReactNode;
  children: ReactNode;
  className?: string;
  /** For panels whose content can reach past the edge, such as the win turn pin. */
  clip?: boolean;
}

export function Panel({ title, right, foot, children, className = "", clip = true }: PanelProps) {
  return (
    <div
      className={`flex min-w-0 flex-col rounded-[28px] border border-white/10 p-5 sm:p-6 ${clip ? "overflow-hidden" : "overflow-x-clip"} ${className}`}
      style={{ ...SCREEN_VARS, background: SCREEN_BG }}
    >
      {(title || right) && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          {title && <h3 className="text-[20px] leading-none font-semibold tracking-tight">{title}</h3>}
          {right}
        </div>
      )}
      <div className="min-w-0 flex-1">{children}</div>
      {foot && <div className="mt-4 min-h-[2.5em] font-mono text-[11px] leading-relaxed text-muted">{foot}</div>}
    </div>
  );
}

/** A segmented pill toggle for inside a screen. */
export function ScreenToggle<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<[T, string]>;
  onChange: (next: T) => void;
}) {
  return (
    <div className="flex gap-1 rounded-full border border-white/10 p-1" role="group" aria-label={label}>
      {options.map(([key, text]) => (
        <button
          key={key}
          type="button"
          aria-pressed={value === key}
          onClick={() => onChange(key)}
          className={`min-h-8 rounded-full px-3 font-mono text-[11px] tracking-[0.12em] uppercase transition-colors [@media(pointer:coarse)]:min-h-11 ${value === key ? "bg-ink text-bg" : "text-muted hover:text-ink"}`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

/** A quiet pill button for inside a screen. */
export const SCREEN_BUTTON =
  "inline-flex min-h-9 items-center justify-center rounded-full border border-white/15 px-4 font-mono text-[11px] tracking-[0.12em] text-muted uppercase transition-colors hover:text-ink [@media(pointer:coarse)]:min-h-11";

const DOTS = 24;

/**
 * A meter made of dots: the filled share is solid, the rest are hollow rings. The last filled dot takes its partial size, so the
 * value still reads between steps.
 */
export function DotMeter({ value, dots = DOTS }: { value: number; dots?: number }) {
  const share = Math.min(1, Math.max(0, value)) * dots;
  const pitch = 8;
  const r = 2.6;
  return (
    <svg viewBox={`0 0 ${dots * pitch} ${pitch}`} className="block h-2 w-full" preserveAspectRatio="xMinYMid meet" aria-hidden="true">
      {Array.from({ length: dots }, (_, i) => {
        const part = Math.min(1, Math.max(0, share - i));
        const cx = i * pitch + pitch / 2;
        return part > 0 ? (
          <circle key={i} cx={cx} cy={pitch / 2} r={Math.max(1, r * Math.sqrt(part))} fill={INK} />
        ) : (
          <circle key={i} cx={cx} cy={pitch / 2} r={r - 0.6} fill="none" stroke="rgba(241,243,255,0.18)" strokeWidth="0.9" />
        );
      })}
    </svg>
  );
}

/** A labelled row with a dot meter under it. */
export function MeterRow({ label, value, shown, hint, ariaValue }: { label: ReactNode; value: number; shown: string; hint?: ReactNode; ariaValue?: string }) {
  return (
    <li className="py-2">
      <div className="flex justify-between gap-4 text-[14px]">
        <span>
          {label}
          {hint && <span className="block text-[12px] text-muted">{hint}</span>}
        </span>
        <span className="font-mono text-[12px] text-muted" aria-label={ariaValue}>
          {shown}
        </span>
      </div>
      <div className="mt-1.5">
        <DotMeter value={value} />
      </div>
    </li>
  );
}
