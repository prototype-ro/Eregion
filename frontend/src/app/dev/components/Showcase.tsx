"use client";

import { Check, GitBranch, Lock, PencilSimpleLine, Plus, SlidersHorizontal, Trash } from "@phosphor-icons/react";
import { useMemo, useState, type ReactNode } from "react";
import { btn, tag } from "@/lib/ui";
import { ButtonStyles } from "./ButtonStyles";
import { TierCompare } from "./TierMock";
import { HELPER_USES, VARIANTS as FOUND, type Variant as Found } from "./inventory.generated";
import { STD_FIELD, STD_TAG, SIZES, fieldAt, iconAt, segAt, std, stdAt, stdIcon, type Height, type Size, type Variant } from "./standard";

const KINDS = ["primary", "secondary", "secondary muted", "quiet", "danger solid", "danger outline", "field", "tag or chip", "other"] as const;
const HINT: Record<string, string> = {
  primary: "Filled blue. The main action.",
  secondary: "Outlined in ink. Alternatives.",
  "secondary muted": "Outlined in grey. A quieter alternative.",
  quiet: "Text only.",
  "danger solid": "Filled red confirm.",
  "danger outline": "Outlined red.",
  field: "Text inputs and selects.",
  "tag or chip": "Small labels, statuses, counts.",
  other: "Everything else with rounded ends: toasts, switches, pills in menus.",
};

function Section({ id, title, note, children }: { id: string; title: string; note?: string; children: ReactNode }) {
  return (
    <section id={id} className="border-t border-line py-10">
      <h2 className="font-display text-[44px] leading-none">{title}</h2>
      {note && <p className="mt-3 max-w-[70ch] text-[15px] text-muted">{note}</p>}
      <div className="mt-8">{children}</div>
    </section>
  );
}

const Label = ({ children }: { children: ReactNode }) => <p className="mb-2 font-mono text-xs text-muted">{children}</p>;

/** Positioning belongs to where a class string is used, not to how it looks, so it is dropped to draw each one in place. */
const LAYOUT = /^(fixed|absolute|sticky|relative|hidden|flex-1|self-start|inset-.*|top-.*|bottom-.*|left-.*|right-.*|z-.*|-?translate-.*|m[trblxy]?-.*|(sm|md|lg|xl):.*)$/;
const flat = (classes: string) => classes.split(" ").filter((t) => t && !LAYOUT.test(t)).join(" ");

/** What a found class string looks like, so it can be seen next to the others of its kind. */
function Sample({ v }: { v: Found }) {
  const label = v.kind === "tag or chip" ? "Label" : v.kind === "other" ? "Sample" : v.kind.startsWith("danger") ? "Delete" : v.kind === "primary" ? "Save version" : "Branch off";
  const classes = flat(v.classes);
  if (v.kind === "field") return <input readOnly placeholder="Search by card name" className={classes.replace(/\bw-full\b/, "w-56")} />;
  if (v.kind === "tag or chip" || v.kind === "other") return <span className={classes}>{label}</span>;
  return (
    <button type="button" className={classes}>
      {label}
    </button>
  );
}

/** The same four contexts at one control height, drawn as they appear in the app. */
function Contexts({ h }: { h: Height }) {
  const [seg, setSeg] = useState("List");
  const [on, setOn] = useState(false);
  return (
    <div className="grid gap-5">
      <div className="rounded-card border border-line bg-surface px-5 py-4">
        <p className="mb-3 text-lg font-medium">Versions</p>
        <div className="flex flex-wrap items-center gap-2.5 border-t border-line pt-4">
          <button type="button" disabled className={stdAt("secondary", h)}>Save</button>
          <button type="button" className={stdAt("primary", h)}>Save new version</button>
          <button type="button" className={stdAt("secondary", h)}>Branch off</button>
          <button type="button" className={stdAt("secondary", h)}>Compare</button>
          <button type="button" className={stdAt("quiet", h)}>More</button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-card border border-line px-5 py-4">
        <label className="flex items-center gap-2 text-sm text-muted">Group by
          <select className={`${fieldAt(h)} !w-auto`} defaultValue="Type"><option>Type</option><option>Mana value</option></select>
        </label>
        <label className="flex items-center gap-2 text-sm text-muted">Sort by
          <select className={`${fieldAt(h)} !w-auto`} defaultValue="Name"><option>Name</option><option>Price</option></select>
        </label>
        <button type="button" aria-label="Direction" className={`${iconAt(h)} border border-line`}><SlidersHorizontal size={h === 36 ? 16 : 18} aria-hidden /></button>
        <button type="button" role="switch" aria-checked={on} aria-label="Check collection" onClick={() => setOn((v) => !v)} className={`relative h-7 w-12 rounded-full border transition-colors ${on ? "border-accent-text bg-accent" : "border-line bg-surface"}`}>
          <span className={`absolute top-0.5 size-5 rounded-full bg-ink transition-transform ${on ? "translate-x-[22px]" : "translate-x-0.5"}`} />
        </button>
        <div role="group" className="inline-flex rounded-full border border-line p-1">
          {["List", "Stacks", "Gallery"].map((n) => (
            <button key={n} type="button" aria-pressed={seg === n} onClick={() => setSeg(n)} className={segAt(h, seg === n)}>{n}</button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-card border border-line px-5 py-4">
        <span className={`${std("secondary", "md").replace(SIZES.md, "")} ${h === 36 ? "min-h-9 px-4 text-[13px]" : "min-h-11 px-5 text-[15px]"} border-line`}>Version 4</span>
        <button type="button" className={stdAt("secondary", h)}><Lock size={14} aria-hidden /> Private</button>
        <button type="button" className={stdAt("secondary", h)}><PencilSimpleLine size={14} aria-hidden /> Add description</button>
      </div>
      <div className="rounded-card border border-line bg-bg p-5 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
        <p className="font-display text-3xl leading-none">Note for v4</p>
        <label className="mt-4 block text-sm text-muted">What this version is</label>
        <input className={`${fieldAt(h)} mt-1.5`} defaultValue="Cut card draw for threats" />
        <div className="mt-4 flex gap-2.5">
          <button type="button" className={stdAt("primary", h)}>Save note</button>
          <button type="button" className={stdAt("secondary", h)}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function SizeCompare() {
  const [narrow, setNarrow] = useState(false);
  return (
    <div>
      <label className="mb-6 inline-flex cursor-pointer items-center gap-3 rounded-full border border-line px-4 py-2 text-sm select-none">
        <input type="checkbox" checked={narrow} onChange={(e) => setNarrow(e.target.checked)} className="accent-[var(--accent-text)]" />
        Squeeze each to a phone (390 px wide)
      </label>
      <div className={`grid items-start gap-8 ${narrow ? "" : "lg:grid-cols-2"}`}>
        {([36, 44] as Height[]).map((h) => (
          <div key={h} className={narrow ? "grid grid-cols-1 gap-3" : ""}>
            <p className="mb-3 font-mono text-xs text-muted">{h === 36 ? "36 px controls, 13 px text. The audit tool flags every one of them." : "44 px controls, 15 px text. Passes the touch-target rule on every screen."}</p>
            <div className={narrow ? "w-[390px] max-w-full" : ""}>
              <Contexts h={h} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Showcase() {
  const [kind, setKind] = useState<string>("all");
  const [sort, setSort] = useState<"count" | "kind">("count");
  const [toggle, setToggle] = useState(false);
  const [segment, setSegment] = useState("List");
  const [swatch, setSwatch] = useState("#38d6ff");

  const stats = useMemo(() => {
    const kinds = new Map<string, { variants: number; uses: number; heights: Set<string>; paddings: Set<string>; texts: Set<string> }>();
    for (const v of FOUND) {
      const k = kinds.get(v.kind) ?? { variants: 0, uses: 0, heights: new Set(), paddings: new Set(), texts: new Set() };
      k.variants++;
      k.uses += v.count;
      if (v.height) k.heights.add(v.height);
      if (v.padding) k.paddings.add(v.padding);
      if (v.text) k.texts.add(v.text);
      kinds.set(v.kind, k);
    }
    const buttons = FOUND.filter((v) => ["primary", "secondary", "secondary muted", "danger solid", "danger outline"].includes(v.kind));
    return { kinds, buttons, heights: new Set(buttons.map((v) => v.height).filter(Boolean)), singles: FOUND.filter((v) => v.count === 1).length };
  }, []);

  const shown = FOUND.filter((v) => kind === "all" || v.kind === kind).sort((a, b) => (sort === "count" ? b.count - a.count : a.kind.localeCompare(b.kind) || b.count - a.count));

  return (
    <div className="shell pb-32">
      <header className="pt-12 pb-8">
        <p className="font-mono text-xs text-muted">Development only</p>
        <h1 className="mt-2 font-display text-[clamp(56px,8vw,112px)] leading-[0.92]">Components</h1>
        <p className="mt-4 max-w-[68ch] text-lg text-muted">Every pill-shaped control the app uses today, counted from the source, and a proposed standard to replace them. The first half is what exists. The second half is what could be.</p>
        <nav className="mt-6 flex flex-wrap gap-2 text-sm">
          {[["now", "What exists"], ["standard", "Proposed standard"], ["styles", "Button styles"], ["tiers", "Glass by hierarchy"], ["sizes", "36 or 44"], ["fields", "Fields"], ["tags", "Labels"], ["surfaces", "Surfaces"], ["found", "Every variant"]].map(([id, text]) => (
            <a key={id} href={`#${id}`} className={btn.quiet}>
              {text}
            </a>
          ))}
        </nav>
      </header>

      <Section id="now" title="What exists" note={`Counted from the source by scripts/style-inventory.mjs. ${FOUND.length} different class strings make a pill. ${stats.singles} of them are used exactly once.`}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [String(stats.buttons.length), "button styles", `across ${stats.heights.size} different heights`],
            [String(stats.kinds.get("primary")?.variants ?? 0), "primary buttons", `${stats.kinds.get("primary")?.paddings.size ?? 0} paddings, ${stats.kinds.get("primary")?.texts.size ?? 0} text sizes`],
            [String(stats.kinds.get("secondary")?.variants ?? 0), "secondary buttons", `${stats.kinds.get("secondary")?.paddings.size ?? 0} paddings, ${stats.kinds.get("secondary")?.texts.size ?? 0} text sizes`],
            [String(stats.kinds.get("field")?.variants ?? 0), "field styles", `${stats.kinds.get("field")?.heights.size ?? 0} heights for one kind of input`],
          ].map(([n, what, sub]) => (
            <div key={what} className="rounded-card border border-line bg-surface p-6">
              <p className="text-6xl leading-none font-medium tracking-[-0.04em]">{n}</p>
              <p className="mt-3 text-base">{what}</p>
              <p className="mt-1 text-sm text-muted">{sub}</p>
            </div>
          ))}
        </div>

        <div className="mt-10">
          <h3 className="text-xl font-medium">The shared helper</h3>
          <p className="mt-2 max-w-[70ch] text-[15px] text-muted">lib/ui.ts already has four button styles. Only {HELPER_USES} buttons use it. The rest write their classes by hand.</p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button type="button" className={btn.primary}>btn.primary</button>
            <button type="button" className={btn.secondary}>btn.secondary</button>
            <button type="button" className={btn.quiet}>btn.quiet</button>
            <button type="button" className={btn.danger}>btn.danger</button>
            <span className={tag}>tag</span>
          </div>
        </div>
      </Section>

      <Section id="standard" title="Proposed standard" note="Matte buttons, plus glass for the few controls that float over art. Two sizes: 36px with 13px text, growing to 44px on a touch screen, and a large 44px for sign in, dialogs and the landing page. Hover and press are live, try them.">
        <div className="grid gap-8">
          {(["primary", "secondary", "quiet", "danger", "dangerSolid", "glass"] as Variant[]).map((variant) => (
            <div key={variant}>
              <Label>{variant}</Label>
              <div className={`flex flex-wrap items-center gap-3 ${variant === "glass" ? "relative overflow-hidden rounded-card border border-line p-5" : ""}`} style={variant === "glass" ? { background: "radial-gradient(420px 220px at 85% 30%, rgba(155,107,255,.16), transparent 70%), var(--surface)" } : undefined}>
                {variant === "glass" && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src="/art/nobg-knight.png" alt="" aria-hidden="true" className="pointer-events-none absolute -top-16 left-[10%] h-[300px] w-auto max-w-none opacity-80" />
                )}
                {(Object.keys(SIZES) as Size[]).map((size) => (
                  <button key={size} type="button" className={`${std(variant, size)} relative`}>
                    {variant === "primary" ? "Save new version" : variant.startsWith("danger") ? "Delete version" : "Branch off"} <span className="font-mono text-xs opacity-60">{size}</span>
                  </button>
                ))}
                <button type="button" disabled className={`${std(variant, "md")} relative`}>
                  Disabled
                </button>
              </div>
              {variant === "glass" && <p className="mt-2 text-xs text-muted">Shown over the commander art, where it has something to see through. On a flat panel it is just a lighter pill.</p>}
            </div>
          ))}
          <div>
            <Label>with an icon, a toggle and a link-like action</Label>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className={std("primary", "md")}>
                <Plus size={16} weight="bold" aria-hidden /> New deck
              </button>
              <button type="button" className={std("secondary", "md")}>
                <GitBranch size={16} aria-hidden /> Branches
              </button>
              <button
                type="button"
                aria-pressed={toggle}
                onClick={() => setToggle((v) => !v)}
                className={`${std("secondary", "md")} ${toggle ? "!border-accent-text !text-accent-text" : ""}`}
              >
                {toggle && <Check size={14} weight="bold" aria-hidden />} Branch off
              </button>
              <button type="button" className={std("quiet", "md")}>
                <SlidersHorizontal size={16} aria-hidden /> Filters
              </button>
              <button type="button" aria-label="Rename" className={stdIcon("md")}>
                <PencilSimpleLine size={18} aria-hidden />
              </button>
              <button type="button" aria-label="Delete" className={`${stdIcon("md")} !text-danger`}>
                <Trash size={18} aria-hidden />
              </button>
              <button type="button" aria-label="Private" className={stdIcon("md")}>
                <Lock size={16} aria-hidden />
              </button>
            </div>
          </div>
          <div>
            <Label>focus ring (press Tab)</Label>
            <div className="flex flex-wrap gap-3">
              <button type="button" className={std("primary")}>First</button>
              <button type="button" className={std("secondary")}>Second</button>
              <button type="button" className={std("quiet")}>Third</button>
            </div>
          </div>
        </div>
      </Section>

      <Section id="styles" title="Button styles" note="Nine looks and ways of moving for the same buttons, to choose from before anything is standardised. They share one shape and size. The tag in each corner says how costly the effect is to draw, which matters: backdrop blur and animated clips are what make a page feel slow.">
        <ButtonStyles />
      </Section>

      <Section id="tiers" title="Glass by hierarchy" note="One deck page in miniature, dressed three ways. Hover the buttons. The counter under each says how many of them are a live backdrop blur, which is the number to keep small.">
        <TierCompare />
      </Section>

      <Section id="sizes" title="36 or 44" note="The same four places in the app, at both heights. Tap or click around: the point is how it feels, how crowded the rows get, and where things wrap.">
        <SizeCompare />
      </Section>

      <Section id="fields" title="Fields" note="Text fields are pills in two sizes. A segmented control and a switch cover the choices that are not text.">
        <div className="grid max-w-[640px] gap-6">
          <div>
            <Label>field md</Label>
            <input className={STD_FIELD.md} placeholder="Note (optional)" />
          </div>
          <div>
            <Label>field lg, for sign in and the big forms</Label>
            <input className={STD_FIELD.lg} placeholder="Email" />
          </div>
          <div>
            <Label>select</Label>
            <select className={STD_FIELD.md} defaultValue="Type">
              <option>Type</option>
              <option>Mana value</option>
            </select>
          </div>
          <div>
            <Label>segmented control</Label>
            <div role="group" className="inline-flex rounded-full border border-line p-1">
              {["List", "Stacks", "Gallery"].map((name) => (
                <button key={name} type="button" aria-pressed={segment === name} onClick={() => setSegment(name)} className={`min-h-9 rounded-full px-4 text-sm transition-colors [@media(pointer:coarse)]:min-h-11 ${segment === name ? "bg-ink text-bg" : "text-muted hover:text-ink"}`}>
                  {name}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>switch</Label>
            <button type="button" role="switch" aria-checked={toggle} aria-label="Check collection" onClick={() => setToggle((v) => !v)} className={`relative h-7 w-12 rounded-full border transition-colors ${toggle ? "border-accent-text bg-accent" : "border-line bg-surface"}`}>
              <span className={`absolute top-0.5 size-5 rounded-full bg-ink transition-transform ${toggle ? "translate-x-[22px]" : "translate-x-0.5"}`} />
            </button>
          </div>
          <div>
            <Label>colour swatches</Label>
            <div className="flex gap-2">
              {["#38d6ff", "#9b6bff", "#ff4fd8", "#3dff8a", "#ffb02e"].map((c) => (
                <button key={c} type="button" aria-label={c} onClick={() => setSwatch(c)} className="flex size-11 items-center justify-center rounded-full transition-transform hover:scale-110">
                  <span className="flex size-7 items-center justify-center rounded-full" style={{ background: c, boxShadow: swatch === c ? `0 0 0 2px var(--bg), 0 0 0 4px ${c}` : "none" }}>
                    {swatch === c && <Check size={14} weight="bold" aria-hidden className="text-black" />}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </Section>

      <Section id="tags" title="Labels" note="Small and never clickable: a fact, a status, a count.">
        <div className="flex flex-wrap items-center gap-3">
          <span className={STD_TAG.plain}>Commander</span>
          <span className={STD_TAG.accent}>open</span>
          <span className={STD_TAG.add}>+3 added</span>
          <span className={STD_TAG.danger}>2 issues</span>
          <span className={STD_TAG.count}>12</span>
        </div>
      </Section>

      <Section id="surfaces" title="Surfaces" note="The containers the controls sit in.">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-card border border-line bg-surface p-6">
            <p className="text-lg font-medium">Panel</p>
            <p className="mt-1 text-sm text-muted">rounded-card, hairline border, surface fill. The Versions panel, deck tiles, settings sections.</p>
          </div>
          <div className="rounded-card bg-accent p-6 text-on-accent">
            <p className="text-lg font-medium">Accent panel</p>
            <p className="mt-1 text-sm">Used once per page for a call to action.</p>
          </div>
          <div className="w-[300px] rounded-2xl border border-line bg-bg p-1.5 shadow-[0_18px_40px_rgba(0,0,0,0.45)]">
            {["Rename", "Merge into main", "Compare with main"].map((x) => (
              <button key={x} type="button" className="flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm transition-colors hover:bg-surface">
                {x}
              </button>
            ))}
            <button type="button" className="flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm text-danger transition-colors hover:bg-surface">Delete branch</button>
          </div>
          <div className="space-y-3">
            <p role="alert" className="rounded-2xl border border-danger-line bg-danger/10 px-4 py-3 text-sm">Something went wrong, and here is what to do.</p>
            <p role="status" className="inline-flex rounded-full border border-line bg-bg px-5 py-3 text-sm shadow-2xl">Branch deleted</p>
          </div>
        </div>
      </Section>

      <Section id="found" title="Every variant in the code" note="Each row is a real class string from the source, drawn as it is today, with how often it is used and where. Rows used once are the likeliest to be mistakes.">
        <div className="mb-6 flex flex-wrap items-center gap-2">
          {["all", ...KINDS].map((k) => (
            <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={`min-h-9 rounded-full border px-4 text-[13px] transition-colors ${kind === k ? "border-accent-text text-accent-text" : "border-line text-muted hover:border-ink hover:text-ink"}`}>
              {k}
              {k !== "all" && <span className="ml-2 font-mono text-xs">{stats.kinds.get(k)?.variants ?? 0}</span>}
            </button>
          ))}
          <button type="button" onClick={() => setSort((s) => (s === "count" ? "kind" : "count"))} className={`${btn.quiet} ml-auto !min-h-9 text-[13px]`}>
            Sorted by {sort === "count" ? "use" : "kind"}
          </button>
        </div>
        {kind !== "all" && <p className="mb-4 text-sm text-muted">{HINT[kind]}</p>}
        <ul className="divide-y divide-line border-y border-line">
          {shown.map((v) => (
            <li key={v.classes} className="grid items-center gap-4 py-4 md:grid-cols-[minmax(220px,300px)_80px_1fr]">
              <div className="flex min-h-14 items-center">
                <Sample v={v} />
              </div>
              <p className="font-mono text-sm text-muted">
                <span className={v.count === 1 ? "text-danger" : "text-ink"}>{v.count}</span> {v.count === 1 ? "use" : "uses"}
              </p>
              <div className="min-w-0">
                <p className="mb-1 flex flex-wrap gap-x-3 font-mono text-xs text-muted">
                  <span>{v.kind}</span>
                  {v.height && <span>{v.height}</span>}
                  {v.padding && <span>{v.padding}</span>}
                  {v.text && <span>{v.text}</span>}
                </p>
                <p className="font-mono text-xs break-words text-muted/80">{v.classes}</p>
                <p className="mt-1 font-mono text-xs text-muted/60">{v.files.slice(0, 3).join("  ·  ")}{v.files.length > 3 ? `  +${v.files.length - 3}` : ""}</p>
              </div>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
