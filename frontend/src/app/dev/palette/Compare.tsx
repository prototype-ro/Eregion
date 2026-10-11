"use client";

import { useMemo, useState } from "react";
import { ButtonCss } from "../components/ButtonStyles";
import { Mock } from "../components/TierMock";
import { CANDIDATES, type Candidate } from "./candidates";
import { contrast, css, hex, oklch, over, parse } from "./color";
import { TOKENS } from "./palette.generated";

const CURRENT: Candidate = {
  id: "current",
  name: "Current Eregion",
  source: "The tokens in globals.css, dark theme",
  note: "Black and one blue, with a muted red for danger. Neutral greys, no tint.",
  tokens: Object.fromEntries(TOKENS.filter((t) => !t.dark.includes("rgba")).map((t) => [t.name, { value: t.dark, from: "reference" as const }])),
  light: Object.fromEntries(TOKENS.filter((t) => !t.light.includes("rgba")).map((t) => [t.name, { value: t.light, from: "reference" as const }])),
  extras: [],
};
type Theme = "dark" | "light";
const ALL = [CURRENT, ...CANDIDATES];
const f = (n: number, d = 2) => n.toFixed(d);

/** Fill in what a candidate leaves out from the current palette, and turn every token into a CSS variable for the preview. */
function resolve(c: Candidate, theme: Theme) {
  const set = (x: Candidate) => (theme === "light" ? x.light : x.tokens) ?? {};
  const get = (name: string) => set(c)[name]?.value ?? set(CURRENT)[name]?.value ?? "#000";
  const text = parse(get("text"));
  const line = `rgba(${Math.round(text.r)}, ${Math.round(text.g)}, ${Math.round(text.b)}, 0.14)`;
  const tint = (name: string, a: number) => {
    const x = parse(get(name));
    return `rgba(${Math.round(x.r)}, ${Math.round(x.g)}, ${Math.round(x.b)}, ${a})`;
  };
  const vars: Record<string, string> = {
    "--bg": get("bg"), "--surface": get("surface"), "--surface-2": get("surface-2"), "--text": get("text"), "--muted": get("muted"), "--line": line,
    "--accent": get("accent"), "--accent-text": get("accent-text"), "--on-accent": get("on-accent"),
    "--add-bg": tint("add-text", 0.12), "--add-line": tint("add-text", 0.42), "--add-text": get("add-text"),
    "--danger": get("danger"), "--danger-line": tint("danger", 0.45),
  };
  return { get, vars };
}

const ROWS: Array<{ label: string; fg: string; bg: string; need: number }> = [
  { label: "Body text on the page", fg: "text", bg: "bg", need: 4.5 },
  { label: "Body text on a panel", fg: "text", bg: "surface", need: 4.5 },
  { label: "Muted text on the page", fg: "muted", bg: "bg", need: 4.5 },
  { label: "Muted text on a panel", fg: "muted", bg: "surface", need: 4.5 },
  { label: "Muted text on a raised panel", fg: "muted", bg: "surface-2", need: 4.5 },
  { label: "Accent text on the page", fg: "accent-text", bg: "bg", need: 4.5 },
  { label: "Label on the accent button", fg: "on-accent", bg: "accent", need: 4.5 },
  { label: "Danger text on the page", fg: "danger", bg: "bg", need: 4.5 },
  { label: "Danger text on a panel", fg: "danger", bg: "surface", need: 4.5 },
  { label: "Added text on the page", fg: "add-text", bg: "bg", need: 4.5 },
  { label: "The accent button against the page", fg: "accent", bg: "bg", need: 3 },
];

function Column({ c, theme }: { c: Candidate; theme: Theme }) {
  const { get, vars } = useMemo(() => resolve(c, theme), [c, theme]);
  const tokens = (theme === "light" ? c.light : c.tokens) ?? {};
  if (theme === "light" && !c.light)
    return (
      <div>
        <p className="text-xl font-medium">{c.name}</p>
        <p className="mt-3 rounded-card border border-line p-5 text-sm text-muted">No light version yet. Ask for one and it gets added to candidates.ts.</p>
      </div>
    );
  const names = ["bg", "surface", "surface-2", "text", "muted", "accent", "accent-text", "on-accent", "danger", "add-text"];
  const results = ROWS.map((r) => ({ ...r, ratio: contrast(parse(get(r.fg)), over(parse(get(r.bg)), parse(theme === "light" ? "#fff" : "#000"))) }));
  const fails = results.filter((r) => r.ratio < r.need).length;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xl font-medium">{c.name}</p>
        <p className={`font-mono text-xs ${fails ? "text-danger" : "text-add-text"}`}>{fails ? `${fails} of ${ROWS.length} below target` : `all ${ROWS.length} pairs pass`}</p>
      </div>
      <p className="mt-1 text-xs text-muted">{c.source}</p>
      <p className="mt-2 min-h-[4.5em] text-[13px] text-muted">{c.note}</p>

      <div className="mt-4 grid grid-cols-5 gap-2">
        {names.map((n) => {
          const col = parse(get(n)), k = oklch(col), t = tokens[n];
          return (
            <div key={n} title={t?.why}>
              <div className="h-12 rounded-lg border border-line" style={{ background: css(col) }} />
              <p className="mt-1 truncate font-mono text-[10px]">{n}</p>
              <p className="font-mono text-[10px] text-muted">{hex(col)}</p>
              <p className="font-mono text-[10px] text-muted">
                L{f(k.l)} C{f(k.c)} H{Math.round(k.h)}
              </p>
              <p className={`font-mono text-[10px] ${t?.from === "derived" ? "text-accent-text" : "text-muted"}`}>{c.id === "current" ? "" : t ? (t.from === "derived" ? "derived" : "from reference") : "kept from current"}</p>
            </div>
          );
        })}
      </div>

      {c.extras.length > 0 && (
        <>
          <p className="mt-5 mb-2 text-xs text-muted">Also in the palette, with no token yet</p>
          <div className="flex flex-wrap gap-2">
            {c.extras.map((x) => (
              <div key={x.name} className="w-[72px]">
                <div className="h-8 rounded-lg border border-line" style={{ background: x.value }} />
                <p className="mt-1 font-mono text-[10px]">{x.name}</p>
                <p className="font-mono text-[10px] text-muted">{x.value}</p>
              </div>
            ))}
          </div>
        </>
      )}

      <ul className="mt-5 divide-y divide-line border-y border-line text-xs">
        {results.map((r) => (
          <li key={r.label} className="flex items-center gap-3 py-1.5">
            <span className="flex h-6 w-9 shrink-0 items-center justify-center rounded-md border border-line text-[11px] font-medium" style={{ background: css(over(parse(get(r.bg)), parse(theme === "light" ? "#fff" : "#000"))), color: css(parse(get(r.fg))) }}>Aa</span>
            <span className="min-w-0 flex-1 truncate">{r.label}</span>
            <span className="font-mono">{f(r.ratio)}</span>
            <span className={`w-10 text-right font-mono ${r.ratio >= r.need ? "text-add-text" : "text-danger"}`}>{r.ratio >= r.need ? "pass" : "fail"}</span>
          </li>
        ))}
      </ul>

      <p className="mt-6 mb-2 text-xs text-muted">The deck page, in this palette</p>
      <div style={{ ...vars, background: "var(--bg)", color: "var(--text)" } as React.CSSProperties} className="rounded-card">
        <Mock tier="tiered" companion="matte" />
      </div>
    </div>
  );
}

export function PaletteCompare() {
  const [a, setA] = useState("current");
  const [b, setB] = useState(CANDIDATES[0]?.id ?? "current");
  const [theme, setTheme] = useState<Theme>("dark");
  const pick = (id: string) => ALL.find((x) => x.id === id) ?? CURRENT;
  const chips = (value: string, set: (id: string) => void, label: string) => (
    <div>
      <p className="mb-2 text-xs text-muted">{label}</p>
      <div className="flex flex-wrap gap-2">
        {ALL.map((x) => (
          <button key={x.id} type="button" aria-pressed={value === x.id} onClick={() => set(x.id)} className={`min-h-9 rounded-full border px-4 text-[13px] transition-colors ${value === x.id ? "border-accent-text text-accent-text" : "border-line text-muted hover:border-ink hover:text-ink"}`}>
            {x.name}
          </button>
        ))}
      </div>
    </div>
  );
  return (
    <div>
      <ButtonCss />
      <div className="mb-6 flex gap-2" role="group" aria-label="Theme">
        {(["dark", "light"] as Theme[]).map((t) => (
          <button key={t} type="button" aria-pressed={theme === t} onClick={() => setTheme(t)} className={`min-h-9 rounded-full border px-4 text-[13px] capitalize transition-colors ${theme === t ? "border-accent-text text-accent-text" : "border-line text-muted hover:border-ink hover:text-ink"}`}>
            {t} theme
          </button>
        ))}
      </div>
      <div className="mb-8 grid gap-5 md:grid-cols-2">
        {chips(a, setA, "Left")}
        {chips(b, setB, "Right")}
      </div>
      <div className="grid items-start gap-10 xl:grid-cols-2">
        <Column c={pick(a)} theme={theme} />
        <Column c={pick(b)} theme={theme} />
      </div>
    </div>
  );
}
