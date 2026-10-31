"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Composition, DEFAULT_LOOK, type Look } from "@/components/builder/stats/Composition";
import { glowOf, GlowProvider } from "@/components/builder/stats/screen";
import type { AnalysisCombos, DeckCardLine } from "@/lib/types";
import { STRAND_CHOICES, useStrandColor } from "@/lib/useStrandColor";
import { CARDS, LINKS } from "../dot-concepts/mock";

/**
 * Lab for the light of the composition dots. It renders the real Composition component with a made-up deck, so the settings
 * copied from here are the component's own `Look`. The glow colour is the version timeline's strand colour, picked below.
 */

const STORE = "eregion-dev-stats-glow";

const PRESETS: Array<[string, Look]> = [
  ["Current", DEFAULT_LOOK],
  ["Timeline", { ...DEFAULT_LOOK, size: 0.55, threshold: 0.75, brightness: 0.8, hover: 1.1, wide: 0.12, wideReach: 9, tight: 0.3, tightReach: 3, core: 0.3, grey: 0.22, soft: true, spot: 0.9, swell: 1.2, spotReach: 4, flow: 0.6 }],
  ["Calm ember", { ...DEFAULT_LOOK, size: 0.7, threshold: 0.5, brightness: 0.55, hover: 1, wide: 0.08, wideReach: 7, tight: 0.25, tightReach: 2.6, core: 0, grey: 0.18, soft: true, spot: 0.5, swell: 0.6, spotReach: 5, flow: 0.25 }],
  ["Crisp grid", { ...DEFAULT_LOOK, size: 0.45, threshold: 0.85, brightness: 0.9, hover: 1.1, wide: 0.05, wideReach: 5, tight: 0.35, tightReach: 2, core: 0.15, grey: 0.25, soft: false, spot: 1, swell: 1.4, spotReach: 3, flow: 0 }],
  ["Low hum", { ...DEFAULT_LOOK, size: 0.6, threshold: 0, brightness: 0.35, hover: 1, wide: 0.1, wideReach: 8, tight: 0.2, tightReach: 2.4, core: 0, grey: 0.2, soft: true, spot: 0.7, swell: 0.8, spotReach: 4, flow: 0.5 }],
];

/** The made-up deck as card lines, the commander first, so the real component can read it. */
const LINES: DeckCardLine[] = [
  { cardId: "commander", name: "Kaalia of the Vast", board: "commander", quantity: 1, primaryType: "Creature", role: null, manaValue: 4 } as DeckCardLine,
  ...CARDS.map(
    (card) =>
      ({
        cardId: `c${card.id}`,
        name: card.name,
        board: "main",
        quantity: 1,
        primaryType: card.land ? "Land" : "Creature",
        role: card.land || card.role === "Uncategorized" ? null : card.role,
        manaValue: card.cmc,
      }) as DeckCardLine,
  ),
];

const COMBOS: AnalysisCombos = {
  available: true,
  included: LINKS.filter((link) => link.kind === "combo").map((link) => ({
    id: link.name,
    cards: link.ids.map((id) => CARDS[id].name),
    missing: [],
    produces: [link.name],
    description: "",
    manaNeeded: "",
    manaValueNeeded: null,
    bracketTag: "",
    popularity: 0,
  })),
  oneCardAway: [],
};

function Slide({ label, value, min, max, step = 0.01, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (next: number) => void }) {
  return (
    <label className="grid grid-cols-[96px_1fr_44px] items-center gap-2 text-xs">
      <span className="text-muted">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="accent-[var(--accent-text)]" />
      <span className="text-right font-mono tabular-nums">{value}</span>
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

function Group({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-3 border-t border-line pt-4">
      <legend className="pr-2 font-mono text-[11px] tracking-[0.14em] text-muted uppercase">{legend}</legend>
      {children}
    </fieldset>
  );
}

export function GlowLab() {
  const [look, setLook] = useState<Look>(DEFAULT_LOOK);
  const [copied, setCopied] = useState(false);
  const { choice, color, pick } = useStrandColor(null);
  const glow = useMemo(() => glowOf(color), [color]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORE);
      if (saved) setLook({ ...DEFAULT_LOOK, ...JSON.parse(saved) });
    } catch {}
  }, []);

  const apply = (next: Look) => {
    setLook(next);
    try {
      localStorage.setItem(STORE, JSON.stringify(next));
    } catch {}
  };
  const set = <K extends keyof Look>(key: K, value: Look[K]) => apply({ ...look, [key]: value });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(look, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <main className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6">
      <header className="mb-6">
        <p className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase">Dev lab</p>
        <h1 className="mt-1 text-[28px] leading-tight font-semibold tracking-tight">Composition glow</h1>
        <p className="mt-2 max-w-[760px] text-sm text-muted">
          The real composition graphic with a made-up deck. Move the pointer over the ring for the spotlight; hover a dot to light its slice or combo. Compare with the
          versions panel on a deck page.
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="flex flex-col gap-5 lg:sticky lg:top-4 lg:max-h-[calc(100vh-32px)] lg:overflow-auto lg:pr-2">
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map(([name, preset]) => (
              <button key={name} type="button" onClick={() => apply(preset)} className="min-h-8 rounded-full border border-line px-3 text-xs hover:border-ink">
                {name}
              </button>
            ))}
          </div>
          <button type="button" onClick={copy} className="min-h-9 rounded-full bg-ink px-4 text-sm text-bg">
            {copied ? "Copied" : "Copy these settings"}
          </button>

          <Group legend="Colour (the versions strand)">
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Strand colour">
              {[["auto", "Auto (cyan here)"] as [string, string], ...STRAND_CHOICES].map(([value, name]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={choice === value}
                  onClick={() => pick(value)}
                  className={`flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-xs ${choice === value ? "border-ink text-ink" : "border-line text-muted"}`}
                >
                  {value !== "auto" && <span className="size-2.5 rounded-full" style={{ background: value }} />}
                  {name}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted">Changes the timeline&apos;s pick too, as it is one setting.</p>
          </Group>

          <Group legend="Dots">
            <Slide label="Size" value={look.size} min={0.3} max={1.2} onChange={(v) => set("size", v)} />
            <Slide label="Lit from field" value={look.threshold} min={0} max={1} onChange={(v) => set("threshold", v)} />
            <Slide label="Brightness" value={look.brightness} min={0.1} max={1.6} onChange={(v) => set("brightness", v)} />
            <Slide label="Hover light" value={look.hover} min={0.5} max={2} onChange={(v) => set("hover", v)} />
            <Slide label="Unlit grey" value={look.grey} min={0} max={0.6} onChange={(v) => set("grey", v)} />
            <Flag label="Soft edge" value={look.soft} onChange={(v) => set("soft", v)} />
          </Group>

          <Group legend="Bloom">
            <Slide label="Wide strength" value={look.wide} min={0} max={0.5} onChange={(v) => set("wide", v)} />
            <Slide label="Wide reach" value={look.wideReach} min={2} max={14} step={0.5} onChange={(v) => set("wideReach", v)} />
            <Slide label="Tight strength" value={look.tight} min={0} max={0.8} onChange={(v) => set("tight", v)} />
            <Slide label="Tight reach" value={look.tightReach} min={1.2} max={5} step={0.1} onChange={(v) => set("tightReach", v)} />
            <Slide label="White core" value={look.core} min={0} max={1} onChange={(v) => set("core", v)} />
          </Group>

          <Group legend="Motion">
            <Slide label="Spotlight" value={look.spot} min={0} max={1.5} onChange={(v) => set("spot", v)} />
            <Slide label="Swell" value={look.swell} min={0} max={2} onChange={(v) => set("swell", v)} />
            <Slide label="Spot reach" value={look.spotReach} min={1} max={8} step={0.5} onChange={(v) => set("spotReach", v)} />
            <Slide label="Flow" value={look.flow} min={0} max={1} onChange={(v) => set("flow", v)} />
          </Group>
        </aside>

        <div id="lab-preview" className="mx-auto w-full max-w-[820px] self-start">
          <GlowProvider value={glow}>
            <Composition lines={LINES} combos={COMBOS} look={look} />
          </GlowProvider>
        </div>
      </div>
    </main>
  );
}
