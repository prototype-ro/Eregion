"use client";

import { useEffect, useState, type ReactNode } from "react";
import { DECKS } from "./mock";
import { Schematic, type Look } from "./Schematic";
import { SHAPES, type ShapeKey } from "./shapes";

const STORE = "eregion-dev-schematic-lab";

interface Settings extends Look {
  deck: number;
  view: "single" | "compare";
}

/** The Andor cockpit screen: red outline ship, teal ticks with amber underline. */
const CURRENT: Settings = {
  deck: 0,
  view: "single",
  shape: "ship",
  hue: 25,
  chroma: 0.2,
  tickHue: 190,
  weight: 1.6,
  glow: 3,
  glowStrength: 0.7,
  fill: "solid",
  fillAmount: 0.22,
  level: "binary",
  empty: "dim",
  labels: "off",
  ticks: "cards",
  frame: true,
  details: true,
  fringe: true,
  scanlines: true,
  vignette: true,
  flicker: false,
  ground: "black",
};

const PRESETS: Array<[string, Settings]> = [
  ["Andor", CURRENT],
  ["Lyons stars", { ...CURRENT, shape: "stars", hue: 225, chroma: 0.12, tickHue: 225, fill: "hatch", fillAmount: 0.35, labels: "callouts", ground: "navy", fringe: false }],
  ["Amber CRT", { ...CURRENT, shape: "card", hue: 75, chroma: 0.16, tickHue: 75, fill: "hatch", fillAmount: 0.4, level: "level", glow: 2, labels: "inline", ground: "smoke" }],
  ["Holo layers", { ...CURRENT, shape: "spire", hue: 205, chroma: 0.14, tickHue: 300, glow: 7, glowStrength: 0.9, fillAmount: 0.3, level: "opacity", labels: "callouts", scanlines: false, ground: "navy", fringe: false }],
  ["Radar", { ...CURRENT, shape: "ring", hue: 150, chroma: 0.18, tickHue: 150, fill: "dots", fillAmount: 0.5, level: "level", empty: "dashed", labels: "callouts" }],
  ["Bare white", { ...CURRENT, shape: "gem", chroma: 0, tickHue: 0, glow: 0, fill: "edge", empty: "dashed", frame: false, fringe: false, scanlines: false, vignette: false, ticks: "bars" }],
];

const HUES: Array<[number, string]> = [
  [25, "Red"],
  [75, "Amber"],
  [150, "Green"],
  [190, "Teal"],
  [225, "Lyons"],
  [300, "Violet"],
];

export function SchematicLab() {
  const [s, setS] = useState<Settings>(CURRENT);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORE);
      if (saved) setS({ ...CURRENT, ...JSON.parse(saved) });
    } catch {}
  }, []);

  const save = (next: Settings) => {
    try {
      localStorage.setItem(STORE, JSON.stringify(next));
    } catch {}
    return next;
  };
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => setS((cur) => save({ ...cur, [key]: value }));

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(s, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {}
  };

  const deck = DECKS[s.deck] ?? DECKS[0];

  return (
    <main className="mx-auto max-w-[1500px] px-4 py-8 sm:px-6">
      <style>{`
        @keyframes schematic-flicker { 0%, 100% { opacity: 1 } 47% { opacity: 1 } 48% { opacity: .82 } 49% { opacity: 1 } 73% { opacity: .93 } 74% { opacity: 1 } }
        .schematic-flicker { animation: schematic-flicker 3.2s steps(1) infinite; }
        @media (prefers-reduced-motion: reduce) { .schematic-flicker { animation: none } }
      `}</style>
      <header className="mb-6">
        <p className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase">Dev lab</p>
        <h1 className="mt-1 text-[28px] leading-tight font-semibold tracking-tight">Deck schematic</h1>
        <p className="mt-2 max-w-[680px] text-sm text-muted">
          The deck drawn as one glowing outline. Each part is a role and lights up when the deck has enough of it; the empty ones stay as an outline. Ticks on top are the mana curve, one per card.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="space-y-5 lg:sticky lg:top-4 lg:max-h-[calc(100vh-32px)] lg:self-start lg:overflow-auto lg:pr-2">
          <div className="flex flex-wrap gap-1">
            {PRESETS.map(([name, p]) => (
              <button key={name} type="button" onClick={() => setS(save({ ...p, deck: s.deck, view: s.view }))} className="min-h-8 rounded-full border border-line px-3 text-xs text-muted hover:text-ink">
                {name}
              </button>
            ))}
          </div>

          <Group legend="Shape">
            <Seg label="Outline" value={s.shape} options={SHAPES.map((x) => [x.key, x.name] as [ShapeKey, string])} onChange={(v) => set("shape", v)} />
            <Seg label="View" value={s.view} options={[["single", "One"], ["compare", "All shapes"]]} onChange={(v) => set("view", v)} />
            <Seg label="Deck" value={String(s.deck)} options={DECKS.map((d, i) => [String(i), d.name] as [string, string])} onChange={(v) => set("deck", Number(v))} />
          </Group>

          <Group legend="Colour">
            <div className="flex flex-wrap gap-1">
              {HUES.map(([h, name]) => (
                <button key={name} type="button" aria-pressed={s.hue === h} onClick={() => setS((c) => save({ ...c, hue: h, chroma: c.chroma || 0.18 }))} className={`flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs ${s.hue === h ? "border-ink text-ink" : "border-line text-muted"}`}>
                  <span className="size-2.5 rounded-full" style={{ background: `oklch(0.7 0.2 ${h})` }} />
                  {name}
                </button>
              ))}
            </div>
            <Slide label="Hue" value={s.hue} min={0} max={360} onChange={(v) => set("hue", v)} />
            <Slide label="Saturation" value={s.chroma} min={0} max={0.3} step={0.01} onChange={(v) => set("chroma", v)} />
            <Slide label="Tick hue" value={s.tickHue} min={0} max={360} onChange={(v) => set("tickHue", v)} />
            <Seg label="Ground" value={s.ground} options={[["black", "Black"], ["navy", "Navy"], ["smoke", "Smoke"]]} onChange={(v) => set("ground", v)} />
          </Group>

          <Group legend="Line and glow">
            <Slide label="Line weight" value={s.weight} min={0.5} max={4} step={0.1} onChange={(v) => set("weight", v)} />
            <Slide label="Glow" value={s.glow} min={0} max={12} step={0.5} onChange={(v) => set("glow", v)} />
            <Slide label="Glow strength" value={s.glowStrength} min={0.1} max={1.5} step={0.05} onChange={(v) => set("glowStrength", v)} />
            <Flag label="Colour fringe" value={s.fringe} onChange={(v) => set("fringe", v)} />
            <Flag label="Detail lines" value={s.details} onChange={(v) => set("details", v)} />
          </Group>

          <Group legend="Parts">
            <Seg label="Fill" value={s.fill} options={[["solid", "Solid"], ["hatch", "Hatch"], ["dots", "Dots"], ["edge", "Outline only"]]} onChange={(v) => set("fill", v)} />
            <Slide label="Fill amount" value={s.fillAmount} min={0.05} max={0.8} step={0.01} onChange={(v) => set("fillAmount", v)} />
            <Seg label="When short" value={s.level} options={[["binary", "Lit or not"], ["level", "Fill level"], ["opacity", "Fade"]]} onChange={(v) => set("level", v)} />
            <Seg label="Empty part" value={s.empty} options={[["dim", "Dim"], ["dashed", "Dashed"], ["warn", "Amber"]]} onChange={(v) => set("empty", v)} />
            <Seg label="Labels" value={s.labels} options={[["off", "Off"], ["inline", "Inside"], ["callouts", "Callouts"]]} onChange={(v) => set("labels", v)} />
          </Group>

          <Group legend="Screen">
            <Seg label="Curve ticks" value={s.ticks} options={[["cards", "One per card"], ["bars", "Bars"], ["off", "Off"]]} onChange={(v) => set("ticks", v)} />
            <Flag label="Corner frame" value={s.frame} onChange={(v) => set("frame", v)} />
            <Flag label="Scanlines" value={s.scanlines} onChange={(v) => set("scanlines", v)} />
            <Flag label="Vignette" value={s.vignette} onChange={(v) => set("vignette", v)} />
            <Flag label="Flicker" value={s.flicker} onChange={(v) => set("flicker", v)} />
          </Group>

          <button type="button" onClick={copy} className="min-h-9 w-full rounded-full border border-ink bg-ink text-xs text-bg">
            {copied ? "Copied" : "Copy these settings"}
          </button>
        </aside>

        <section>
          {s.view === "single" ? (
            <Schematic look={s} deck={deck} />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {SHAPES.map((x) => (
                <button key={x.key} type="button" onClick={() => setS((c) => save({ ...c, shape: x.key, view: "single" }))} className="text-left">
                  <Schematic look={{ ...s, shape: x.key }} deck={deck} compact />
                  <p className="mt-1.5 font-mono text-[11px] text-muted">{x.name}</p>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function Group({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-3 border-t border-line pt-3">
      <legend className="pr-2 font-mono text-[10px] tracking-[0.14em] text-muted uppercase">{legend}</legend>
      {children}
    </fieldset>
  );
}

function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Array<[T, string]>; onChange: (v: T) => void }) {
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

function Slide({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void }) {
  return (
    <label className="grid grid-cols-[84px_1fr_44px] items-center gap-2 text-xs">
      <span className="text-muted">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="accent-[var(--accent-text)]" />
      <span className="text-right font-mono tabular-nums">{value}</span>
    </label>
  );
}

function Flag({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={value} onClick={() => onChange(!value)} className="flex w-full items-center justify-between gap-3 text-xs">
      <span className="text-muted">{label}</span>
      <span className={`relative h-5 w-9 rounded-full border transition-colors ${value ? "border-accent-text bg-accent" : "border-line bg-surface"}`}>
        <span className={`absolute top-0.5 size-3.5 rounded-full bg-ink transition-all ${value ? "left-[18px]" : "left-0.5"}`} />
      </span>
    </button>
  );
}
