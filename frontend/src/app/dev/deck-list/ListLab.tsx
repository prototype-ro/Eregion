"use client";

import { CaretDown } from "@phosphor-icons/react";
import { useEffect, useState, type ReactNode } from "react";
import { ManaCost } from "@/components/Mana";
import { GROUPS, ROLE_HUES, type MockCard } from "./mock";

const STORE = "eregion-dev-list-lab";

interface Settings {
  cols: number;
  gap: number;
  rowH: number;
  font: number;
  weight: number;
  radius: number;
  qty: "left" | "after" | "multi";
  cost: "off" | "left" | "right" | "dots";
  price: boolean;
  role: "off" | "dot" | "bar" | "strand";
  also: boolean;
  thumb: boolean;
  divider: "line" | "zebra" | "dotted" | "none";
  hover: "fill" | "bar" | "lift" | "none";
  menu: "always" | "hover" | "dots";
  head: "plain" | "caps" | "share" | "swiss" | "dots";
  width: "900" | "1200" | "full";
  grid: boolean;
  select: "fill" | "dither" | "outline" | "glass" | "invert" | "marker" | "glow" | "tint" | "spectrum" | "aura";
  selRadius: number;
  selColor: "accent" | "role" | "card";
  mode: "list" | "table";
}

const CURRENT: Settings = { cols: 3, gap: 36, rowH: 36, font: 14, weight: 400, radius: 0, qty: "left", cost: "off", price: false, role: "off", also: true, thumb: false, divider: "line", hover: "fill", menu: "always", head: "plain", width: "1200", grid: false, select: "fill", mode: "list", selRadius: 0, selColor: "accent" };

const PRESETS: Array<[string, Settings]> = [
  ["Current", CURRENT],
  ["Compact", { ...CURRENT, rowH: 30, font: 13, cost: "right", role: "dot", menu: "hover", also: false, cols: 4, gap: 28 }],
  ["Swiss", { ...CURRENT, head: "swiss", qty: "left", cost: "right", price: true, role: "bar", divider: "none", hover: "bar", menu: "hover", font: 14, rowH: 34, weight: 500 }],
  ["Strand", { ...CURRENT, role: "strand", grid: true, head: "dots", cost: "dots", select: "dither", hover: "fill", divider: "none", menu: "hover", rowH: 34, cols: 3 }],
  ["Table", { ...CURRENT, mode: "table", cols: 1, cost: "right", price: true, role: "dot", menu: "hover", rowH: 34, width: "1200" }],
  ["Editorial", { ...CURRENT, head: "share", cost: "right", role: "dot", divider: "dotted", hover: "lift", radius: 10, rowH: 40, font: 15, thumb: true, cols: 2, gap: 56, menu: "always" }],
];

const STYLE = `
  .list-lab { --rl: 0.74; --rc: 0.15; }
  :root[data-theme="light"] .list-lab { --rl: 0.52; --rc: 0.16; }
  @media (prefers-color-scheme: light) { :root:not([data-theme="dark"]) .list-lab { --rl: 0.52; --rc: 0.16; } }
`;

const roleColor = (role: string) => (role === "Land" ? "oklch(0.58 0.02 250)" : `oklch(var(--rl) var(--rc) ${ROLE_HUES[role] ?? 250})`);

const MANA_HUE: Record<string, number> = { W: 95, U: 245, B: 305, R: 28, G: 150 };

/** The card's own colors, from its mana cost. Colorless cards fall back to their role color. */
function cardColors(card: MockCard): string[] {
  const letters = [...new Set((card.cost.match(/[WUBRG]/g) ?? []) as string[])];
  return letters.length ? letters.map((l) => `oklch(var(--rl) var(--rc) ${MANA_HUE[l]})`) : [roleColor(card.role)];
}

function selectionColor(card: MockCard, mode: Settings["selColor"]) {
  return mode === "role" ? roleColor(card.role) : mode === "card" ? cardColors(card)[0] : "var(--accent-text)";
}

function hue(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

// ---------------------------------------------------------------------------------------------------------------------------
// Controls

function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Array<[T, string]>; onChange: (next: T) => void }) {
  return (
    <div>
      <p className="mb-1.5 text-xs text-muted">{label}</p>
      <div className="flex flex-wrap gap-1" role="group" aria-label={label}>
        {options.map(([key, text]) => (
          <button
            key={key}
            type="button"
            aria-pressed={value === key}
            onClick={() => onChange(key)}
            className={`min-h-8 rounded-full border px-3 text-xs transition-colors ${value === key ? "border-ink bg-ink text-bg" : "border-line text-muted hover:text-ink"}`}
          >
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

// ---------------------------------------------------------------------------------------------------------------------------
// The list

/** The mana value as a small halftone cluster: one dot per point, larger toward the middle, so the curve reads down a column. */
function CostDots({ cmc }: { cmc: number }) {
  const n = Math.min(cmc, 8);
  return (
    <span aria-label={`Mana value ${cmc}`} role="img" className="inline-flex h-4 w-[60px] shrink-0 items-center justify-end gap-[2px]">
      {cmc === 0 && <span className="size-1 rounded-full bg-muted/50" />}
      {Array.from({ length: n }, (_, i) => {
        const mid = (n - 1) / 2;
        const size = 4 + 6 * (1 - Math.abs(i - mid) / (mid + 0.5));
        return <span key={i} className="rounded-full bg-ink" style={{ width: size, height: size, opacity: 0.45 + 0.55 * (1 - Math.abs(i - mid) / (mid + 0.5)) }} />;
      })}
    </span>
  );
}

/** How the selected row looks, one entry for each choice. */
const SELECTED: Record<Settings["select"], (grid: boolean) => string> = {
  fill: (grid) => `${grid ? "bg-bg" : "bg-surface"} shadow-[inset_3px_0_0_var(--sel)]`,
  dither: (grid) => (grid ? "bg-bg" : "bg-surface"),
  outline: () => "bg-transparent shadow-[inset_0_0_0_1.5px_var(--sel)] rounded-lg",
  glass: () => "glass rounded-full! hover:scale-100!",
  invert: () => "bg-ink! text-bg rounded-md [&_*]:text-bg!",
  marker: (grid) => `${grid ? "bg-bg" : "bg-surface"} font-semibold before:absolute before:top-1/2 before:-left-3 before:size-1.5 before:-translate-y-1/2 before:rounded-full before:bg-accent-text before:shadow-[0_0_8px_var(--sel)]`,
  glow: () => "bg-surface shadow-[0_0_24px_-4px_var(--sel)] rounded-lg",
  spectrum: (grid) => (grid ? "bg-bg" : "bg-surface"),
  aura: () => "bg-surface shadow-[0_0_28px_-6px_var(--sel)]",
  tint: () => "bg-[color-mix(in_srgb,var(--sel)_26%,transparent)] rounded-md",
};

function Row({ card, s, selected, onSelect, index }: { card: MockCard; s: Settings; selected: boolean; onSelect: () => void; index: number }) {
  const qtyText = <span className={`shrink-0 font-mono text-[0.86em] ${card.qty > 1 ? "text-ink" : "text-muted"}`}>{card.qty}</span>;
  const cost = card.cost && s.cost !== "dots" ? <ManaCost cost={card.cost} className="text-[0.92em]" /> : null;
  // On the dot grid a hovered row is cleared of dots, the way the cursor clears them in Versions.
  const base = s.grid ? "hover:bg-bg" : "hover:bg-surface";
  const hover = {
    fill: base,
    bar: `${base} hover:shadow-[inset_3px_0_0_var(--accent-text)]`,
    lift: `${base} hover:translate-x-[3px]`,
    none: "",
  }[s.hover];
  const divider = { line: "border-b border-line", dotted: "border-b border-dashed border-line", zebra: index % 2 ? "bg-surface/50" : "", none: "" }[s.divider];
  return (
    <li
      onClick={onSelect}
      className={`group/row relative flex cursor-pointer items-center gap-2.5 px-2.5 transition-[background-color,transform,box-shadow] duration-150 ${divider} ${hover} ${selected ? SELECTED[s.select](s.grid) : ""}`}
      style={{
        minHeight: s.rowH,
        fontSize: s.font,
        fontWeight: s.weight,
        borderRadius: selected ? s.selRadius : s.radius,
        ["--sel" as string]: selectionColor(card, s.selColor),
        ...(selected && s.select === "spectrum" ? { backgroundImage: `linear-gradient(90deg, ${cardColors(card).map((c) => `color-mix(in srgb, ${c} 38%, transparent)`).join(", ")}, transparent 90%)` } : {}),
        ...(selected && s.select === "aura" ? { backgroundImage: "radial-gradient(120% 220% at 0% 50%, color-mix(in srgb, var(--sel) 30%, transparent), transparent 70%)" } : {}),
      }}
    >
      {selected && s.select === "dither" && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{ backgroundImage: "radial-gradient(var(--sel) 1px, transparent 1.5px)", backgroundSize: "4px 4px", WebkitMaskImage: "linear-gradient(to right, #000, transparent 55%)", maskImage: "linear-gradient(to right, #000, transparent 55%)" }}
        />
      )}
      {s.role === "strand" && (
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 w-[2px] transition-[width,box-shadow] duration-150 group-hover/row:w-[4px]"
          style={{ background: roleColor(card.role), boxShadow: `0 0 10px -1px ${roleColor(card.role)}` }}
        />
      )}
      {s.role === "bar" && <span aria-hidden="true" className="absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-full" style={{ background: roleColor(card.role) }} />}
      {s.qty === "left" && <span className="w-5 text-right">{qtyText}</span>}
      {s.thumb && <span aria-hidden="true" className="h-[22px] w-8 shrink-0 rounded-md" style={{ background: `linear-gradient(135deg, oklch(0.55 0.12 ${hue(card.name)}), oklch(0.3 0.06 ${hue(card.name) + 40}))` }} />}
      {s.role === "dot" && <span aria-hidden="true" title={card.role} className="size-2 shrink-0 rounded-full" style={{ background: roleColor(card.role) }} />}
      {s.cost === "left" && cost && <span className="w-[4.6em] shrink-0">{cost}</span>}
      <span className="flex min-w-0 flex-1 flex-col py-1">
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="min-w-0">{card.name}</span>
          {s.qty === "after" && card.qty > 1 && <span className="font-mono text-[0.82em] text-muted">×{card.qty}</span>}
          {s.qty === "multi" && card.qty > 1 && <span className="rounded-full border border-line px-1.5 font-mono text-[0.78em]">×{card.qty}</span>}
          {card.isNew && <span className="rounded-full bg-accent px-2 py-px text-[0.78em] font-bold text-on-accent">New</span>}
          {card.need && <span className="rounded-full border border-add-line px-2 py-px text-[0.78em] text-add-text">Need</span>}
        </span>
        {s.also && card.also.length > 0 && (
          <span className="mt-0.5 flex flex-wrap gap-1">
            {card.also.map((role) => (
              <span key={role} className="rounded-full border border-line px-1.5 text-[0.78em] leading-normal text-muted">
                {role}
              </span>
            ))}
          </span>
        )}
      </span>
      {s.cost === "dots" && <CostDots cmc={card.cmc} />}
      {s.cost === "right" && cost && <span className="shrink-0 text-muted">{cost}</span>}
      {s.price && <span className="w-14 shrink-0 text-right font-mono text-[0.82em] text-muted">{card.price >= 0.5 ? `$${card.price.toFixed(2)}` : ""}</span>}
      {s.menu === "always" && (
        <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-line text-muted transition-colors group-hover/row:border-ink group-hover/row:text-ink">
          <CaretDown size={12} weight="bold" aria-hidden />
        </span>
      )}
      {s.menu === "dots" && <span className="inline-flex size-7 shrink-0 items-center justify-center text-lg leading-none text-muted group-hover/row:text-ink">...</span>}
      {s.menu === "hover" && (
        <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-muted opacity-0 transition-opacity group-hover/row:opacity-100">
          <CaretDown size={12} weight="bold" aria-hidden />
        </span>
      )}
    </li>
  );
}

function Head({ title, count, share, s, cards }: { title: string; count: number; share: number; s: Settings; cards: MockCard[] }) {
  if (s.head === "caps")
    return (
      <header className="flex items-baseline gap-2 border-b border-line px-2.5 pb-1.5">
        <h3 className="font-mono text-[11px] tracking-[0.16em] text-muted uppercase">{title}</h3>
        <span className="ml-auto font-mono text-[11px] text-muted">{count}</span>
      </header>
    );
  if (s.head === "share")
    return (
      <header className="px-2.5 pb-2">
        <div className="flex items-baseline gap-2.5">
          <h3 className="text-[17px] font-medium">{title}</h3>
          <span className="font-mono text-[13px] text-muted">{count}</span>
        </div>
        <div aria-hidden="true" className="dotted mt-2 h-2 rounded-full">
          <div className="h-full rounded-full bg-accent-text/70" style={{ width: `${Math.max(4, share * 100)}%` }} />
        </div>
      </header>
    );
  if (s.head === "dots")
    return (
      <header className="px-2.5 pb-2">
        <div className="flex items-baseline gap-2.5">
          <h3 className="text-[16px] font-medium">{title}</h3>
          <span className="font-mono text-[13px] text-muted">{count}</span>
        </div>
        <div aria-hidden="true" className="mt-2 flex flex-wrap gap-[3px]">
          {cards.flatMap((card) => Array.from({ length: card.qty }, (_, i) => <span key={`${card.name}${i}`} className="size-[7px] rounded-full" style={{ background: roleColor(card.role) }} />))}
        </div>
      </header>
    );
  if (s.head === "swiss")
    return (
      <header className="flex items-end justify-between border-t-2 border-ink px-2.5 pt-2 pb-2">
        <h3 className="text-[15px] font-semibold tracking-tight">{title}</h3>
        <span className="font-mono text-[28px] leading-none tabular-nums">{count}</span>
      </header>
    );
  return (
    <header className="flex items-baseline gap-2.5 border-b border-line px-2.5 pb-2">
      <h3 className="text-[16px] font-medium">{title}</h3>
      <span className="font-mono text-[13px] text-muted">{count}</span>
    </header>
  );
}

type SortKey = "name" | "cmc" | "price" | "role";

function Table({ s }: { s: Settings }) {
  const [selected, setSelected] = useState("Esper Sentinel");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "name", dir: 1 });
  const order = (a: MockCard, b: MockCard) => {
    const x = a[sort.key];
    const y = b[sort.key];
    return (typeof x === "number" ? x - (y as number) : String(x).localeCompare(String(y))) * sort.dir;
  };
  const head = (key: SortKey, label: string, className = "") => (
    <th scope="col" aria-sort={sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : "none"} className={`px-2.5 py-2 text-left font-normal ${className}`}>
      <button type="button" onClick={() => setSort((cur) => ({ key, dir: cur.key === key ? (cur.dir === 1 ? -1 : 1) : 1 }))} className={`inline-flex items-center gap-1 text-[11px] tracking-[0.14em] uppercase ${sort.key === key ? "text-ink" : "text-muted hover:text-ink"}`}>
        {label}
        {sort.key === key && <span aria-hidden="true">{sort.dir === 1 ? "↑" : "↓"}</span>}
      </button>
    </th>
  );
  return (
    <table className="w-full border-separate border-spacing-0" style={{ fontSize: s.font, fontWeight: s.weight }}>
      <thead className="sticky top-0 z-10 bg-bg">
        <tr className="border-b border-line">
          <th className="w-10 px-2.5 py-2 text-right text-[11px] font-normal tracking-[0.14em] text-muted uppercase">Qty</th>
          {head("name", "Name")}
          {head("role", "Role")}
          {head("cmc", "Cost", "text-right")}
          {head("price", "Price", "text-right")}
        </tr>
      </thead>
      {GROUPS.map((group) => (
        <tbody key={group.title}>
          <tr>
            <th colSpan={5} scope="colgroup" className="border-b border-line px-2.5 pt-5 pb-1.5 text-left text-[13px] font-medium">
              {group.title} <span className="ml-1 font-mono text-muted">{group.cards.reduce((n, c) => n + c.qty, 0)}</span>
            </th>
          </tr>
          {[...group.cards].sort(order).map((card) => (
            <tr key={card.name} onClick={() => setSelected(card.name)} className={`group/row cursor-pointer ${selected === card.name ? "bg-surface" : "hover:bg-surface"}`} style={{ height: s.rowH }}>
              <td className="border-b border-line px-2.5 text-right font-mono text-[0.86em] text-muted">{card.qty}</td>
              <td className="border-b border-line px-2.5">{card.name}</td>
              <td className="border-b border-line px-2.5 text-muted">
                <span className="inline-flex items-center gap-2">
                  <span aria-hidden="true" className="size-2 rounded-full" style={{ background: roleColor(card.role) }} />
                  {card.role}
                </span>
              </td>
              <td className="border-b border-line px-2.5 text-right">{card.cost ? <ManaCost cost={card.cost} className="text-[0.92em]" /> : <span className="text-muted">-</span>}</td>
              <td className="border-b border-line px-2.5 text-right font-mono text-[0.86em] text-muted">${card.price.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      ))}
    </table>
  );
}

function Preview({ s }: { s: Settings }) {
  const [selected, setSelected] = useState("Esper Sentinel");
  if (s.mode === "table") return <div className="mx-auto w-full" style={{ maxWidth: s.width === "full" ? undefined : Number(s.width) }}><Table s={s} /></div>;
  const total = GROUPS.reduce((sum, g) => sum + g.cards.reduce((n, c) => n + c.qty, 0), 0);
  return (
    <div className="mx-auto w-full" style={{ maxWidth: s.width === "full" ? undefined : Number(s.width) }}>
      <div style={{ columnCount: s.cols, columnGap: s.gap }}>
        {GROUPS.map((group) => {
          const count = group.cards.reduce((n, c) => n + c.qty, 0);
          return (
            <section key={group.title} className="mb-7 break-inside-avoid">
              <Head title={group.title} count={count} share={count / total} s={s} cards={group.cards} />
              <ul className={s.grid ? "dotted rounded-lg" : undefined}>
                {group.cards.map((card, index) => (
                  <Row key={card.name} card={card} s={s} index={index} selected={selected === card.name} onSelect={() => setSelected(card.name)} />
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------

export function ListLab() {
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

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setS((current) => {
      const next = { ...current, [key]: value };
      try {
        localStorage.setItem(STORE, JSON.stringify(next));
      } catch {
        // Not remembered, which is fine here.
      }
      return next;
    });

  const load = (next: Settings) => {
    setS(next);
    try {
      localStorage.setItem(STORE, JSON.stringify(next));
    } catch {
      // Not remembered, which is fine here.
    }
  };

  const copy = async (): Promise<void> => {
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

  return (
    <div className="list-lab mx-auto max-w-[1800px] px-5 pb-24 sm:px-8">
      <style>{STYLE}</style>
      <header className="pt-10 pb-6">
        <h1 className="font-display text-[clamp(44px,6vw,84px)] leading-none">Deck list lab</h1>
        <p className="mt-3 max-w-[70ch] text-muted">
          The list view with made-up cards. Change anything on the left and the list answers at once. Try the presets, then the theme switch in the header. Click a row to see the selected state, hover for the hover style.
        </p>
      </header>

      <div className="grid items-start gap-8 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="flex flex-col gap-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-32px)] lg:overflow-auto lg:pr-3">
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map(([name, preset]) => (
              <button key={name} type="button" onClick={() => load(preset)} className="min-h-8 rounded-full border border-line px-3 text-xs hover:border-ink">
                {name}
              </button>
            ))}
          </div>

          {group(
            "Mode",
            <>
              <Seg label="Display" value={s.mode} options={[["list", "List"], ["table", "Table"]]} onChange={(v) => set("mode", v)} />
              <Flag label="Dot-grid ground" value={s.grid} onChange={(v) => set("grid", v)} />
              <Seg label="Selected row" value={s.select} options={[["fill", "Fill + bar"], ["dither", "Dither"], ["outline", "Outline"], ["glass", "Glass"], ["invert", "Invert"], ["marker", "Marker"], ["glow", "Glow"], ["tint", "Tint"], ["spectrum", "Card colors"], ["aura", "Aura"]]} onChange={(v) => set("select", v)} />
              <Seg label="Selection color" value={s.selColor} options={[["accent", "Accent"], ["role", "Role"], ["card", "Card colors"]]} onChange={(v) => set("selColor", v)} />
              <Slide label="Corners" value={s.selRadius} min={0} max={28} unit="px" onChange={(v) => set("selRadius", v)} />
            </>,
          )}
          {group(
            "Layout",
            <>
              <Slide label="Columns" value={s.cols} min={1} max={4} onChange={(v) => set("cols", v)} />
              <Slide label="Column gap" value={s.gap} min={12} max={72} unit="px" onChange={(v) => set("gap", v)} />
              <Seg label="Page width" value={s.width} options={[["900", "900"], ["1200", "1200"], ["full", "Full"]]} onChange={(v) => set("width", v)} />
            </>,
          )}
          {group(
            "Rows",
            <>
              <Slide label="Row height" value={s.rowH} min={26} max={52} unit="px" onChange={(v) => set("rowH", v)} />
              <Slide label="Text size" value={s.font} min={12} max={17} unit="px" onChange={(v) => set("font", v)} />
              <Slide label="Weight" value={s.weight} min={300} max={700} step={100} onChange={(v) => set("weight", v)} />
              <Slide label="Row radius" value={s.radius} min={0} max={16} unit="px" onChange={(v) => set("radius", v)} />
              <Seg label="Dividers" value={s.divider} options={[["line", "Line"], ["dotted", "Dashed"], ["zebra", "Zebra"], ["none", "None"]]} onChange={(v) => set("divider", v)} />
              <Seg label="Hover" value={s.hover} options={[["fill", "Fill"], ["bar", "Bar"], ["lift", "Lift"], ["none", "None"]]} onChange={(v) => set("hover", v)} />
              <Seg label="Row menu" value={s.menu} options={[["always", "Chevron"], ["hover", "On hover"], ["dots", "Dots"]]} onChange={(v) => set("menu", v)} />
            </>,
          )}
          {group(
            "Content",
            <>
              <Seg label="Quantity" value={s.qty} options={[["left", "Left"], ["after", "After name"], ["multi", "Badge if 2+"]]} onChange={(v) => set("qty", v)} />
              <Seg label="Mana cost" value={s.cost} options={[["off", "Off"], ["left", "Left"], ["right", "Right"], ["dots", "Dots"]]} onChange={(v) => set("cost", v)} />
              <Seg label="Role" value={s.role} options={[["off", "Off"], ["dot", "Dot"], ["bar", "Edge bar"], ["strand", "Strand"]]} onChange={(v) => set("role", v)} />
              <Flag label="Other roles as badges" value={s.also} onChange={(v) => set("also", v)} />
              <Flag label="Price" value={s.price} onChange={(v) => set("price", v)} />
              <Flag label="Art thumbnail" value={s.thumb} onChange={(v) => set("thumb", v)} />
            </>,
          )}
          {group(
            "Group heading",
            <Seg label="Style" value={s.head} options={[["plain", "Plain"], ["caps", "Mono caps"], ["share", "Share bar"], ["swiss", "Swiss"], ["dots", "Role dots"]]} onChange={(v) => set("head", v)} />,
          )}
          <button type="button" onClick={() => void copy()} className="min-h-9 rounded-full border border-line text-xs hover:border-ink">
            {copied ? "Copied" : "Copy these settings"}
          </button>
        </aside>

        <main className="min-w-0 rounded-[28px] border border-line p-6">
          <Preview s={s} />
        </main>
      </div>
    </div>
  );
}
