"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { PaletteCompare } from "./Compare";
import { contrast, css, distance, hex, oklch, over, parse, simulate, VISIONS, type Rgba } from "./color";
import { RAW, TOKENS } from "./palette.generated";

type Theme = "dark" | "light";
const T = Object.fromEntries(TOKENS.map((t) => [t.name, t]));
const val = (name: string, theme: Theme) => parse(T[name]?.[theme] ?? "#000");
const solid = (name: string, theme: Theme, on: string) => over(val(name, theme), over(val(on, theme), val("bg", theme)));
const f = (n: number, d = 2) => n.toFixed(d);

function Section({ id, title, note, children }: { id: string; title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="border-t border-line py-10">
      <h2 className="font-display text-[44px] leading-none">{title}</h2>
      {note && <p className="mt-3 max-w-[72ch] text-[15px] text-muted">{note}</p>}
      <div className="mt-8">{children}</div>
    </section>
  );
}

const Chip = ({ ok, children }: { ok: boolean; children: ReactNode }) => (
  <span className={`rounded-full border px-2.5 py-0.5 font-mono text-xs ${ok ? "border-add-line text-add-text" : "border-danger-line text-danger"}`}>{children}</span>
);

/** The pairs a reader actually meets: text on its panel, the accent, the red, and the lines that mark the edges. */
const PAIRS: Array<{ label: string; fg: string; bg: string; over?: string; need: 4.5 | 3; kind: "text" | "ui" }> = [
  { label: "Body text on the page", fg: "text", bg: "bg", need: 4.5, kind: "text" },
  { label: "Body text on a panel", fg: "text", bg: "surface", need: 4.5, kind: "text" },
  { label: "Muted text on the page", fg: "muted", bg: "bg", need: 4.5, kind: "text" },
  { label: "Muted text on a panel", fg: "muted", bg: "surface", need: 4.5, kind: "text" },
  { label: "Muted text on a raised panel", fg: "muted", bg: "surface-2", need: 4.5, kind: "text" },
  { label: "Blue text on the page", fg: "accent-text", bg: "bg", need: 4.5, kind: "text" },
  { label: "Blue text on a panel", fg: "accent-text", bg: "surface", need: 4.5, kind: "text" },
  { label: "Label on the blue button", fg: "on-accent", bg: "accent", need: 4.5, kind: "text" },
  { label: "Red text on the page", fg: "danger", bg: "bg", need: 4.5, kind: "text" },
  { label: "Red text on a panel", fg: "danger", bg: "surface", need: 4.5, kind: "text" },
  { label: "Added card text on its tint", fg: "add-text", bg: "add-bg", over: "bg", need: 4.5, kind: "text" },
  { label: "The blue button against the page", fg: "accent", bg: "bg", need: 3, kind: "ui" },
  { label: "Hairline against the page", fg: "line", bg: "bg", need: 3, kind: "ui" },
  { label: "Hairline against a panel", fg: "line", bg: "surface", need: 3, kind: "ui" },
  { label: "Red edge against the page", fg: "danger-line", bg: "bg", need: 3, kind: "ui" },
  { label: "Blue edge against the page", fg: "add-line", bg: "bg", need: 3, kind: "ui" },
];

function Contrast() {
  return (
    <div className="grid gap-10 xl:grid-cols-2">
      {(["dark", "light"] as Theme[]).map((theme) => (
        <div key={theme}>
          <p className="mb-3 text-lg font-medium capitalize">{theme} theme</p>
          <ul className="divide-y divide-line border-y border-line">
            {PAIRS.map((p) => {
              const bg = p.over ? over(val(p.bg, theme), val(p.over, theme)) : solid(p.bg, theme, "bg");
              const base = p.over ? bg : solid(p.bg, theme, "bg");
              const fg = over(val(p.fg, theme), base);
              const ratio = contrast(fg, base);
              return (
                <li key={p.label} className="flex items-center gap-4 py-2.5">
                  <span className="flex h-10 w-16 shrink-0 items-center justify-center rounded-xl border border-line text-[15px] font-medium" style={{ background: css(base), color: css(fg), borderColor: p.kind === "ui" ? css(fg) : undefined }}>
                    Aa
                  </span>
                  <span className="min-w-0 flex-1 text-sm">
                    {p.label}
                    <span className="block font-mono text-xs text-muted">
                      {p.fg} on {p.bg}
                    </span>
                  </span>
                  <span className="font-mono text-sm">{f(ratio)}:1</span>
                  <Chip ok={ratio >= p.need}>{p.kind === "ui" ? "needs 3" : "needs 4.5"} {ratio >= p.need ? "pass" : "fail"}</Chip>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Tokens() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {TOKENS.map((t) => {
        const d = val(t.name, "dark"), l = val(t.name, "light");
        const od = oklch(over(d, val("bg", "dark"))), ol = oklch(over(l, val("bg", "light")));
        return (
          <div key={t.name} className="rounded-card border border-line bg-surface p-5">
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-mono text-sm">--{t.name}</p>
              <p className="font-mono text-xs text-muted">
                {t.classUses} classes, {t.varUses} var()
              </p>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {[["dark", d, od, t.dark], ["light", l, ol, t.light]].map(([name, c, k, raw]) => (
                <div key={name as string}>
                  <div className="h-16 rounded-xl border border-line" style={{ background: name === "dark" ? "#0a0a0a" : "#f4f4f2" }}>
                    <div className="h-full w-full rounded-xl" style={{ background: css(c as Rgba) }} />
                  </div>
                  <p className="mt-2 font-mono text-[11px] text-muted">{name as string}</p>
                  <p className="font-mono text-xs break-all">{raw as string}</p>
                  <p className="font-mono text-[11px] text-muted">
                    L {f((k as ReturnType<typeof oklch>).l)} C {f((k as ReturnType<typeof oklch>).c)} H {Math.round((k as ReturnType<typeof oklch>).h)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Ramp() {
  const dark = useMemo(() => TOKENS.filter((t) => !t.dark.includes("rgba")).map((t) => ({ name: t.name, c: parse(t.dark), k: oklch(parse(t.dark)) })).sort((a, b) => a.k.l - b.k.l), []);
  const size = 320, mid = size / 2, scale = 2.4;
  const colored = TOKENS.map((t) => ({ name: t.name, c: over(parse(t.dark), val("bg", "dark")), k: oklch(over(parse(t.dark), val("bg", "dark"))) })).filter((x) => x.k.c > 0.02);
  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_360px]">
      <div>
        <p className="mb-3 text-lg font-medium">Lightness, dark to light</p>
        <p className="mb-5 max-w-[60ch] text-sm text-muted">Each opaque token placed by how light it is (OKLCH L). The grey steps that sit close together are the ones that are hard to tell apart.</p>
        <div className="flex items-end gap-1">
          {dark.map((d) => (
            <div key={d.name} className="flex flex-1 flex-col items-center gap-2">
              <span className="font-mono text-[11px] text-muted">{f(d.k.l)}</span>
              <div className="w-full rounded-lg border border-line" style={{ height: 40 + d.k.l * 120, background: css(d.c) }} />
              <span className="font-mono text-[11px] text-muted [writing-mode:vertical-rl]">{d.name}</span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-3 text-lg font-medium">Hue and chroma</p>
        <p className="mb-3 text-sm text-muted">Only the coloured tokens. Distance from the centre is how saturated, the angle is the hue.</p>
        <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[360px] rounded-card border border-line bg-surface" role="img" aria-label="Hue and chroma of the coloured tokens">
          {[0.05, 0.1, 0.15].map((c) => (
            <circle key={c} cx={mid} cy={mid} r={c * 1000 * scale * 0.4} fill="none" stroke="var(--line)" />
          ))}
          {colored.map((x) => {
            const r = x.k.c * 1000 * scale * 0.4, a = (x.k.h * Math.PI) / 180;
            return (
              <g key={x.name}>
                <circle cx={mid + Math.cos(a) * r} cy={mid - Math.sin(a) * r} r={9} fill={css(x.c)} stroke="var(--text)" strokeWidth={1} />
                <text x={mid + Math.cos(a) * r + 13} y={mid - Math.sin(a) * r + 4} fontSize="10" fill="var(--muted)" fontFamily="monospace">{x.name}</text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function Vision() {
  const set: Array<[string, string]> = [["accent-text", "blue"], ["danger", "red"], ["add-text", "added"], ["muted", "muted"], ["text", "text"]];
  const base = val("bg", "dark");
  const colors = set.map(([n, label]) => ({ n, label, c: over(val(n, "dark"), base) }));
  return (
    <div>
      <div className="grid gap-4 md:grid-cols-2">
        {(["normal", ...VISIONS] as const).map((v) => (
          <div key={v} className="rounded-card border border-line bg-surface p-5">
            <p className="mb-3 text-sm capitalize">{v === "normal" ? "typical vision" : v}</p>
            <div className="flex gap-3">
              {colors.map((x) => (
                <div key={x.n} className="flex-1 text-center">
                  <div className="h-12 rounded-xl border border-line" style={{ background: css(v === "normal" ? x.c : simulate(x.c, v)) }} />
                  <p className="mt-1 font-mono text-[11px] text-muted">{x.label}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-6 rounded-card border border-line p-5">
        <p className="mb-3 text-sm">How different is the red from the blue, as each kind of viewer sees it? Under 0.1 is easy to confuse.</p>
        <div className="flex flex-wrap gap-3">
          {(["normal", ...VISIONS] as const).map((v) => {
            const a = v === "normal" ? colors[0].c : simulate(colors[0].c, v), b = v === "normal" ? colors[1].c : simulate(colors[1].c, v);
            const d = distance(a, b);
            return <Chip key={v} ok={d >= 0.1}>{v}: {f(d)}</Chip>;
          })}
        </div>
        <p className="mt-3 text-xs text-muted">The app never relies on colour alone: a danger action always has the word Delete, an issue has text, and changes have + and − signs.</p>
      </div>
    </div>
  );
}

function Raw() {
  const tokens = TOKENS.map((t) => ({ name: t.name, c: over(parse(t.dark), val("bg", "dark")) }));
  return (
    <ul className="divide-y divide-line border-y border-line">
      {RAW.map((r) => {
        const c = parse(r.value);
        const flat = over(c, val("bg", "dark"));
        const near = tokens.map((t) => ({ ...t, d: distance(flat, t.c) })).sort((a, b) => a.d - b.d)[0];
        return (
          <li key={r.value} className="grid items-center gap-4 py-3 md:grid-cols-[56px_minmax(200px,260px)_70px_1fr]">
            <span className="h-10 w-14 rounded-lg border border-line" style={{ background: css(c) }} />
            <span className="font-mono text-sm">{r.value}</span>
            <span className="font-mono text-sm text-muted">{r.count}×</span>
            <span className="text-xs text-muted">
              <span className="font-mono">{r.files.slice(0, 3).join("  ·  ")}</span>
              <span className="block">{near.d < 0.04 ? `almost --${near.name}, could use it` : `nearest token is --${near.name}, but it is ${f(near.d)} away: a separate colour`}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

const DERIVED: Array<{ label: string; fg: string | null; bg: string; theme: Theme; note: string }> = [];

function Derived() {
  const rows = (theme: Theme) => {
    const page = val("bg", theme), text = val("text", theme);
    const mix = (pct: number, base: Rgba, top: Rgba) => over({ ...top, a: pct }, base);
    const white = { r: 255, g: 255, b: 255, a: 1 };
    return [
      { label: "Matte button fill", c: mix(0.08, page, text), vs: page, need: "1.1 or more against the panel is enough: it is a fill, not text" },
      { label: "Matte button edge", c: mix(0.15, page, text), vs: page, need: "an edge should read at 1.5 or more" },
      { label: "Matte button, hovered", c: mix(0.13, page, text), vs: page, need: "" },
      { label: "Glass fill (white 10%)", c: mix(0.1, page, white), vs: page, need: "" },
      { label: "Glass edge (white 25%)", c: mix(0.25, page, white), vs: page, need: "an edge should read at 1.5 or more" },
    ].map((r) => ({ ...r, ratio: contrast(r.c, r.vs) }));
  };
  void DERIVED;
  return (
    <div className="grid gap-8 lg:grid-cols-2">
      {(["dark", "light"] as Theme[]).map((theme) => (
        <div key={theme}>
          <p className="mb-3 text-lg font-medium capitalize">{theme} theme</p>
          <ul className="divide-y divide-line border-y border-line">
            {rows(theme).map((r) => (
              <li key={r.label} className="flex items-center gap-4 py-3">
                <span className="flex h-10 w-16 shrink-0 items-center justify-center rounded-xl text-sm" style={{ background: css(val("bg", theme)) }}>
                  <span className="h-8 w-14 rounded-lg" style={{ background: css(r.c) }} />
                </span>
                <span className="flex-1 text-sm">
                  {r.label}
                  <span className="block font-mono text-xs text-muted">{hex(r.c)}</span>
                </span>
                <span className="font-mono text-sm">{f(r.ratio)}:1</span>
                {r.label.includes("edge") && <Chip ok={r.ratio >= 1.5}>{r.ratio >= 1.5 ? "reads" : "invisible"}</Chip>}
                {r.label.includes("Glass fill") && <Chip ok={r.ratio >= 1.1}>{r.ratio >= 1.1 ? "reads" : "invisible"}</Chip>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

const STRANDS: Array<[string, string]> = [["#38d6ff", "Cyan"], ["#9b6bff", "Violet"], ["#ff4fd8", "Magenta"], ["#3dff8a", "Green"], ["#ffb02e", "Amber"]];

function Strands() {
  const panel = val("surface", "dark"), page = val("bg", "dark");
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {STRANDS.map(([hexv, name]) => {
        const c = parse(hexv), k = oklch(c);
        return (
          <div key={hexv} className="rounded-card border border-line bg-surface p-5">
            <div className="h-14 rounded-xl" style={{ background: hexv, boxShadow: `0 0 24px -4px ${hexv}` }} />
            <p className="mt-3 text-sm">{name}</p>
            <p className="font-mono text-xs text-muted">{hexv}</p>
            <p className="font-mono text-[11px] text-muted">L {f(k.l)} C {f(k.c)} H {Math.round(k.h)}</p>
            <p className="mt-2 font-mono text-xs">{f(contrast(c, page))}:1 on the page</p>
            <p className="font-mono text-xs">{f(contrast(c, panel))}:1 on a panel</p>
          </div>
        );
      })}
    </div>
  );
}

export function Palette() {
  // The colour maths differs in the last digit between the server and the browser, so the page is drawn in the browser only.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const fails = useMemo(() => {
    let n = 0;
    for (const theme of ["dark", "light"] as Theme[])
      for (const p of PAIRS) {
        const base = p.over ? over(val(p.bg, theme), val(p.over, theme)) : solid(p.bg, theme, "bg");
        if (contrast(over(val(p.fg, theme), base), base) < p.need) n++;
      }
    return n;
  }, []);
  if (!ready) return <div className="shell pb-32" />;
  return (
    <div className="shell pb-32">
      <header className="pt-12 pb-8">
        <p className="font-mono text-xs text-muted">Development only</p>
        <h1 className="mt-2 font-display text-[clamp(56px,8vw,112px)] leading-[0.92]">Palette</h1>
        <p className="mt-4 max-w-[68ch] text-lg text-muted">
          The {TOKENS.length} colour tokens, in both themes, with their contrast, their OKLCH values, how they look to colour-blind viewers, and the colours written by hand outside the tokens. Read from the source by scripts/palette-inventory.mjs.
        </p>
        <p className="mt-4 text-sm">
          <span className={fails ? "text-danger" : "text-add-text"}>{fails} of {PAIRS.length * 2} measured pairs miss their target</span>
          <span className="text-muted">, counting dark and light together.</span>
        </p>
        <nav className="mt-6 flex flex-wrap gap-2 text-sm">
          {[["compare", "Compare palettes"], ["tokens", "Tokens"], ["contrast", "Contrast"], ["ramp", "Lightness and hue"], ["vision", "Colour blindness"], ["derived", "Matte and glass"], ["strands", "Strand colours"], ["raw", "Written by hand"]].map(([id, text]) => (
            <a key={id} href={`#${id}`} className="inline-flex min-h-9 items-center rounded-full px-4 text-muted transition-colors hover:bg-surface hover:text-ink">
              {text}
            </a>
          ))}
        </nav>
      </header>
      <Section id="compare" title="Compare palettes" note="Pick two. Each shows its colours, how every pair holds up, and the deck page drawn with that palette's colours in the real components. A colour marked derived was worked out by me to make the palette usable, not taken from the reference. Add more in palette/candidates.ts.">
        <PaletteCompare />
      </Section>
      <Section id="tokens" title="Tokens" note="Every colour variable, dark beside light, with its OKLCH reading and how many classes and var() calls use it. Tokens with a tiny count are candidates to merge, and ones with a huge count are the real palette.">
        <Tokens />
      </Section>
      <Section id="contrast" title="Contrast" note="The pairs that appear on screen, measured the way a screen reader audit does (WCAG). Text needs 4.5:1. The edges and fills that mark a control need 3:1.">
        <Contrast />
      </Section>
      <Section id="ramp" title="Lightness and hue" note="Where the colours sit, as numbers rather than as swatches.">
        <Ramp />
      </Section>
      <Section id="vision" title="Colour blindness" note="The same five colours as three kinds of colour-blind viewer would see them.">
        <Vision />
      </Section>
      <Section id="derived" title="Matte and glass" note="The new button looks are not tokens, they are mixes of tokens. This is what they come out as in each theme, and whether the edge can be seen.">
        <Derived />
      </Section>
      <Section id="strands" title="Strand colours" note="The five choices for the version timeline, which only show in the dark theme.">
        <Strands />
      </Section>
      <Section id="raw" title="Colours written by hand" note={`${RAW.length} colours appear in the code outside the tokens. Each is shown with the closest token, so it is clear which are real exceptions and which are just a token typed out.`}>
        <Raw />
      </Section>
    </div>
  );
}
