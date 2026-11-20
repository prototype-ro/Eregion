import { healthWord, stepStrength, turnLabel, turnRange, turnPosition } from "@/lib/analysis";
import type { AnalysisArchenemy, AnalysisHealth, AnalysisWinTurn } from "@/lib/types";
import { COPPER_HOT, INK, MeterRow, Panel } from "./stats/screen";

/** A disclosure toggle in the screens' mono pill style, so it reads as a control. */
const SUMMARY =
  "inline-flex min-h-9 cursor-pointer list-none items-center rounded-full border border-white/15 px-4 font-mono text-[11px] tracking-[0.12em] text-muted uppercase transition-colors hover:text-ink [&::-webkit-details-marker]:hidden [@media(pointer:coarse)]:min-h-11";

/**
 * The five brackets as the win turn bar draws them, slow on the left. Each is a halftone screen whose dots grow with the bracket's
 * speed, and the deck's own bracket is lit, so nothing depends on hue.
 */
const BRACKETS = [
  { n: 1, label: "B1", range: "10+" },
  { n: 2, label: "B2", range: "8 to 10" },
  { n: 3, label: "B3", range: "6 to 8" },
  { n: 4, label: "B4", range: "4 to 6" },
  { n: 5, label: "cEDH", range: "under 4" },
] as const;

const AXIS_TURNS = [10, 8, 6, 4];

/** A CSS halftone: a grid of dots of one size, as a background. */
const halftone = (color: string, radius: number, pitch = 6) => ({
  backgroundImage: `radial-gradient(circle, ${color} ${radius}px, transparent ${radius + 0.6}px)`,
  backgroundSize: `${pitch}px ${pitch}px`,
});

/** Where in its bracket's range the deck's estimated turn falls, in words a player would say. */
export function WinTurnBlock({
  winTurn,
  rulesBracket,
  noFinisher = false,
  simulatedComboTurn = null,
}: {
  winTurn: AnalysisWinTurn;
  rulesBracket: number;
  noFinisher?: boolean;
  /** The simulator's average turn a game-ending combo was ready, to say so when it disagrees with the estimate. */
  simulatedComboTurn?: number | null;
}) {
  const disagrees = simulatedComboTurn !== null && Math.abs(simulatedComboTurn - winTurn.turn) >= 2;
  const position = turnPosition(winTurn.turn);
  // Near either end the label hangs inward from the pin, so it never leaves the panel.
  const labelShift = position < 12 ? "0%" : position > 88 ? "-100%" : "-50%";
  return (
    <Panel
      title="Estimated win turn"
      clip={false}
      right={<p className="text-[clamp(40px,4.4vw,64px)] leading-none font-medium tracking-[-0.05em]">{turnRange(winTurn.turn)}</p>}
      foot={
        <>
          The brackets are turn ranges, and the pin is where this deck lands.{" "}
          {winTurn.basis === "combo" ? "A combo in the deck can be run sooner than the rest of its signals suggest. " : ""}
          {rulesBracket > winTurn.bracket ? `The bracket rules still put it in bracket ${rulesBracket}. ` : ""}
          {noFinisher ? "No combo that ends the game was found, so this reads how fast the deck gets going, not a way to win. " : ""}
          {disagrees && simulatedComboTurn !== null
            ? `The simulated games disagree: they had a game-ending combo ready around turn ${Math.round(simulatedComboTurn)} on average. Read both as rough. `
            : ""}
          It is an estimate from the cards and simulated games of the deck, not a model trained on played games.
        </>
      }
    >
      <div className="relative mt-10 mb-9" role="img" aria-label={`Estimated win turn ${turnLabel(winTurn.turn)}, in the range of bracket ${winTurn.bracket}`}>
        <div className="flex h-11 gap-1 overflow-hidden rounded-full">
          {BRACKETS.map((bracket) => {
            const current = bracket.n === winTurn.bracket;
            const strength = stepStrength(bracket.n - 1, 5);
            return (
              <div
                key={bracket.n}
                className={`relative flex flex-1 items-center justify-center gap-1.5 px-1 text-[13px] whitespace-nowrap ${current ? "text-bg" : "text-ink"}`}
                style={
                  current
                    ? { background: INK }
                    : {
                        ...halftone(`rgba(241,243,255,${0.1 + strength * 0.22})`, 0.8 + strength * 1.4),
                        boxShadow: "inset 0 0 0 1px rgba(241,243,255,0.1)",
                      }
                }
              >
                <span className="font-semibold">{bracket.label}</span>
                <span className={`hidden font-mono text-xs sm:inline ${current ? "" : "text-muted"}`}>{bracket.range}</span>
              </div>
            );
          })}
        </div>
        {/* The pin layer is as wide as the bar, so moving it by a percent of itself moves the pin along the bar with transform alone. */}
        <div
          className="absolute inset-x-0 -top-1.5 h-14 transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
          style={{ transform: `translateX(${position}%)` }}
          aria-hidden="true"
        >
          <span
            className="absolute inset-y-0 left-0 w-0.5 -translate-x-1/2 rounded-full"
            style={{
              background: COPPER_HOT,
              boxShadow: `0 0 8px ${COPPER_HOT}`,
            }}
          />
          <span
            className="absolute -top-8 left-0 inline-flex items-center rounded-full border px-3 py-1 font-mono text-[12px] whitespace-nowrap"
            style={{
              transform: `translateX(${labelShift})`,
              borderColor: COPPER_HOT,
              color: COPPER_HOT,
              background: "var(--bg)",
            }}
          >
            This deck {turnLabel(winTurn.turn)}
          </span>
        </div>
        <div className="absolute inset-x-0 top-[3.25rem] font-mono text-xs text-muted" aria-hidden="true">
          {AXIS_TURNS.map((turn) => (
            <span key={turn} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${turnPosition(turn)}%` }}>
              <span className="hidden sm:inline">turn </span>
              {turn}
            </span>
          ))}
        </div>
      </div>
    </Panel>
  );
}

const RING_DOTS = 48;

/** The health score as a ring of dots: solid up to the score, hollow after it. */
function HealthRing({ score }: { score: number }) {
  const lit = Math.round((score / 100) * RING_DOTS);
  return (
    <svg viewBox="0 0 100 100" className="size-full">
      {Array.from({ length: RING_DOTS }, (_, i) => {
        const a = (i / RING_DOTS) * Math.PI * 2 - Math.PI / 2;
        const x = 50 + 42 * Math.cos(a);
        const y = 50 + 42 * Math.sin(a);
        return i < lit ? (
          <circle key={i} cx={x} cy={y} r={2.4} fill={INK} />
        ) : (
          <circle key={i} cx={x} cy={y} r={1.6} fill="none" stroke="rgba(241,243,255,0.22)" strokeWidth="0.7" />
        );
      })}
    </svg>
  );
}

export function HealthBlock({ health }: { health: AnalysisHealth }) {
  return (
    <Panel title="Deck health" right={<p className="font-mono text-[11px] tracking-[0.12em] text-muted uppercase">{healthWord(health.score)}</p>}>
      <div className="flex items-center gap-7">
        <div className="relative size-[116px] shrink-0" role="img" aria-label={`Deck health ${health.score} out of 100, ${healthWord(health.score)}`}>
          <HealthRing score={health.score} />
          <span className="absolute inset-0 flex items-center justify-center text-[38px] leading-none font-medium tracking-[-0.05em]">{health.score}</span>
        </div>
        <ul className="min-w-0 flex-1">
          {health.pillars.map((pillar) => (
            <MeterRow key={pillar.key} label={pillar.label} value={pillar.score / 100} shown={String(pillar.score)} />
          ))}
        </ul>
      </div>

      <details className="mt-5">
        <summary className={SUMMARY}>Details</summary>
        <div className="mt-4 flex flex-col gap-6">
          {health.pillars.map((pillar) => (
            <div key={pillar.key}>
              <p className="border-b border-line pb-2 font-mono text-[11px] tracking-[0.12em] text-muted uppercase">{pillar.label}</p>
              <ul>
                {pillar.spokes.map((spoke) => (
                  <MeterRow
                    key={spoke.key}
                    label={spoke.label}
                    value={spoke.score / 100}
                    shown={`${spoke.observed}, usual ${spoke.min} to ${spoke.max}`}
                    hint={`${spoke.hint}${spoke.cards.length > 0 ? `. ${spoke.cards.join(", ")}` : ""}`}
                  />
                ))}
              </ul>
            </div>
          ))}
          <p className="text-[13px] text-muted">{health.note}</p>
        </div>
      </details>
    </Panel>
  );
}

export function ArchenemyBlock({ archenemy }: { archenemy: AnalysisArchenemy }) {
  const steps = archenemy.levels.length;
  return (
    <Panel
      title="Archenemy level"
      right={
        <p className="font-mono text-[11px] tracking-[0.12em] text-muted uppercase">
          {archenemy.level + 1} of {steps}
        </p>
      }
      foot="A starting point for the talk before a game, not a verdict."
    >
      <p className="text-[clamp(36px,3.6vw,56px)] leading-none font-medium tracking-[-0.05em]">{archenemy.name}</p>
      <svg
        viewBox={`0 0 ${steps * 24} 24`}
        className="mt-5 block h-6 w-full max-w-[360px]"
        preserveAspectRatio="xMinYMid meet"
        role="img"
        aria-label={`Archenemy level ${archenemy.level + 1} of ${steps}, ${archenemy.name}`}
      >
        {archenemy.levels.map((name, step) => {
          const on = step <= archenemy.level;
          const r = 4 + 6 * stepStrength(step, steps);
          return on ? (
            <circle key={name} cx={step * 24 + 12} cy={12} r={r} fill={step === archenemy.level ? COPPER_HOT : INK} />
          ) : (
            <circle key={name} cx={step * 24 + 12} cy={12} r={r - 0.6} fill="none" stroke="rgba(241,243,255,0.25)" strokeWidth="1" />
          );
        })}
      </svg>
      <div className="mt-2 flex max-w-[360px] justify-between font-mono text-[11px] text-muted">
        <span>{archenemy.levels[0]}</span>
        <span>{archenemy.levels[steps - 1]}</span>
      </div>

      {archenemy.patterns.length === 0 ? (
        <p className="mt-6 text-[14px] text-muted">Nothing in this deck is known for annoying a table.</p>
      ) : (
        <ul className="mt-6 flex flex-col gap-3 text-[14px]">
          {archenemy.patterns.map((pattern) => (
            <li key={pattern.key}>
              <span className="font-semibold">{pattern.label}.</span> <span className="text-muted">{pattern.text}</span>
              {pattern.cards.length > 0 && (
                <details className="mt-0.5 text-[13px]">
                  <summary className="inline-flex min-h-9 cursor-pointer list-none items-center text-accent-text underline underline-offset-4 [&::-webkit-details-marker]:hidden [@media(pointer:coarse)]:min-h-11">
                    {pattern.cards.length === 1 ? "1 card" : `${pattern.cards.length} cards`}
                  </summary>
                  <p className="text-muted">{pattern.cards.join(", ")}</p>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
