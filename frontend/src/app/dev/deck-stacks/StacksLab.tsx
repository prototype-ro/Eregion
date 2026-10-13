"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ManaCost } from "@/components/Mana";
import { GROUPS, ROLE_HUES, type MockCard, type MockGroup } from "../deck-list/mock";

const STORE = "eregion-dev-stacks-lab";

interface Settings {
  layout: "grid" | "masonry";
  splitLong: boolean;
  cardW: number;
  gap: number;
  strip: number;
  radius: number;
  raise: "push" | "overlay";
  shadow: boolean;
  tint: boolean;
  cost: boolean;
  head: "plain" | "inline" | "share";
  width: "1200" | "1600" | "full";
}

const CURRENT: Settings = { layout: "grid", splitLong: false, cardW: 190, gap: 32, strip: 31, radius: 10, raise: "push", shadow: true, tint: true, cost: true, head: "plain", width: "1600" };

const PRESETS: Array<[string, Settings]> = [
  ["Current", CURRENT],
  ["Moxfield-like", { ...CURRENT, layout: "masonry", cardW: 150, gap: 14, strip: 22, raise: "overlay", head: "inline" }],
  ["Roomy", { ...CURRENT, layout: "masonry", cardW: 180, gap: 28, strip: 28, raise: "overlay", head: "share", splitLong: true }],
  ["Dense", { ...CURRENT, layout: "masonry", cardW: 128, gap: 10, strip: 19, raise: "overlay", head: "inline", radius: 7, splitLong: true }],
];

const STYLE = `
  .stacks-lab { --rl: 0.74; --rc: 0.15; }
  :root[data-theme="light"] .stacks-lab { --rl: 0.52; --rc: 0.16; }
  @media (prefers-color-scheme: light) { :root:not([data-theme="dark"]) .stacks-lab { --rl: 0.52; --rc: 0.16; } }
`;

const roleColor = (role: string) => (role === "Land" ? "oklch(0.58 0.02 250)" : `oklch(var(--rl) var(--rc) ${ROLE_HUES[role] ?? 250})`);

/** More cards than the list lab has, so a long group and a short one sit side by side like in a real deck. */
function makeGroups(): MockGroup[] {
  const names = ["Black Market Connections", "Dragon Tempest", "Phyrexian Arena", "Phyrexian Reclamation", "Smothering Tithe"];
  const lands = ["Arid Mesa", "Badlands", "Battlefield Forge", "Blood Crypt", "Bloodstained Mire", "Caves of Koilos", "Clifftop Retreat", "Command Beacon", "Command Tower", "Dragonskull Summit", "Fetid Heath", "Godless Shrine", "Graven Cairns", "Isolated Chapel", "Luxury Suite", "Memorial to Folly", "Minas Morgul", "Minas Tirith", "Nomad Outpost", "Nykthos", "Plateau", "Plaza of Heroes", "Raucous Theater", "Reflecting Pool", "Rogue's Passage", "Sacred Foundry", "Savai Triome", "Scorched Ruins", "Shattered Sanctum", "Sulfurous Springs", "Takenuma", "The Black Gate", "Vault of Champions", "Volrath's Stronghold", "Wasteland"];
  const card = (name: string, role: string, cost: string, cmc: number): MockCard => ({ name, qty: 1, cost, cmc, price: 1, role, also: [] });
  const base = GROUPS.filter((g) => g.title !== "Lands" && g.title !== "Commander");
  return [
    GROUPS[0],
    ...base,
    { title: "Enchantments", cards: names.map((n, i) => card(n, ["Card Draw", "Win Condition", "Card Draw", "Recursion", "Protection"][i], i % 2 ? "{1}{B}" : "{2}{W}", 2 + (i % 2))) },
    { title: "Lands", cards: lands.map((n) => card(n, "Land", "", 0)) },
  ];
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
    <label className="grid grid-cols-[84px_1fr_44px] items-center gap-2 text-xs">
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

/** One card of a stack: a header strip with the name and cost, and below it the rest of the card, which only shows when the card is raised or last. */
function Face({ card, s, raised }: { card: MockCard; s: Settings; raised: boolean }) {
  const color = roleColor(card.role);
  return (
    <div className={`overflow-hidden bg-surface ${raised && s.shadow ? "shadow-[0_18px_40px_rgba(0,0,0,0.55)]" : s.shadow ? "shadow-[0_-2px_6px_rgba(0,0,0,0.25)]" : ""}`} style={{ borderRadius: s.radius, aspectRatio: "5 / 7", border: "1px solid var(--line)" }}>
      <div className="flex items-center gap-1.5 px-2" style={{ height: s.strip, background: s.tint ? `linear-gradient(90deg, color-mix(in srgb, ${color} 34%, var(--surface)), var(--surface))` : "var(--surface)", fontSize: Math.max(10, Math.min(13, s.strip * 0.46)) }}>
        <span className="min-w-0 flex-1 truncate font-medium">{card.name}</span>
        {s.cost && card.cost && <ManaCost cost={card.cost} className="shrink-0 text-[0.9em]" />}
      </div>
      <div className="mx-2 mt-1 h-[46%] rounded" style={{ background: `linear-gradient(135deg, color-mix(in srgb, ${color} 55%, var(--surface-2)), var(--surface-2))` }} />
      <div className="mx-2 mt-2 flex flex-col gap-1.5">
        <span className="h-1.5 w-4/5 rounded bg-line" />
        <span className="h-1.5 w-3/5 rounded bg-line" />
        <span className="h-1.5 w-2/3 rounded bg-line" />
      </div>
    </div>
  );
}

function Heading({ group, share, s }: { group: MockGroup; share: number; s: Settings }) {
  const count = group.cards.reduce((n, c) => n + c.qty, 0);
  if (s.head === "inline")
    return (
      <h3 className="mb-2 text-[13px] font-medium">
        {group.title} <span className="font-normal text-muted">({count})</span>
      </h3>
    );
  if (s.head === "share")
    return (
      <header className="mb-2.5">
        <div className="flex items-baseline gap-2">
          <h3 className="text-[15px] font-medium">{group.title}</h3>
          <span className="font-mono text-xs text-muted">{count}</span>
        </div>
        <div aria-hidden="true" className="dotted mt-1.5 h-1.5 rounded-full">
          <div className="h-full rounded-full bg-accent-text/70" style={{ width: `${Math.max(4, share * 100)}%` }} />
        </div>
      </header>
    );
  return (
    <header className="mb-2.5 flex items-baseline justify-between border-b border-line pb-1.5">
      <h3 className="text-[14px] font-medium">{group.title}</h3>
      <span className="font-mono text-xs text-muted">{count}</span>
    </header>
  );
}

function Stack({ group, s, share, raised, setRaised }: { group: MockGroup; s: Settings; share: number; raised: string | null; setRaised: (key: string | null) => void }) {
  return (
    <section className={`mb-8 ${s.layout === "masonry" && s.splitLong ? "" : "break-inside-avoid"}`} aria-label={group.title}>
      <Heading group={group} share={share} s={s} />
      <ul className="flex flex-col">
        {group.cards.map((card, index) => {
          const last = index === group.cards.length - 1;
          const key = `${group.title}|${card.name}`;
          const front = raised === key;
          const pushed = front && s.raise === "push";
          const overlay = front && s.raise === "overlay";
          return (
            <li key={key} className={`relative ${front ? "z-20" : ""} ${last || pushed ? "" : "overflow-hidden"} ${overlay && !last ? "overflow-visible" : ""}`} style={last || pushed ? undefined : { height: s.strip }}>
              <button type="button" onClick={() => setRaised(front ? null : key)} onMouseEnter={() => setRaised(key)} className="block w-full text-left" aria-pressed={front}>
                <Face card={card} s={s} raised={front} />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function StacksLab() {
  const [s, setS] = useState<Settings>(CURRENT);
  const [raised, setRaised] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const groups = useMemo(makeGroups, []);
  const total = groups.reduce((sum, g) => sum + g.cards.reduce((n, c) => n + c.qty, 0), 0);

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

  const stacks = groups.map((g) => <Stack key={g.title} group={g} s={s} share={g.cards.reduce((n, c) => n + c.qty, 0) / total} raised={raised} setRaised={setRaised} />);

  return (
    <div className="stacks-lab mx-auto max-w-[1800px] px-5 pb-24 sm:px-8">
      <style>{STYLE}</style>
      <header className="pt-10 pb-6">
        <h1 className="font-display text-[clamp(44px,6vw,84px)] leading-none">Deck stacks lab</h1>
        <p className="mt-3 max-w-[70ch] text-muted">The stacks view with made-up cards. Compare the grid we have with a packed masonry like Moxfield&rsquo;s, and tune the strip, the gutters and how a raised card behaves. Hover or click a card to raise it.</p>
      </header>

      <div className="grid items-start gap-8 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="flex flex-col gap-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-32px)] lg:overflow-auto lg:pr-3">
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map(([name, preset]) => (
              <button key={name} type="button" onClick={() => save(preset)} className="min-h-8 rounded-full border border-line px-3 text-xs hover:border-ink">
                {name}
              </button>
            ))}
          </div>
          {group(
            "Layout",
            <>
              <Seg label="Arrangement" value={s.layout} options={[["grid", "Grid (one group per column)"], ["masonry", "Masonry (packed)"]]} onChange={(v) => set("layout", v)} />
              {s.layout === "masonry" && <Flag label="Long groups continue in the next column" value={s.splitLong} onChange={(v) => set("splitLong", v)} />}
              <Slide label="Card width" value={s.cardW} min={110} max={280} unit="px" onChange={(v) => set("cardW", v)} />
              <Slide label="Gutter" value={s.gap} min={6} max={56} unit="px" onChange={(v) => set("gap", v)} />
              <Seg label="Page width" value={s.width} options={[["1200", "1200"], ["1600", "1600"], ["full", "Full"]]} onChange={(v) => set("width", v)} />
            </>,
          )}
          {group(
            "Cards",
            <>
              <Slide label="Visible strip" value={s.strip} min={14} max={44} unit="px" onChange={(v) => set("strip", v)} />
              <Slide label="Corners" value={s.radius} min={0} max={18} unit="px" onChange={(v) => set("radius", v)} />
              <Seg label="Raised card" value={s.raise} options={[["push", "Pushes the stack"], ["overlay", "Floats over it"]]} onChange={(v) => set("raise", v)} />
              <Flag label="Shadow between cards" value={s.shadow} onChange={(v) => set("shadow", v)} />
              <Flag label="Role tint on the strip" value={s.tint} onChange={(v) => set("tint", v)} />
              <Flag label="Mana cost on the strip" value={s.cost} onChange={(v) => set("cost", v)} />
            </>,
          )}
          {group("Group heading", <Seg label="Style" value={s.head} options={[["plain", "Plain"], ["inline", "Name (5)"], ["share", "Share bar"]]} onChange={(v) => set("head", v)} />)}
          <button type="button" onClick={() => void copy()} className="min-h-9 rounded-full border border-line text-xs hover:border-ink">
            {copied ? "Copied" : "Copy these settings"}
          </button>
        </aside>

        <main className="min-w-0 rounded-[28px] border border-line p-6" onMouseLeave={() => s.raise === "overlay" && setRaised(null)}>
          <div className="mx-auto" style={{ maxWidth: s.width === "full" ? undefined : Number(s.width) }}>
            {s.layout === "masonry" ? (
              <div style={{ columnWidth: s.cardW, columnGap: s.gap }}>{stacks}</div>
            ) : (
              <div className="grid items-start" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${s.cardW}px, 1fr))`, columnGap: s.gap }}>
                {stacks}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
