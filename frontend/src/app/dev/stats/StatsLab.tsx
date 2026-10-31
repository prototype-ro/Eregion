"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { percent } from "@/lib/analysis";
import { ALMANAC, CHANCES, COLOR_ORDER, COMPOSITION, LAND_BY_TURN, MANA_COLORS, SPEED } from "./mock";

const STORE = "eregion-dev-stats-lab";
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

interface Settings {
  /** Glow on a dark page, or ink on a light one. The same diagrams in the app's two mediums. */
  medium: "glow" | "ink";
  /** The closest the hatch lines can get; lower is denser and darker. */
  density: number;
  /** Hatch line angle, in degrees. */
  angle: number;
  /** Whether cells and marks carry their number. */
  values: boolean;
}

const CURRENT: Settings = { medium: "glow", density: 4, angle: 60, values: true };

const PRESETS: Array<[string, Settings]> = [
  ["Glow", CURRENT],
  ["Engraved (ink)", { ...CURRENT, medium: "ink", density: 3, angle: 35 }],
  ["Bold hatch", { ...CURRENT, density: 2, angle: 20 }],
  ["Clean (no hatch)", { ...CURRENT, medium: "ink", density: 9, angle: 90 }],
];

/** Spacing between hatch lines: dense when the value is high, open when it is low. */
const hatchSpacing = (value: number, base: number) => base + (1 - clamp01(value)) * 9;

/** A hatch fill for CSS boxes, so a value can be read as line density rather than colour. */
const cssHatch = (color: string, spacing: number, angle: number) => `repeating-linear-gradient(${angle}deg, ${color} 0 1px, transparent 1px ${spacing}px)`;

/** A donut slice between two radii, from angle a0 to a1 (radians). */
function annular(r0: number, r1: number, a0: number, a1: number): string {
  const point = (r: number, a: number) => `${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${point(r1, a0)} A ${r1} ${r1} 0 ${large} 1 ${point(r1, a1)} L ${point(r0, a1)} A ${r0} ${r0} 0 ${large} 0 ${point(r0, a0)} Z`;
}

function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Array<[T, string]>; onChange: (next: T) => void }) {
  return (
    <div>
      <p className="mb-1.5 text-xs text-muted">{label}</p>
      <div className="flex flex-wrap gap-1" role="group" aria-label={label}>
        {options.map(([key, text]) => (
          <button key={key} type="button" aria-pressed={value === key} onClick={() => onChange(key)} className={`min-h-8 rounded-full border px-3 text-xs transition-colors ${value === key ? "border-ink bg-ink text-bg" : "border-line text-muted hover:text-ink"}`}>
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

function Slide({ label, value, min, max, step = 1, unit = "", onChange }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (next: number) => void }) {
  return (
    <label className="grid grid-cols-[72px_1fr_44px] items-center gap-2 text-xs">
      <span className="text-muted">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="accent-[var(--accent-text)]" />
      <span className="text-right font-mono tabular-nums">
        {value}
        {unit}
      </span>
    </label>
  );
}

function Flag({ label, value, onChange }: { label: string; value: boolean; onChange: (next: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={value} onClick={() => onChange(!value)} className="flex items-center justify-between gap-3 text-xs">
      <span className="text-muted">{label}</span>
      <span className={`relative h-5 w-9 rounded-full border transition-colors ${value ? "border-accent-text bg-accent" : "border-line bg-surface"}`}>
        <span className={`absolute top-0.5 size-3.5 rounded-full bg-ink transition-all ${value ? "left-[18px]" : "left-0.5"}`} />
      </span>
    </button>
  );
}

function Plate({ title, caption, hint, children }: { title: string; caption: string; hint: string; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col rounded-[28px] border border-line p-6">
      <h2 className="font-display text-3xl leading-none">{title}</h2>
      <p className="mt-2 text-xs tracking-[0.12em] text-muted uppercase">{hint}</p>
      <div className="mt-6 flex-1">{children}</div>
      <p className="mt-5 text-sm text-muted">{caption}</p>
    </section>
  );
}

/** The style of a line and a hatch for the chosen medium. Ink is darker and still; glow carries the accent and a soft halo. */
function mediumStyle(medium: Settings["medium"]) {
  const ink = medium === "ink";
  return {
    stroke: ink ? "color-mix(in srgb, var(--accent-text) 45%, var(--text))" : "var(--accent-text)",
    hatch: ink ? "color-mix(in srgb, var(--text) 52%, transparent)" : "var(--accent-text)",
    glow: ink ? undefined : "drop-shadow(0 0 5px color-mix(in srgb, var(--accent-text) 62%, transparent))",
  };
}

/** Color pips on the outer ring, sources on the inner ring, the five colours around the wheel. */
function RoseWindow({ s }: { s: Settings }) {
  const maxPip = Math.max(...COLOR_ORDER.map((c) => COMPOSITION.pips[c] ?? 0), 1);
  const maxSrc = Math.max(...COLOR_ORDER.map((c) => COMPOSITION.sources[c] ?? 0), 1);
  const gap = (5 * Math.PI) / 180;
  const span = (2 * Math.PI) / 5;
  return (
    <svg viewBox="-142 -142 284 284" className="mx-auto w-full max-w-[340px]" role="img" aria-label="Colour rose: pips on the outer ring, sources on the inner ring">
      <defs>
        {COLOR_ORDER.map((c) => {
          const pip = COMPOSITION.pips[c] ?? 0;
          const src = COMPOSITION.sources[c] ?? 0;
          const pipGap = hatchSpacing(pip / maxPip, s.density);
          const srcGap = hatchSpacing(src / maxSrc, s.density);
          return (
            <g key={c}>
              <pattern id={`pip-${c}`} width={pipGap} height={pipGap} patternUnits="userSpaceOnUse" patternTransform={`rotate(${s.angle})`}>
                <line x1={0} y1={0} x2={0} y2={pipGap} stroke={MANA_COLORS[c]} strokeWidth={1.6} opacity={0.9} />
              </pattern>
              <pattern id={`src-${c}`} width={srcGap} height={srcGap} patternUnits="userSpaceOnUse" patternTransform={`rotate(${s.angle})`}>
                <line x1={0} y1={0} x2={0} y2={srcGap} stroke={MANA_COLORS[c]} strokeWidth={1.1} opacity={0.55} />
              </pattern>
            </g>
          );
        })}
      </defs>
      <g style={{ filter: s.medium === "glow" ? "drop-shadow(0 0 4px color-mix(in srgb, var(--accent-text) 30%, transparent))" : undefined }}>
        {COLOR_ORDER.map((c, i) => {
          const a0 = -Math.PI / 2 + i * span + gap / 2;
          const a1 = a0 + span - gap;
          const pip = COMPOSITION.pips[c] ?? 0;
          const src = COMPOSITION.sources[c] ?? 0;
          const empty = pip === 0 && src === 0;
          const mid = (a0 + a1) / 2;
          return (
            <g key={c}>
              <path d={annular(92, 122, a0, a1)} fill={pip ? `url(#pip-${c})` : "none"} stroke={MANA_COLORS[c]} strokeOpacity={empty ? 0.16 : 0.85} strokeWidth={1} />
              <path d={annular(62, 88, a0, a1)} fill={src ? `url(#src-${c})` : "none"} stroke={MANA_COLORS[c]} strokeOpacity={empty ? 0.12 : 0.5} strokeWidth={1} />
              <text x={Math.cos(mid) * 134} y={Math.sin(mid) * 134} textAnchor="middle" dominantBaseline="central" fontSize="14" fontFamily="var(--font-mono)" fill={MANA_COLORS[c]} opacity={empty ? 0.22 : 0.9}>
                {c}
              </text>
            </g>
          );
        })}
      </g>
      <circle r={54} fill="none" stroke="var(--line)" />
      <text y={-6} textAnchor="middle" fontSize="10" fontFamily="var(--font-mono)" fill="var(--muted)">
        median MV
      </text>
      <text y={20} textAnchor="middle" fontSize="30" fontFamily="var(--font-mono)" fill="var(--text)">
        {COMPOSITION.medianManaValue}
      </text>
    </svg>
  );
}

const TURNS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/** The path to a win: land drops piling up over the turns, with the commander and combo as milestones below. */
function Route({ s }: { s: Settings }) {
  const style = mediumStyle(s.medium);
  const width = 1000;
  const roadY = 130;
  const left = 60;
  const right = 940;
  const x = (turn: number) => left + ((turn - 1) / (TURNS.length - 1)) * (right - left);
  const hatch = hatchSpacing(1, s.density);
  const commanderAt = x(SPEED.commanderTurn);
  const comboAt = x(SPEED.comboTurn);
  return (
    <svg viewBox={`0 0 ${width} 240`} className="w-full" role="img" aria-label="Route to a win: land drops by turn, with the commander and combo milestones">
      <defs>
        <pattern id="route-hatch" width={hatch} height={hatch} patternUnits="userSpaceOnUse" patternTransform={`rotate(${s.angle})`}>
          <line x1={0} y1={0} x2={0} y2={hatch} stroke={style.hatch} strokeWidth={1.2} opacity={0.85} />
        </pattern>
      </defs>

      {/* Land columns above the road. */}
      {TURNS.map((turn) => {
        const value = LAND_BY_TURN[turn - 1] ?? 1;
        const height = value * 78;
        const xx = x(turn);
        return (
          <g key={turn}>
            <rect x={xx - 13} y={roadY - height} width={26} height={height} fill="url(#route-hatch)" stroke={style.stroke} strokeOpacity={0.4} style={{ filter: style.glow }} />
            {s.values && (
              <text x={xx} y={roadY - height - 7} textAnchor="middle" fontSize="11" fontFamily="var(--font-mono)" fill="var(--muted)">
                {Math.round(value * 100)}
              </text>
            )}
          </g>
        );
      })}

      {/* The road and its turn ticks. */}
      <line x1={left - 20} y1={roadY} x2={right + 20} y2={roadY} stroke={style.stroke} strokeWidth={1.5} style={{ filter: style.glow }} />
      {TURNS.map((turn) => (
        <g key={turn}>
          <line x1={x(turn)} y1={roadY} x2={x(turn)} y2={roadY + 5} stroke="var(--line)" />
          <text x={x(turn)} y={roadY + 18} textAnchor="middle" fontSize="11" fontFamily="var(--font-mono)" fill="var(--muted)">
            {turn}
          </text>
        </g>
      ))}

      {/* Commander milestone. */}
      <line x1={commanderAt} y1={roadY} x2={commanderAt} y2={roadY + 44} stroke={style.stroke} strokeDasharray="3 4" style={{ filter: style.glow }} />
      <circle cx={commanderAt} cy={roadY + 44} r={6} fill="var(--bg)" stroke={style.stroke} strokeWidth={2} style={{ filter: style.glow }} />
      <text x={commanderAt} y={roadY + 68} textAnchor="middle" fontSize="12" fontFamily="var(--font-mono)" fill="var(--text)">
        Commander {SPEED.commanderTurn}
      </text>
      <text x={commanderAt} y={roadY + 84} textAnchor="middle" fontSize="11" fontFamily="var(--font-mono)" fill="var(--muted)">
        by T6 {percent(SPEED.commanderByTurn["6"])}
      </text>

      {/* Combo milestone. */}
      <line x1={comboAt} y1={roadY} x2={comboAt} y2={roadY + 98} stroke={style.stroke} strokeDasharray="3 4" opacity={0.8} style={{ filter: style.glow }} />
      <circle cx={comboAt} cy={roadY + 98} r={6} fill="var(--bg)" stroke={style.stroke} strokeWidth={2} style={{ filter: style.glow }} />
      <text x={comboAt} y={roadY + 122} textAnchor="middle" fontSize="12" fontFamily="var(--font-mono)" fill="var(--text)">
        Combo {SPEED.comboTurn}
      </text>
      <text x={comboAt} y={roadY + 138} textAnchor="middle" fontSize="11" fontFamily="var(--font-mono)" fill="var(--muted)">
        by T8 {percent(SPEED.comboByTurn["8"])}
      </text>
    </svg>
  );
}

/** Each chance as a ten-mark tally, the archival take on a probability bar. */
function Abacus({ s }: { s: Settings }) {
  return (
    <ul className="flex flex-col gap-4">
      {CHANCES.map((chance) => {
        const filled = Math.round(chance.value * 10);
        return (
          <li key={chance.label}>
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-[15px]">
                {chance.label}
                {chance.hint && <span className="block text-sm text-muted">{chance.hint}</span>}
              </span>
              <span className="font-mono text-[13px] text-muted">{percent(chance.value)}</span>
            </div>
            <div className="mt-2 flex gap-1" aria-hidden="true">
              {Array.from({ length: 10 }, (_, mark) => (
                <span key={mark} className={`h-3.5 flex-1 rounded-[3px] border ${mark < filled ? "border-accent-text bg-accent-text/70" : "border-line bg-transparent"}`} />
              ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** A small grid of whether things are likely by each turn. Line density is the chance. */
function Almanac({ s }: { s: Settings }) {
  const style = mediumStyle(s.medium);
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-1 text-left">
        <caption className="sr-only">Chance of each thing being available by each turn</caption>
        <thead>
          <tr>
            <th scope="col" className="w-28" />
            {ALMANAC.turns.map((turn) => (
              <th key={turn} scope="col" className="pb-1 text-center font-mono text-[11px] font-normal text-muted">
                T{turn}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ALMANAC.rows.map((row) => (
            <tr key={row.label}>
              <th scope="row" className="pr-2 text-right text-[13px] font-normal text-muted">
                {row.label}
              </th>
              {row.values.map((value, index) => (
                <td key={index}>
                  <div
                    className="flex h-11 items-center justify-center rounded-md border border-line"
                    style={{ backgroundImage: cssHatch(style.hatch, hatchSpacing(value, s.density), s.angle), filter: s.medium === "glow" ? "drop-shadow(0 0 3px color-mix(in srgb, var(--accent-text) 25%, transparent))" : undefined }}
                    title={`${Math.round(value * 100)}% by turn ${ALMANAC.turns[index]}`}
                  >
                    {s.values && <span className="font-mono text-[10px] text-muted">{Math.round(value * 100)}</span>}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The setup speed from the goldfish sim, as a river of mana by turn. */
function Strata({ s }: { s: Settings }) {
  const style = mediumStyle(s.medium);
  const top = Math.max(...SPEED.manaByTurn, 1);
  return (
    <div>
      <div className="flex h-40 items-end gap-2 border-b border-line">
        {SPEED.manaByTurn.map((mana, index) => (
          <div key={index} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
            {s.values && <span className="font-mono text-xs text-muted">{mana.toFixed(1)}</span>}
            <div className="w-full rounded-t" style={{ height: `${(mana / top) * 100}%`, backgroundImage: cssHatch(style.hatch, hatchSpacing(mana / top, s.density), s.angle), border: `1px solid ${style.stroke}`, borderBottom: "none", filter: style.glow }} />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2 font-mono text-xs text-muted">
        {SPEED.manaByTurn.map((_, index) => (
          <span key={index} className="min-w-0 flex-1 text-center">
            {index + 1}
          </span>
        ))}
      </div>
    </div>
  );
}

export function StatsLab() {
  const [s, setS] = useState<Settings>(CURRENT);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) ?? "null");
      if (saved) setS({ ...CURRENT, ...saved });
    } catch {
      // Storage can be blocked. The settings then last until the page is reloaded.
    }
  }, []);

  const save = (next: Settings) => {
    setS(next);
    try {
      localStorage.setItem(STORE, JSON.stringify(next));
    } catch {
      // Not remembered, which is fine here.
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

  const group = (title: string, children: ReactNode) => (
    <fieldset className="flex flex-col gap-3 border-t border-line pt-4">
      <legend className="sr-only">{title}</legend>
      <p className="text-[11px] tracking-[0.14em] text-muted uppercase">{title}</p>
      {children}
    </fieldset>
  );

  const plates = useMemo<Array<{ title: string; hint: string; caption: string; body: ReactNode; wide?: boolean }>>(
    () => [
      {
        title: "Rose window",
        hint: "Colours",
        caption: "Outer ring is the coloured pips in the costs, inner ring is the sources that can make each colour. A fat outer ring over a thin inner one is a colour that will starve.",
        body: <RoseWindow s={s} />,
      },
      {
        title: "The route",
        hint: "Path to a win",
        wide: true,
        caption: "Land drops piling up turn by turn, with the turn the commander can be cast and the turn a combo comes online marked below. The deck's game in one image.",
        body: <Route s={s} />,
      },
      {
        title: "The abacus",
        hint: "Consistency",
        caption: "Every chance as a ten-mark tally beside its exact percent. No bars, no false precision, and it reads like a ledger.",
        body: <Abacus s={s} />,
      },
      {
        title: "The almanac",
        hint: "By turn",
        caption: "Whether each thing is likely by each turn. Line density is the chance; the weak turn is the pale row.",
        body: <Almanac s={s} />,
      },
      {
        title: "The strata",
        hint: "Setup speed",
        caption: `Average mana left for spells each turn, from ${SPEED.games} simulated games. The slope is how fast the deck gets going.`,
        body: <Strata s={s} />,
      },
    ],
    [s],
  );

  return (
    <div className="mx-auto max-w-[1800px] px-5 pb-24 sm:px-8">
      <header className="pt-10 pb-6">
        <h1 className="font-display text-[clamp(44px,6vw,84px)] leading-none">Stats lab</h1>
        <p className="mt-3 max-w-[72ch] text-muted">
          The stats drawn as instruments from the deck&rsquo;s own world: a rose window, a route, a tally, an almanac, a river. The value is carried by
          line density and the one accent, not by a rainbow, and the same diagrams render as light on the dark theme and as ink on the light one. All
          numbers are made up.
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
          {group(
            "Medium",
            <>
              <Seg label="Rendering" value={s.medium} options={[["glow", "Glow (light)"], ["ink", "Ink (stain)"]]} onChange={(value) => set("medium", value)} />
              <p className="text-xs text-muted">Glow draws the data as light that adds to the page; ink draws it as lines that darken it. The two themes of the app.</p>
            </>,
          )}
          {group(
            "Engraving",
            <>
              <Slide label="Density" value={s.density} min={2} max={9} onChange={(value) => set("density", value)} />
              <Slide label="Angle" value={s.angle} min={0} max={180} step={5} unit="°" onChange={(value) => set("angle", value)} />
              <Flag label="Show the numbers" value={s.values} onChange={(value) => set("values", value)} />
            </>,
          )}
          <button type="button" onClick={() => void copy()} className="min-h-9 rounded-full border border-line text-xs hover:border-ink">
            {copied ? "Copied" : "Copy these settings"}
          </button>
        </aside>

        <main className="grid min-w-0 gap-6 md:grid-cols-2">
          {plates.map((plate) => (
            <div key={plate.title} className={plate.wide ? "md:col-span-2" : ""}>
              <Plate title={plate.title} hint={plate.hint} caption={plate.caption}>
                {plate.body}
              </Plate>
            </div>
          ))}
        </main>
      </div>
    </div>
  );
}
