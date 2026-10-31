"use client";

import { ManaCost } from "@/components/Mana";
import { useEffect, useMemo, useRef, useState } from "react";
import { ROLE_HUES } from "../deck-list/mock";
import { buildHistory, type ScrubCard } from "./mock";

const STORE = "eregion-dev-time-scrub";
const TYPE_ORDER = ["Commander", "Creature", "Instant", "Sorcery", "Artifact", "Enchantment", "Land"];
const CURVE = 7;
const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high);

interface Settings {
  /** How a card that is not in the deck at the playhead is drawn. */
  absent: "etched" | "hidden";
  /** A reference version to compare against, or 0 for none. */
  ghost: number;
  /** What the band under the rail shows over time. */
  ribbon: "none" | "count" | "curve";
  /** Milliseconds between versions while playing. */
  speed: number;
  /** Whether each node shows its version number. */
  labels: boolean;
  /** Whether a row carries its role colour. */
  tint: boolean;
}

const CURRENT: Settings = { absent: "etched", ghost: 0, ribbon: "count", speed: 900, labels: true, tint: true };

const PRESETS: Array<[string, Settings]> = [
  ["Etched history", CURRENT],
  ["Clean (hide absent)", { ...CURRENT, absent: "hidden", ribbon: "none" }],
  ["Compare to v1", { ...CURRENT, ghost: 1 }],
  ["Curve focus", { ...CURRENT, ribbon: "curve", tint: false, labels: false }],
];

const STYLE = `
  .scrub-lab { --rl: 0.74; --rc: 0.15; }
  :root[data-theme="light"] .scrub-lab { --rl: 0.52; --rc: 0.16; }
  @media (prefers-color-scheme: light) { :root:not([data-theme="dark"]) .scrub-lab { --rl: 0.52; --rc: 0.16; } }
`;

const roleColor = (role: string) => (role === "Land" ? "oklch(0.58 0.02 250)" : `oklch(var(--rl) var(--rc) ${ROLE_HUES[role] ?? 250})`);

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
    <label className="grid grid-cols-[84px_1fr_56px] items-center gap-2 text-xs">
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

interface Stats {
  total: number;
  price: number;
  avgMv: number;
  lands: number;
  curve: number[];
  roles: Record<string, number>;
}

function statsOf(present: Set<string>, cards: Map<string, ScrubCard>): Stats {
  let total = 0;
  let price = 0;
  let nonLand = 0;
  let manaValue = 0;
  let lands = 0;
  const curve = new Array<number>(CURVE).fill(0);
  const roles: Record<string, number> = {};
  for (const name of present) {
    const card = cards.get(name);
    if (!card) continue;
    total += 1;
    price += card.price;
    if (card.type === "Land") {
      lands += 1;
      continue;
    }
    nonLand += 1;
    manaValue += card.cmc;
    curve[Math.min(card.cmc, CURVE - 1)] += 1;
    roles[card.role] = (roles[card.role] ?? 0) + 1;
  }
  return { total, price, avgMv: nonLand === 0 ? 0 : manaValue / nonLand, lands, curve, roles };
}

type Status = "kept" | "added" | "removed" | "absent";

const STATUS_CLASS: Record<Status, string> = {
  kept: "text-ink",
  added: "text-add-text",
  removed: "text-danger",
  absent: "text-muted",
};

function Row({ card, status, hidden, tint }: { card: ScrubCard; status: Status; hidden: boolean; tint: boolean }) {
  const absent = status === "absent";
  const collapsed = absent && hidden;
  const color = roleColor(card.role);
  return (
    <li
      className="overflow-hidden transition-[max-height,opacity] duration-300 motion-reduce:transition-none"
      style={{ maxHeight: collapsed ? 0 : 44, opacity: collapsed ? 0 : absent ? 0.34 : 1 }}
      aria-hidden={collapsed || undefined}
    >
      <div
        className="flex items-center gap-2 border-l-2 py-1.5 pr-2 pl-2.5"
        style={{ borderColor: tint ? color : "var(--line)", borderLeftStyle: absent ? "dashed" : "solid" }}
      >
        <span className="min-w-0 flex-1 truncate text-[13px]">
          <span className={`font-medium ${STATUS_CLASS[status]} ${status === "removed" ? "line-through decoration-danger/60" : ""}`}>{card.name}</span>
        </span>
        {status === "added" && (
          <span className="font-mono text-xs text-add-text" aria-label="added since the ghost version">
            +
          </span>
        )}
        {status === "removed" && (
          <span className="font-mono text-xs text-danger" aria-label="removed since the ghost version">
            −
          </span>
        )}
        {card.cost && <ManaCost cost={card.cost} className="shrink-0 text-xs text-muted" />}
        <span className="w-12 shrink-0 text-right font-mono text-[11px] text-muted tabular-nums">${card.price.toFixed(1)}</span>
      </div>
    </li>
  );
}

export function TimeScrubLab() {
  const [s, setS] = useState<Settings>(CURRENT);
  const [version, setVersion] = useState(6);
  const [playing, setPlaying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dragging, setDragging] = useState(false);
  const rail = useRef<HTMLDivElement>(null);

  const history = useMemo(buildHistory, []);
  const max = history.versions.length;
  const stats = useMemo(() => history.versions.map((entry) => statsOf(entry.present, history.cards)), [history]);
  const groups = useMemo(() => TYPE_ORDER.map((type) => ({ type, cards: history.union.filter((card) => card.type === type) })).filter((group) => group.cards.length), [history]);

  const current = stats[version - 1];
  const here = history.versions[version - 1];
  const ghostStats = s.ghost ? stats[s.ghost - 1] : null;

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

  // Play: step through the versions on a timer, wrapping around at the end.
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setVersion((value) => (value >= max ? 1 : value + 1)), Math.max(120, s.speed));
    return () => clearInterval(id);
  }, [playing, s.speed, max]);

  const pos = (n: number) => (max === 1 ? 0 : ((n - 1) / (max - 1)) * 100);

  const pick = (clientX: number) => {
    const element = rail.current;
    if (!element) return;
    const box = element.getBoundingClientRect();
    const t = clamp((clientX - box.left) / box.width, 0, 1);
    setVersion(Math.round(t * (max - 1)) + 1);
    setPlaying(false);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(s, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked.
    }
  };

  const group = (title: string, children: React.ReactNode) => (
    <fieldset className="flex flex-col gap-3 border-t border-line pt-4">
      <legend className="sr-only">{title}</legend>
      <p className="text-[11px] tracking-[0.14em] text-muted uppercase">{title}</p>
      {children}
    </fieldset>
  );

  // The band under the rail: card count as bars, or average mana value as a line.
  const ribbonMax = s.ribbon === "curve" ? Math.max(...stats.map((entry) => entry.avgMv), 1) : Math.max(...stats.map((entry) => entry.total), 1);
  const roles = Object.entries(current.roles).sort((a, b) => b[1] - a[1]);

  return (
    <div className="scrub-lab mx-auto max-w-[1800px] px-5 pb-24 sm:px-8">
      <style>{STYLE}</style>
      <header className="pt-10 pb-6">
        <h1 className="font-display text-[clamp(44px,6vw,84px)] leading-none">Time-scrub lab</h1>
        <p className="mt-3 max-w-[70ch] text-muted">
          The deck as time you can drag through. Every card that ever lived in the deck stays on the page; cards outside the playhead sink to an
          etched ghost. Drag the rail, or press play, and watch the curve and the roles redraw. Set a ghost version to see, live, what a scrub
          would add and remove. All cards are made up.
        </p>
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
            "Playhead",
            <>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setPlaying((value) => !value)} className={`min-h-8 rounded-full border px-3 text-xs transition-colors ${playing ? "border-accent-text text-accent-text" : "border-line text-muted hover:text-ink"}`}>
                  {playing ? "Pause" : "Play"}
                </button>
                <span className="font-mono text-xs text-muted">
                  v{version} / {max}
                </span>
              </div>
              <Slide label="Step to" value={version} min={1} max={max} onChange={(value) => { setPlaying(false); setVersion(value); }} />
              <Slide label="Speed" value={s.speed} min={200} max={2400} step={100} unit="ms" onChange={(value) => set("speed", value)} />
              <Slide label="Ghost v" value={s.ghost} min={0} max={max} onChange={(value) => set("ghost", value === version ? 0 : value)} />
            </>,
          )}
          {group(
            "Cards",
            <>
              <Seg label="Cards off the playhead" value={s.absent} options={[["etched", "Etched"], ["hidden", "Hidden"]]} onChange={(value) => set("absent", value)} />
              <Seg label="Band under the rail" value={s.ribbon} options={[["none", "None"], ["count", "Count"], ["curve", "Curve"]]} onChange={(value) => set("ribbon", value)} />
              <Flag label="Version numbers" value={s.labels} onChange={(value) => set("labels", value)} />
              <Flag label="Role colour on rows" value={s.tint} onChange={(value) => set("tint", value)} />
            </>,
          )}
          <button type="button" onClick={() => void copy()} className="min-h-9 rounded-full border border-line text-xs hover:border-ink">
            {copied ? "Copied" : "Copy these settings"}
          </button>
        </aside>

        <main className="flex min-w-0 flex-col gap-6">
          {/* The rail. */}
          <section className="rounded-[28px] border border-line p-6" aria-label="Version rail">
            <div className="mb-5 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
              <div className="flex items-baseline gap-3">
                <h2 className="font-display text-4xl leading-none">v{version}</h2>
                <p className="text-muted">{here.note}</p>
              </div>
              <p className="font-mono text-xs text-muted">
                {current.total} cards · {current.lands} lands · MV {current.avgMv.toFixed(2)} · ${current.price.toFixed(0)}
                {ghostStats ? <span className="ml-3 text-accent-text">ghost v{s.ghost}</span> : null}
              </p>
            </div>

            <div
              ref={rail}
              role="slider"
              tabIndex={0}
              aria-label="Version playhead"
              aria-valuemin={1}
              aria-valuemax={max}
              aria-valuenow={version}
              onPointerDown={(event) => {
                (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
                setDragging(true);
                pick(event.clientX);
              }}
              onPointerMove={(event) => dragging && pick(event.clientX)}
              onPointerUp={() => setDragging(false)}
              onPointerCancel={() => setDragging(false)}
              onKeyDown={(event) => {
                if (event.key === "ArrowRight") {
                  event.preventDefault();
                  setPlaying(false);
                  setVersion((value) => clamp(value + 1, 1, max));
                } else if (event.key === "ArrowLeft") {
                  event.preventDefault();
                  setPlaying(false);
                  setVersion((value) => clamp(value - 1, 1, max));
                }
              }}
              className="relative h-24 cursor-pointer touch-none select-none rounded-2xl outline-offset-4 focus-visible:outline-2 focus-visible:outline-accent-text"
            >
              <div aria-hidden="true" className="dotted dotted-fade absolute inset-0 rounded-2xl opacity-60" />

              {/* The ribbon band. */}
              {s.ribbon !== "none" && (
                <svg aria-hidden="true" className="absolute inset-x-0 bottom-0 h-12 w-full" viewBox={`0 0 ${Math.max(max - 1, 1)} 100`} preserveAspectRatio="none">
                  {s.ribbon === "count" ? (
                    stats.map((entry, index) => {
                      const height = (entry.total / ribbonMax) * 88;
                      return <rect key={index} x={index + 0.18} y={100 - height} width={0.64} height={height} fill="var(--accent-text)" opacity={index === version - 1 ? 0.5 : 0.16} />;
                    })
                  ) : (
                    <polyline
                      points={stats.map((entry, index) => `${index},${100 - (entry.avgMv / ribbonMax) * 84}`).join(" ")}
                      fill="none"
                      stroke="var(--accent-text)"
                      strokeWidth={0.06}
                      vectorEffect="non-scaling-stroke"
                      opacity={0.5}
                    />
                  )}
                </svg>
              )}

              {/* The track. */}
              <div aria-hidden="true" className="absolute top-1/2 left-0 right-0 h-px -translate-y-1/2 bg-line" />
              <div aria-hidden="true" className="absolute top-1/2 left-0 h-px -translate-y-1/2 bg-accent-text" style={{ width: `${pos(version)}%` }} />

              {/* The played stretch, lit. */}
              <div aria-hidden="true" className="absolute top-1/2 left-0 h-[3px] -translate-y-1/2 rounded-full bg-accent-text/40 blur-[2px]" style={{ width: `${pos(version)}%` }} />

              {/* Nodes. */}
              {history.versions.map((entry) => {
                const left = `${pos(entry.n)}%`;
                const going = entry.n <= version;
                const ghost = entry.n === s.ghost;
                return (
                  <button
                    key={entry.n}
                    type="button"
                    tabIndex={-1}
                    title={`v${entry.n}: ${entry.note}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      setPlaying(false);
                      setVersion(entry.n);
                    }}
                    className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
                    style={{ left }}
                  >
                    <span className={`block rounded-full border-2 transition-all ${entry.n === version ? "size-4 border-[var(--accent-text)] bg-[var(--accent-text)]" : ghost ? "size-3 border-danger bg-bg" : `size-2.5 border-ink bg-bg ${going ? "border-accent-text" : ""}`}`} />
                    {s.labels && <span className={`absolute top-4 left-1/2 -translate-x-1/2 font-mono text-[10px] ${entry.n === version ? "text-ink" : "text-muted"}`}>v{entry.n}</span>}
                  </button>
                );
              })}

              {/* Ghost marker. */}
              {s.ghost > 0 && (
                <div aria-hidden="true" className="absolute top-1/2 h-16 -translate-x-1/2 -translate-y-1/2 border-l border-dashed border-danger" style={{ left: `${pos(s.ghost)}%` }}>
                  <span className="absolute top-0 left-1 font-mono text-[10px] text-danger">ghost</span>
                </div>
              )}

              {/* The playhead. */}
              <div aria-hidden="true" className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: `${pos(version)}%` }}>
                <span className="block size-5 rounded-full border-2 border-[var(--accent-text)] bg-bg shadow-[0_0_18px_var(--accent-text)]" />
                <span className="absolute top-1/2 left-1/2 -z-10 h-16 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--accent-text)] opacity-80" />
              </div>
            </div>
          </section>

          {/* The curve, redrawn for this version. */}
          <section className="grid gap-6 rounded-[28px] border border-line p-6 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" aria-label="Stats at this version">
            <div>
              <h3 className="mb-3 text-[11px] tracking-[0.14em] text-muted uppercase">Mana curve</h3>
              <div className="flex h-24 items-end gap-1.5">
                {current.curve.map((count, index) => {
                  const most = Math.max(...current.curve, 1);
                  return (
                    <div key={index} className="flex flex-1 flex-col items-center gap-1">
                      <div className="flex w-full flex-1 items-end">
                        <div className="w-full rounded-t bg-accent-text/70 transition-[height] duration-300 motion-reduce:transition-none" style={{ height: `${(count / most) * 100}%` }} />
                      </div>
                      <span className="font-mono text-[10px] text-muted">{index === CURVE - 1 ? `${index}+` : index}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div>
              <h3 className="mb-3 text-[11px] tracking-[0.14em] text-muted uppercase">Roles</h3>
              <ul className="flex flex-wrap gap-1.5">
                {roles.map(([role, count]) => (
                  <li key={role} className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs">
                    <span aria-hidden="true" className="size-2 rounded-full" style={{ background: roleColor(role) }} />
                    {role} <span className="font-mono text-muted">{count}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* The deck at the playhead. */}
          <section className="rounded-[28px] border border-line p-6" aria-label={`Deck at v${version}`}>
            <div className="group-columns">
              {groups.map((group) => {
                const present = group.cards.filter((card) => history.presence.get(card.name)?.[version - 1]).length;
                return (
                  <section key={group.type} className="mb-8" aria-label={group.type}>
                    <header className="mb-2 flex items-baseline justify-between border-b border-line pb-1.5">
                      <h3 className="text-[14px] font-medium">{group.type}</h3>
                      <span className="font-mono text-xs text-muted">
                        {present}/{group.cards.length}
                      </span>
                    </header>
                    <ul className="flex flex-col">
                      {group.cards.map((card) => {
                        const presence = history.presence.get(card.name)!;
                        const isPresent = presence[version - 1];
                        const ghostPresent = s.ghost ? presence[s.ghost - 1] : null;
                        let status: Status;
                        if (isPresent && (ghostPresent === null || ghostPresent)) status = "kept";
                        else if (isPresent && ghostPresent === false) status = "added";
                        else if (!isPresent && ghostPresent === true) status = "removed";
                        else status = "absent";
                        return <Row key={card.name} card={card} status={status} hidden={s.absent === "hidden"} tint={s.tint} />;
                      })}
                    </ul>
                  </section>
                );
              })}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
