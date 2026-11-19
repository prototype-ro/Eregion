"use client";

import { BookmarkSimple, CaretDown, Crown, Plus } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { ManaCost } from "@/components/Mana";
import { btn, field, stdIcon } from "@/lib/ui";
import { RESULTS, type MockResult } from "./mock";

const STORE = "eregion-dev-search-actions-lab";

interface Settings {
  /** Which of the two real result layouts this previews. */
  mode: "list" | "gallery";
  /** column: a dedicated right-hand column, stretched to the widest button (today). inline: actions sit inside the text column, freeing the row for the name and text. List only. */
  place: "column" | "inline";
  addStyle: "text" | "icon" | "iconText";
  /** How Maybe (and Commander, when legendary) render. */
  secondary: "buttons" | "icons" | "menu";
  size: number;
  gap: number;
  reveal: "always" | "hover";
  width: "900" | "1200" | "full";
}

const CURRENT: Settings = { mode: "list", place: "column", addStyle: "text", secondary: "buttons", size: 36, gap: 8, reveal: "always", width: "1200" };

const PRESETS: Array<[string, Settings]> = [
  ["Current", CURRENT],
  ["Icon row", { ...CURRENT, place: "inline", addStyle: "icon", secondary: "icons", size: 32, gap: 6 }],
  ["Hover icons", { ...CURRENT, place: "inline", addStyle: "icon", secondary: "icons", size: 32, gap: 6, reveal: "hover" }],
  ["Overflow menu", { ...CURRENT, place: "inline", addStyle: "icon", secondary: "menu", size: 32, gap: 6 }],
  ["Compact text", { ...CURRENT, size: 30, gap: 6 }],
  ["Gallery, current", { ...CURRENT, mode: "gallery" }],
  ["Gallery, icons", { ...CURRENT, mode: "gallery", addStyle: "icon", secondary: "icons", size: 32, gap: 6 }],
];

const WIDTH: Record<Settings["width"], string> = { "900": "max-w-[900px]", "1200": "max-w-[1200px]", full: "max-w-none" };

function load(): Settings {
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return CURRENT;
    return { ...CURRENT, ...JSON.parse(raw) };
  } catch {
    return CURRENT;
  }
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
    <label className="grid grid-cols-[64px_1fr_38px] items-center gap-2 text-xs">
      <span className="text-muted">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="accent-[var(--accent-text)]" />
      <span className="text-right font-mono tabular-nums">
        {value}
        {unit}
      </span>
    </label>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------
// Preview

/** The icon for each action, shared between styles. */
const ICON = { add: Plus, maybe: BookmarkSimple, commander: Crown } as const;

function ActionButton({
  kind,
  label,
  variant,
  s,
  onClick,
}: {
  kind: keyof typeof ICON;
  label: string;
  variant: "primary" | "secondary" | "quiet";
  s: Settings;
  onClick: () => void;
}) {
  const Icon = ICON[kind];
  const iconOnly = s.addStyle === "icon" && kind === "add";
  const compact = s.secondary !== "buttons" && kind !== "add";
  if ((kind === "add" && s.addStyle === "icon") || (kind !== "add" && s.secondary === "icons")) {
    return (
      <button
        type="button"
        aria-label={label}
        title={label}
        onClick={onClick}
        style={{ width: s.size, height: s.size }}
        className={`${stdIcon("md", variant === "primary" ? "primary" : variant === "secondary" ? "secondary" : "quiet")} shrink-0`}
      >
        <Icon size={Math.round(s.size * 0.5)} weight={kind === "add" ? "bold" : "regular"} aria-hidden />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ minHeight: s.size }}
      className={`${btn[variant]} ${iconOnly || compact ? "" : "flex-1"} gap-1.5 whitespace-nowrap`}
    >
      {s.addStyle === "iconText" && kind === "add" && <Icon size={14} weight="bold" aria-hidden />}
      {label}
    </button>
  );
}

/** Add, Maybe and (when legendary) Commander, laid out the way `place`/`secondary` say. */
function Actions({ card, s, menuOpen, onToggleMenu }: { card: MockResult; s: Settings; menuOpen: boolean; onToggleMenu: () => void }) {
  const addLabel = card.already ? "Add another" : "Add";
  const stack = s.place === "column" && s.mode === "list";

  if (s.secondary === "menu") {
    return (
      <div className={`relative flex items-center ${stack ? "flex-col items-stretch" : ""}`} style={{ gap: s.gap }}>
        <ActionButton kind="add" label={addLabel} variant="primary" s={s} onClick={() => {}} />
        <button
          type="button"
          aria-label="More actions"
          aria-expanded={menuOpen}
          onClick={onToggleMenu}
          style={{ width: s.size, height: s.size }}
          className={`${stdIcon("md", "secondary")} shrink-0`}
        >
          <CaretDown size={14} aria-hidden />
        </button>
        {menuOpen && (
          <div className="absolute top-full right-0 z-10 mt-1.5 w-40 rounded-2xl border border-line bg-bg p-1.5 shadow-[0_18px_40px_rgba(0,0,0,0.45)]">
            <button type="button" className="flex min-h-9 w-full items-center gap-2 rounded-xl px-3 text-left text-sm hover:bg-surface">
              <BookmarkSimple size={15} aria-hidden /> Maybe
            </button>
            {card.legendary && (
              <button type="button" className="flex min-h-9 w-full items-center gap-2 rounded-xl px-3 text-left text-sm hover:bg-surface">
                <Crown size={15} aria-hidden /> Commander
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`flex items-stretch ${stack ? "flex-col" : "flex-row"}`} style={{ gap: s.gap }}>
      <ActionButton kind="add" label={addLabel} variant="primary" s={s} onClick={() => {}} />
      <ActionButton kind="maybe" label="Maybe" variant="secondary" s={s} onClick={() => {}} />
      {card.legendary && <ActionButton kind="commander" label="Commander" variant="quiet" s={s} onClick={() => {}} />}
    </div>
  );
}

function ListRow({ card, s }: { card: MockResult; s: Settings }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const reveal = s.reveal === "hover" ? "opacity-0 transition-opacity duration-150 group-hover/row:opacity-100 group-focus-within/row:opacity-100" : "";
  const cols = s.place === "column" ? "grid-cols-[72px_minmax(0,1fr)_auto]" : "grid-cols-[72px_minmax(0,1fr)]";
  return (
    <li className={`group/row grid items-start gap-x-4 gap-y-2 py-3 ${cols}`}>
      <div className="relative h-[52px] w-[72px] overflow-hidden rounded-xl bg-surface-2" />
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[16px] font-medium">
          {card.name}
          {card.cost && <ManaCost cost={card.cost} className="text-[15px]" />}
          {card.already && <span className="rounded-full border border-line px-2 py-px text-xs font-normal text-muted">In deck</span>}
          {card.role && <span className="rounded-full border border-line px-2 py-px text-xs font-normal text-muted">{card.role}</span>}
        </p>
        <p className="mt-0.5 font-mono text-xs text-muted">
          {card.typeLine}
          {card.price !== null && <> &middot; ${card.price.toFixed(2)}</>}
        </p>
        <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-muted">{card.text}</p>
        {s.place === "inline" && (
          <div className={`mt-2.5 ${reveal}`}>
            <Actions card={card} s={s} menuOpen={menuOpen} onToggleMenu={() => setMenuOpen((v) => !v)} />
          </div>
        )}
      </div>
      {s.place === "column" && (
        <div className={reveal}>
          <Actions card={card} s={s} menuOpen={menuOpen} onToggleMenu={() => setMenuOpen((v) => !v)} />
        </div>
      )}
    </li>
  );
}

function GalleryTile({ card, s }: { card: MockResult; s: Settings }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const reveal = s.reveal === "hover" ? "opacity-0 transition-opacity duration-150 group-hover/tile:opacity-100 group-focus-within/tile:opacity-100" : "";
  return (
    <li className="group/tile flex min-w-0 flex-col gap-2">
      <div className="relative aspect-[488/680] overflow-hidden rounded-[14px] bg-surface-2">
        {card.already && <span className="absolute top-2 left-2 rounded-full bg-bg/85 px-2.5 py-0.5 text-xs text-ink backdrop-blur">In deck</span>}
      </div>
      <p className="flex items-baseline justify-between gap-2 text-[13px]">
        <span className="min-w-0 truncate" title={card.name}>
          {card.name}
        </span>
        <span className="shrink-0 font-mono text-xs text-muted">{card.price !== null ? `$${card.price.toFixed(2)}` : ""}</span>
      </p>
      <div className={reveal}>
        <Actions card={card} s={{ ...s, place: "column" }} menuOpen={menuOpen} onToggleMenu={() => setMenuOpen((v) => !v)} />
      </div>
    </li>
  );
}

export function SearchActionsLab() {
  const [s, setS] = useState<Settings>(CURRENT);

  useEffect(() => {
    setS(load());
  }, []);

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setS((current) => {
      const next = { ...current, [key]: value };
      try {
        localStorage.setItem(STORE, JSON.stringify(next));
      } catch {
        // Not remembered. The page still works.
      }
      return next;
    });

  const applyPreset = (preset: Settings) => {
    setS(preset);
    try {
      localStorage.setItem(STORE, JSON.stringify(preset));
    } catch {
      // Not remembered.
    }
  };

  async function copySettings() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(s, null, 2));
    } catch {
      // Clipboard not available; the JSON is still visible in the panel below.
    }
  }

  return (
    <div className="min-h-screen bg-bg px-6 py-10 text-ink sm:px-10">
      <h1 className="font-display text-[32px] leading-none">Search result actions lab</h1>
      <p className="mt-2 max-w-[640px] text-sm text-muted">
        How Add, Maybe and Commander render on a card search result, in the Advanced search dialog. Tune the controls, compare presets, then
        paste the settings back.
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className="flex flex-col gap-5 lg:sticky lg:top-6 lg:max-h-[calc(100vh-48px)] lg:overflow-auto lg:pr-2">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Presets</legend>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map(([name, preset]) => (
                <button key={name} type="button" onClick={() => applyPreset(preset)} className="min-h-8 rounded-full border border-line px-3 text-xs text-muted hover:text-ink">
                  {name}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-3 border-t border-line pt-4">
            <legend className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Mode</legend>
            <Seg label="Preview" value={s.mode} options={[["list", "List"], ["gallery", "Gallery"]]} onChange={(v) => set("mode", v)} />
            <Seg label="Page width" value={s.width} options={[["900", "900"], ["1200", "1200"], ["full", "Full"]]} onChange={(v) => set("width", v)} />
          </fieldset>

          <fieldset className="flex flex-col gap-3 border-t border-line pt-4">
            <legend className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Layout</legend>
            {s.mode === "list" && (
              <Seg label="Place" value={s.place} options={[["column", "Column"], ["inline", "Inline"]]} onChange={(v) => set("place", v)} />
            )}
            <Seg label="Reveal" value={s.reveal} options={[["always", "Always"], ["hover", "On hover"]]} onChange={(v) => set("reveal", v)} />
            <Slide label="Size" value={s.size} min={28} max={44} unit="px" onChange={(v) => set("size", v)} />
            <Slide label="Gap" value={s.gap} min={4} max={16} unit="px" onChange={(v) => set("gap", v)} />
          </fieldset>

          <fieldset className="flex flex-col gap-3 border-t border-line pt-4">
            <legend className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Buttons</legend>
            <Seg label="Add" value={s.addStyle} options={[["text", "Text"], ["iconText", "Icon + text"], ["icon", "Icon only"]]} onChange={(v) => set("addStyle", v)} />
            <Seg label="Maybe / Commander" value={s.secondary} options={[["buttons", "Buttons"], ["icons", "Icons"], ["menu", "Menu"]]} onChange={(v) => set("secondary", v)} />
          </fieldset>

          <button type="button" onClick={copySettings} className={`${btn.primary} mt-2`}>
            Copy these settings
          </button>
          <pre className="max-h-48 overflow-auto rounded-2xl border border-line bg-surface p-3 text-[11px] leading-relaxed text-muted">{JSON.stringify(s, null, 2)}</pre>
        </div>

        <div className={`min-w-0 rounded-card border border-line bg-surface/40 p-6 ${WIDTH[s.width]}`}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <input readOnly value="t:dragon c:r mv<=5" className={`${field.md} max-w-[280px] font-mono text-[13px] [font-variant-ligatures:none]`} />
            <span className="text-sm text-muted">{RESULTS.length} cards found</span>
          </div>
          {s.mode === "list" ? (
            <ul className="divide-y divide-line">
              {RESULTS.map((card) => (
                <ListRow key={card.name} card={card} s={s} />
              ))}
            </ul>
          ) : (
            <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3">
              {RESULTS.map((card) => (
                <GalleryTile key={card.name} card={card} s={s} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
