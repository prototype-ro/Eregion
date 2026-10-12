"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { ManaCost } from "@/components/Mana";
import { btn, field } from "@/lib/ui";
import { SquareField } from "./SquareField";
import { ConstellationBar } from "./ConstellationBar";
import { DitherBar } from "./DitherBar";
import { CARD_NAMES, COMMANDERS, MANA, nameFor, ROLES, type Role } from "./mock";

const STYLE = `
  .concepts { --rl: 0.74; --rc: 0.15; }
  :root[data-theme="light"] .concepts { --rl: 0.52; --rc: 0.16; }
  @media (prefers-color-scheme: light) { :root:not([data-theme="dark"]) .concepts { --rl: 0.52; --rc: 0.16; } }
  @keyframes concept-rise { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
  .concept-rise { animation: concept-rise 0.6s cubic-bezier(0.16, 1, 0.3, 1) both; }
  @media (prefers-reduced-motion: reduce) { .concept-rise { animation: none; } }
`;

const roleColor = (hue: number, plain?: boolean) => (plain ? "oklch(0.58 0.02 250)" : `oklch(var(--rl) var(--rc) ${hue})`);

// ---------------------------------------------------------------------------------------------------------------------------
// Shared pieces

function Section({ id, title, children, intro }: { id: string; title: string; intro: string; children: ReactNode }) {
  return (
    <section id={id} className="border-t border-line py-12">
      <h2 className="text-[28px] font-medium">{title}</h2>
      <p className="mt-2 mb-8 max-w-[70ch] text-muted">{intro}</p>
      <div className="flex flex-col gap-14">{children}</div>
    </section>
  );
}

function Option({ letter, name, bullets, children }: { letter: string; name: string; bullets: string[]; children: ReactNode }) {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
      <div>
        <p className="font-mono text-xs text-muted">Option {letter}</p>
        <h3 className="mt-1 text-xl font-medium">{name}</h3>
        <ul className="mt-3 flex flex-col gap-2 text-sm text-muted">
          {bullets.map((bullet) => (
            <li key={bullet} className="leading-snug">
              {bullet}
            </li>
          ))}
        </ul>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function ViewSwitch({ small }: { small?: boolean }) {
  const [view, setView] = useState(0);
  return (
    <div role="group" aria-label="View" className="relative grid shrink-0 grid-cols-3 rounded-full border border-line p-0.5">
      <span
        aria-hidden="true"
        className="absolute inset-y-0.5 left-0.5 w-[calc((100%-0.25rem)/3)] rounded-full bg-ink transition-transform duration-300 ease-[cubic-bezier(0.34,1.35,0.64,1)] motion-reduce:transition-none"
        style={{ transform: `translateX(${view * 100}%)` }}
      />
      {["List", "Stacks", "Gallery"].map((name, index) => (
        <button
          key={name}
          type="button"
          aria-pressed={view === index}
          onClick={() => setView(index)}
          className={`relative rounded-full px-3 transition-colors ${small ? "min-h-7 text-xs" : "min-h-8 text-[13px]"} ${view === index ? "text-bg" : "text-muted hover:text-ink"}`}
        >
          {name}
        </button>
      ))}
    </div>
  );
}

function SearchPill({ className = "" }: { className?: string }) {
  return (
    <div className={`flex min-h-9 items-center gap-2 rounded-full border border-line bg-surface px-4 text-[13px] text-muted ${className}`}>
      <span className="truncate">Search by card name</span>
      <kbd className="ml-auto rounded border border-line px-1.5 font-mono text-[11px]">/</kbd>
    </div>
  );
}

/** A scrolling window that stands in for the page, so behavior on scroll can be tried right here. */
function Frame({ frameRef, children, height = 560 }: { frameRef?: RefObject<HTMLDivElement | null>; children: ReactNode; height?: number }) {
  return (
    <div ref={frameRef} className="relative overflow-y-auto overflow-x-hidden rounded-[28px] border border-line bg-bg" style={{ height }}>
      {children}
    </div>
  );
}

function Hero({ small }: { small?: boolean }) {
  return (
    <div className="relative px-6 pt-8 pb-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/art/nobg-knight.png" alt="" className="pointer-events-none absolute top-0 left-[38%] h-[300px] w-auto max-w-none opacity-60 select-none" />
      <div className="relative">
        <span className="glass inline-flex rounded-full px-3.5 py-1 text-[13px]">Version 12</span>
        <h4 className={`mt-3 font-display leading-[0.95] ${small ? "text-5xl" : "text-6xl"}`}>Edgar&rsquo;s Blood Court</h4>
        <p className="mt-2 text-[13px] text-muted">Commander | Legal | main &middot; Size 100 &middot; $742.06</p>
      </div>
      <div className="relative mt-6 rounded-[28px] border border-line bg-surface/70 px-6 py-5">
        <p className="text-sm">Versions</p>
        <div className="mt-4 flex items-center gap-10">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div key={n} className="flex flex-col items-center gap-1.5">
              <span className={`size-3 rounded-full border-2 ${n === 6 ? "border-accent-text bg-accent-text" : "border-ink bg-bg"}`} />
              <span className="font-mono text-[10px] text-muted">v{n}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Rows({ count = 54 }: { count?: number }) {
  return (
    <ul className="grid gap-x-8 px-6 pb-10 sm:grid-cols-2 xl:grid-cols-3">
      {CARD_NAMES.slice(0, count).map((name, index) => (
        <li key={name + index} className="flex items-center gap-3 border-b border-line py-2 text-[14px]">
          <span className="w-4 text-right font-mono text-xs text-muted">1</span>
          <span className="min-w-0 flex-1 truncate">{name}</span>
          <span className="inline-flex size-7 items-center justify-center rounded-full border border-line text-muted">
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------
// 1. The command bar

function BarA() {
  const frame = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    if (!sentinel.current) return;
    const observer = new IntersectionObserver(([entry]) => setStuck(!entry.isIntersecting), { root: frame.current, threshold: 0 });
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, []);
  return (
    <Frame frameRef={frame}>
      <div className="sticky top-0 z-20 h-0">
        <div
          className={`glass mx-4 mt-3 flex items-center gap-3 rounded-full py-1.5 pr-1.5 pl-5 transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${stuck ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-3 opacity-0"}`}
        >
          <span className="max-w-[170px] truncate text-sm font-medium">Edgar&rsquo;s Blood Court</span>
          <span className="rounded-full border border-line px-2 py-px font-mono text-[11px] text-muted">v12</span>
          <SearchPill className="min-w-0 flex-1 bg-transparent" />
          <ViewSwitch small />
          <button type="button" className={`${btn.primary} min-h-8!`}>
            Save
          </button>
        </div>
      </div>
      <Hero />
      <div ref={sentinel} className="h-px" />
      <div className="flex items-center justify-between gap-4 border-b border-line px-6 py-3 text-sm">
        <span>Mainboard 100</span>
        <ViewSwitch />
      </div>
      <Rows />
    </Frame>
  );
}

function BarB() {
  return (
    <Frame>
      <Hero small />
      <div className="border-b border-line px-6 py-3 text-sm">Mainboard 100</div>
      <Rows />
      <div className="sticky bottom-4 z-20 mx-auto -mt-16 w-fit max-w-[calc(100%-24px)]">
        <div className="glass flex items-center gap-2 rounded-full p-1.5 pl-3">
          <SearchPill className="w-48 border-transparent bg-transparent" />
          <span className="h-5 w-px bg-line" />
          <ViewSwitch small />
          <span className="h-5 w-px bg-line" />
          <button type="button" className="hidden min-h-8 items-center gap-2 rounded-full px-3 text-xs text-muted hover:text-ink sm:inline-flex">
            Maybe <b className="font-mono font-normal text-ink">3</b> · Considering <b className="font-mono font-normal text-ink">0</b> · Tokens <b className="font-mono font-normal text-ink">1</b>
          </button>
          <button type="button" className={`${btn.primary} min-h-8!`}>
            Save
          </button>
        </div>
      </div>
    </Frame>
  );
}

function BarC() {
  const [open, setOpen] = useState(false);
  return (
    <Frame>
      <div className="sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur">
        <div className="flex items-center gap-3 px-4 py-2">
          <span className="max-w-[160px] truncate text-sm font-medium">Edgar&rsquo;s Blood Court</span>
          <SearchPill className="min-w-0 flex-1" />
          <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className={`${btn.secondary} min-h-8!`}>
            Display
          </button>
          <ViewSwitch small />
          <button type="button" className={`${btn.primary} min-h-8!`}>
            Save
          </button>
        </div>
        {open && (
          <div className="concept-rise absolute right-4 mt-1 flex w-72 flex-col gap-3 rounded-2xl border border-line bg-bg p-4 text-sm shadow-2xl">
            <label className="flex items-center justify-between gap-3">
              Group by
              <select className={`${field.md} w-36!`} defaultValue="Role">
                <option>Type</option>
                <option>Role</option>
                <option>Color</option>
              </select>
            </label>
            <label className="flex items-center justify-between gap-3">
              Sort by
              <select className={`${field.md} w-36!`} defaultValue="Name">
                <option>Name</option>
                <option>Mana value</option>
              </select>
            </label>
            <label className="flex items-center justify-between gap-3">
              Card size
              <input type="range" className="w-36 accent-[var(--accent-text)]" />
            </label>
            <label className="flex items-center justify-between gap-3">
              Check collection
              <input type="checkbox" className="size-5 accent-[var(--accent-text)]" />
            </label>
          </div>
        )}
      </div>
      <Hero small />
      <Rows />
    </Frame>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------
// 2. The composition bar

const TOTAL = ROLES.reduce((sum, role) => sum + role.count, 0);

function Legend({ active, onActive }: { active: Role | null; onActive: (role: Role | null) => void }) {
  return (
    <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[13px]">
      {ROLES.map((role) => (
        <li key={role.name}>
          <button
            type="button"
            onMouseEnter={() => onActive(role.name)}
            onMouseLeave={() => onActive(null)}
            onFocus={() => onActive(role.name)}
            onBlur={() => onActive(null)}
            className={`flex items-center gap-2 transition-opacity ${active && active !== role.name ? "opacity-35" : ""}`}
          >
            <span className="size-2.5 rounded-full" style={{ background: roleColor(role.hue, "plain" in role && role.plain) }} />
            {role.name}
            <span className="font-mono text-xs text-muted">{role.count}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function CompositionPanel({ children }: { children: ReactNode }) {
  return <div className="dotted rounded-[28px] border border-line bg-surface/60 p-6">{children}</div>;
}

function StrandBar() {
  const [active, setActive] = useState<Role | null>(null);
  return (
    <CompositionPanel>
      <div className="flex h-3.5 gap-[3px]" role="img" aria-label="How the deck divides by role">
        {ROLES.map((role) => {
          const color = roleColor(role.hue, "plain" in role && role.plain);
          const dim = active && active !== role.name;
          return (
            <button
              key={role.name}
              type="button"
              aria-label={`${role.name}, ${role.count} cards`}
              onMouseEnter={() => setActive(role.name)}
              onMouseLeave={() => setActive(null)}
              className="rounded-full transition-[opacity,transform] duration-200"
              style={{
                flexGrow: role.count,
                background: `linear-gradient(180deg, color-mix(in oklch, ${color} 100%, white 30%), ${color})`,
                boxShadow: dim ? "none" : `0 0 16px -2px ${color}`,
                opacity: dim ? 0.25 : 1,
                transform: active === role.name ? "scaleY(1.5)" : "none",
              }}
            />
          );
        })}
      </div>
      <Legend active={active} onActive={setActive} />
    </CompositionPanel>
  );
}

function ChipBar() {
  const [active, setActive] = useState<Role | null>(null);
  return (
    <CompositionPanel>
      <div className="flex flex-wrap gap-2">
        {ROLES.map((role) => {
          const color = roleColor(role.hue, "plain" in role && role.plain);
          return (
            <button
              key={role.name}
              type="button"
              onMouseEnter={() => setActive(role.name)}
              onMouseLeave={() => setActive(null)}
              className={`flex min-h-9 items-center gap-2 rounded-full border px-3.5 text-[13px] transition-[opacity,border-color] ${active && active !== role.name ? "opacity-35" : ""}`}
              style={{ flexGrow: role.count, minWidth: 96, borderColor: active === role.name ? color : "var(--line)" }}
            >
              <span className="h-4 w-1 rounded-full" style={{ background: color }} />
              {role.name}
              <span className="ml-auto font-mono text-xs text-muted">{role.count}</span>
            </button>
          );
        })}
      </div>
    </CompositionPanel>
  );
}

function DotMatrix() {
  const [active, setActive] = useState<Role | null>(null);
  const dots = useMemo(() => {
    const list: Array<{ role: Role; hue: number; plain: boolean }> = [];
    ROLES.forEach((role) => {
      for (let i = 0; i < role.count; i++) list.push({ role: role.name, hue: role.hue, plain: "plain" in role && !!role.plain });
    });
    return list.slice(0, 100);
  }, []);
  return (
    <CompositionPanel>
      <div className="grid items-center gap-8 md:grid-cols-[auto_minmax(0,1fr)]">
        <div className="grid grid-cols-10 gap-2.5" role="img" aria-label="One dot for each of the hundred cards, colored by role">
          {dots.map((dot, index) => {
            const color = roleColor(dot.hue, dot.plain);
            const on = !active || active === dot.role;
            return (
              <span
                key={index}
                title={dot.role}
                className="size-3.5 rounded-full transition-[opacity,transform] duration-200"
                style={{ background: color, opacity: on ? 1 : 0.14, transform: active === dot.role ? "scale(1.35)" : "none", boxShadow: on && active ? `0 0 12px ${color}` : "none" }}
              />
            );
          })}
        </div>
        <div>
          <p className="text-sm text-muted">Each dot is a card. Hover a role to light its cards, the way a strand lights the grid.</p>
          <Legend active={active} onActive={setActive} />
        </div>
      </div>
    </CompositionPanel>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------
// 3. The atmosphere

const POSITIONS = ["-6% -35%", "26% -48%", "58% -40%", "88% -44%", "46% -22%"];

function colorsOf(identity: string): string[] {
  return identity.split("").map((letter) => MANA[letter]?.color).filter(Boolean) as string[];
}

function IdentityPicker({ identity, onChange }: { identity: string; onChange: (next: string) => void }) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-3">
      <div className="flex gap-1.5" role="group" aria-label="Color identity">
        {"WUBRG".split("").map((letter) => {
          const on = identity.includes(letter);
          return (
            <button
              key={letter}
              type="button"
              aria-pressed={on}
              aria-label={MANA[letter].name}
              onClick={() => onChange("WUBRG".split("").filter((l) => (l === letter ? !on : identity.includes(l))).join(""))}
              className={`inline-flex size-9 items-center justify-center rounded-full border text-lg transition-colors ${on ? "border-accent-text bg-surface-2" : "border-line opacity-60"}`}
            >
              <ManaCost cost={`{${letter}}`} />
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {COMMANDERS.map((commander) => (
          <button key={commander.name} type="button" onClick={() => onChange(commander.id)} className={`${btn.quiet} min-h-8! text-xs!`}>
            {commander.name}
          </button>
        ))}
      </div>
      <span className="font-mono text-xs text-muted">{nameFor(identity)}</span>
    </div>
  );
}

function StageTitle() {
  return (
    <div className="relative px-8 pt-10 pb-8">
      <span className="glass inline-flex rounded-full px-3.5 py-1 text-[13px]">Version 12</span>
      <h4 className="mt-3 font-display text-6xl leading-[0.95]">Edgar&rsquo;s Blood Court</h4>
      <p className="mt-2 text-[13px] text-muted">Commander | Legal | main</p>
    </div>
  );
}

function Aurora({ identity }: { identity: string }) {
  const colors = colorsOf(identity);
  return (
    <div className="relative h-[300px] overflow-hidden rounded-[28px] border border-line bg-bg">
      {"WUBRG".split("").map((letter, index) => {
        const on = identity.includes(letter);
        const [x, y] = POSITIONS[index].split(" ");
        return (
          <span
            key={letter}
            aria-hidden="true"
            className="pointer-events-none absolute size-[380px] rounded-full blur-3xl transition-opacity duration-700"
            style={{ left: x, top: y, background: MANA[letter].color, opacity: on ? 0.34 : 0 }}
          />
        );
      })}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/art/nobg-knight.png" alt="" className="pointer-events-none absolute top-0 left-[44%] h-[320px] w-auto max-w-none opacity-70 select-none" />
      <StageTitle />
      {colors.length === 0 && <p className="absolute right-6 bottom-4 text-xs text-muted">Colorless: no tint, the page stays neutral.</p>}
    </div>
  );
}

function Rim({ identity }: { identity: string }) {
  const colors = colorsOf(identity);
  const ring = colors.length ? `conic-gradient(from 200deg, ${[...colors, colors[0]].join(", ")})` : "var(--line)";
  return (
    <div className="rounded-[29px] p-[1.5px] transition-[background] duration-500" style={{ background: ring }}>
      <div className="relative h-[300px] overflow-hidden rounded-[28px] bg-bg">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 transition-opacity duration-700"
          style={{ background: colors.length ? `radial-gradient(120% 90% at 50% 120%, color-mix(in oklch, ${colors[0]} 24%, transparent), transparent 60%)` : "none" }}
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/art/nobg-knight.png" alt="" className="pointer-events-none absolute top-0 left-[44%] h-[320px] w-auto max-w-none opacity-70 select-none" />
        <StageTitle />
      </div>
    </div>
  );
}

function Duotone({ identity }: { identity: string }) {
  const colors = colorsOf(identity);
  const gradient = colors.length ? `linear-gradient(120deg, ${colors.length === 1 ? `${colors[0]}, ${colors[0]}` : colors.join(", ")})` : "linear-gradient(120deg, #888, #888)";
  return (
    <div className="relative h-[300px] overflow-hidden rounded-[28px] border border-line bg-bg">
      <div className="pointer-events-none absolute top-0 left-[44%] h-[320px] w-[260px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/art/nobg-knight.png" alt="" className="absolute inset-0 h-full w-auto max-w-none opacity-80 grayscale" />
        <span
          aria-hidden="true"
          className="absolute inset-0 transition-opacity duration-700"
          style={{
            background: gradient,
            mixBlendMode: "color",
            opacity: colors.length ? 0.95 : 0,
            WebkitMaskImage: "url(/art/nobg-knight.png)",
            maskImage: "url(/art/nobg-knight.png)",
            WebkitMaskSize: "auto 100%",
            maskSize: "auto 100%",
            WebkitMaskRepeat: "no-repeat",
            maskRepeat: "no-repeat",
          }}
        />
      </div>
      <StageTitle />
    </div>
  );
}

function EmptyReveal() {
  const [picked, setPicked] = useState<(typeof COMMANDERS)[number] | null>(null);
  const colors = colorsOf(picked?.id ?? "");
  return (
    <div className="relative h-[380px] overflow-hidden rounded-[28px] border border-line bg-bg">
      {"WUBRG".split("").map((letter, index) => {
        const on = picked?.id.includes(letter) ?? false;
        const [x, y] = POSITIONS[index].split(" ");
        return (
          <span
            key={letter}
            aria-hidden="true"
            className="pointer-events-none absolute size-[420px] rounded-full blur-3xl transition-opacity duration-[900ms]"
            style={{ left: x, top: y, background: MANA[letter].color, opacity: on ? 0.36 : 0 }}
          />
        );
      })}
      {!picked && (
        <div className="relative flex h-full flex-col items-center justify-center gap-5 px-6 text-center">
          <p className="font-display text-5xl">Choose your commander</p>
          <p className="max-w-[44ch] text-sm text-muted">The page takes on its colors, and the roles, suggestions and legality all start from it.</p>
          <SearchPill className="w-full max-w-md" />
          <div className="flex flex-wrap justify-center gap-2">
            {COMMANDERS.slice(0, 5).map((commander) => (
              <button key={commander.name} type="button" onClick={() => setPicked(commander)} className={btn.secondary}>
                {commander.name}
              </button>
            ))}
          </div>
        </div>
      )}
      {picked && (
        <div className="relative h-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/art/nobg-knight.png" alt="" className="concept-rise pointer-events-none absolute top-6 left-[46%] h-[340px] w-auto max-w-none opacity-70 select-none" />
          <div className="px-8 pt-10">
            <p className="concept-rise font-mono text-xs text-muted" style={{ animationDelay: "120ms" }}>
              {nameFor(picked.id)}
            </p>
            <h4 className="concept-rise mt-2 font-display text-6xl leading-[0.95]" style={{ animationDelay: "220ms" }}>
              {picked.name}
            </h4>
            <div className="concept-rise mt-5 flex gap-2" style={{ animationDelay: "380ms" }}>
              {colors.map((color, index) => (
                <span key={index} className="size-3 rounded-full" style={{ background: color, boxShadow: `0 0 14px ${color}` }} />
              ))}
            </div>
            <button type="button" onClick={() => setPicked(null)} className={`${btn.quiet} concept-rise mt-8`} style={{ animationDelay: "520ms" }}>
              Choose another
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------

export function Concepts() {
  const [identity, setIdentity] = useState("WBR");
  return (
    <div className="concepts shell pb-32">
      <style>{STYLE}</style>
      <header className="pt-12 pb-8">
        <p className="font-mono text-xs text-muted">Development only</p>
        <h1 className="mt-2 font-display text-[clamp(52px,8vw,104px)] leading-[0.92]">Deck concepts</h1>
        <p className="mt-4 max-w-[68ch] text-lg text-muted">
          Three ideas for the deck page, each with three ways to do it. Everything on this page is made-up data in the real tokens, so it is judged in dark and light with the theme toggle. Scroll inside the windows and hover the roles and the dots.
        </p>
        <nav className="mt-6 flex flex-wrap gap-2 text-sm">
          {[["bar", "1. The command bar"], ["composition", "2. The composition bar"], ["atmosphere", "3. The atmosphere"]].map(([id, text]) => (
            <a key={id} href={`#${id}`} className="inline-flex min-h-9 items-center rounded-full px-4 text-muted transition-colors hover:bg-surface hover:text-ink">
              {text}
            </a>
          ))}
        </nav>
      </header>

      <Section id="bar" title="1. The command bar" intro="Today the title, the Versions panel, the toolbar and the search use 860 of a 900px window before the first card. These options fold the controls into one glass bar so the cards get the screen. Scroll inside each window.">
        <Option letter="A" name="A bar that appears on scroll" bullets={["The hero stays rich at the top.", "Past it, one glass bar holds name, search, view and Save.", "The loudest change, and the closest to how the Versions panel uses glass."]}>
          <BarA />
        </Option>
        <Option letter="B" name="A dock at the bottom" bullets={["Always visible, nothing at the top changes.", "Search, view, the other boards and Save live in one pill.", "Reachable by thumb on a phone, and a natural home for the other boards."]}>
          <BarB />
        </Option>
        <Option letter="C" name="A slim top bar with a Display menu" bullets={["Quietest option, matte instead of glass.", "Group, sort, size and collection move into one Display menu.", "Fewest visible controls, one more click for the rare ones."]}>
          <BarC />
        </Option>
      </Section>

      <Section id="composition" title="2. The composition bar" intro="The deck's own signature, the way strands are the timeline's. It shows how the hundred cards divide by role, and a role can be hovered to light its cards. Hover the bars, chips and dots.">
        <Option letter="A" name="The strand bar" bullets={["One luminous bar, segments sized by count.", "The closest to the timeline: a glowing line on the dot grid.", "Reads at a glance, takes almost no height."]}>
          <StrandBar />
        </Option>
        <Option letter="B" name="Proportional chips" bullets={["Pills sized by count, with name and number.", "The most readable, and the most like a normal filter row.", "Least expressive."]}>
          <ChipBar />
        </Option>
        <Option letter="C" name="A hundred dots" bullets={["One dot per card on the same dot grid as the timeline.", "Hover a role and its cards light up.", "The most striking, and the one that says the deck is a hundred cards."]}>
          <DotMatrix />
        </Option>
        <Option letter="D" name="Neo-swiss dither" bullets={["The hundred cards as hard square pixels, dithered and glowing.", "Roles are runs of columns with a mono index table; hover a run or a row.", "Always a dark screen, even in light theme. The most poster-like of the four."]}>
          <DitherBar />
        </Option>
        <Option letter="E" name="Halftone constellation" bullets={["One cluster per role, one dot per card; dot size follows a soft field like the halftone posters.", "Hairline traces and a fine grid tie the clusters together, with a scanline screen over it.", "Dots breathe slowly and the pointer sends a ripple; hover a cluster to isolate it. Dark screen in both themes."]}>
          <ConstellationBar />
        </Option>
        <Option letter="F" name="Halftone square, regroupable" bullets={["The same halftone, packed into a square.", "Group the hundred cards by role, mana value, type or color; every dot glides to its new cluster and keeps its role color.", "Hover a cluster to isolate it. Dark screen in both themes."]}>
          <SquareField />
        </Option>
      </Section>

      <Section id="atmosphere" title="3. The atmosphere" intro="The strand color comes from the commander's art. The same idea for the whole page: the commander's color identity tints the header. Try the five colors and the preset commanders, including colorless.">
        <IdentityPicker identity={identity} onChange={setIdentity} />
        <Option letter="A" name="Aurora wash" bullets={["Soft colored light behind the header.", "Colors blend, so Grixis feels different from Mardu.", "Fades in and out with the identity."]}>
          <Aurora identity={identity} />
        </Option>
        <Option letter="B" name="Rim light" bullets={["A thin colored edge around the hero, with a glow from below.", "More contained, more like the glass pills.", "The least likely to fight with the art."]}>
          <Rim identity={identity} />
        </Option>
        <Option letter="C" name="Duotone art" bullets={["The commander cutout takes the colors of its identity.", "Strongest personality, and the art is the star.", "Needs the real art library to judge properly."]}>
          <Duotone identity={identity} />
        </Option>
        <Option letter="D" name="The empty deck becomes a moment" bullets={["Instead of 'Nothing here yet', a prompt to choose the commander.", "Picking one tints the page and brings the title in.", "Try it: choose a commander, then 'Choose another'."]}>
          <EmptyReveal />
        </Option>
      </Section>
    </div>
  );
}
