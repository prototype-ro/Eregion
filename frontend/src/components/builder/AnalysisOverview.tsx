import { healthWord, stepStrength, turnLabel, turnPosition } from "@/lib/analysis";
import { std, STD_TAG } from "@/lib/ui";
import type { AnalysisArchenemy, AnalysisHealth, AnalysisWinTurn } from "@/lib/types";
import { Meter, Segment } from "./Meter";

/** Brand card: a hairline border and the 28px radius, the same as the other panels in the app. */
const CARD = "min-w-0 rounded-[28px] border border-line p-6 sm:p-8";
/** A disclosure toggle, in the quiet pill style so it reads as a control. */
const SUMMARY = `${std("quiet")} -ml-4 cursor-pointer list-none [&::-webkit-details-marker]:hidden`;

/**
 * The five brackets as the win turn bar draws them, slow on the left. They are told apart by how strongly they take the accent, the
 * one colour of the brand, and by their labels, so nothing depends on hue.
 */
const BRACKETS = [
  { n: 1, label: "B1", range: "10+" },
  { n: 2, label: "B2", range: "8 to 10" },
  { n: 3, label: "B3", range: "6 to 8" },
  { n: 4, label: "B4", range: "4 to 6" },
  { n: 5, label: "cEDH", range: "under 4" },
] as const;

const AXIS_TURNS = [10, 8, 6, 4];

/** Where in its bracket's range the deck's estimated turn falls, in words a player would say. */
export function WinTurnBlock({ winTurn, rulesBracket }: { winTurn: AnalysisWinTurn; rulesBracket: number }) {
  const position = turnPosition(winTurn.turn);
  // Near either end the label hangs inward from the pin, so it never leaves the card.
  const labelShift = position < 12 ? "0%" : position > 88 ? "-100%" : "-50%";
  return (
    // The pin layer is as wide as the bar and moves by transform, so its box can reach past the card. It is clipped there, which also
    // stops it from widening the page.
    <div className={`${CARD} overflow-x-clip`}>
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-[15px] text-muted">Estimated win turn</p>
        <p className="text-[clamp(48px,5vw,80px)] leading-none font-medium tracking-[-0.05em]">{turnLabel(winTurn.turn)}</p>
      </div>

      <div className="relative mt-12 mb-10" role="img" aria-label={`Estimated win turn ${turnLabel(winTurn.turn)}, in the range of bracket ${winTurn.bracket}`}>
        <div className="flex h-11 gap-1 overflow-hidden rounded-full">
          {BRACKETS.map((bracket) => {
            const current = bracket.n === winTurn.bracket;
            return (
              <div
                key={bracket.n}
                className={`flex flex-1 items-center justify-center gap-1.5 px-1 text-[13px] whitespace-nowrap ${current ? "text-on-accent" : "text-ink"}`}
                style={{ background: `color-mix(in srgb, var(--accent-text) ${current ? 100 : Math.round(stepStrength(bracket.n - 1, 5) * 28)}%, var(--bg))` }}
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
          <span className="absolute inset-y-0 left-0 w-0.5 -translate-x-1/2 rounded-full bg-ink" />
          <span className={`${STD_TAG.plain} absolute -top-8 left-0 border-ink bg-bg font-mono whitespace-nowrap text-ink`} style={{ transform: `translateX(${labelShift})` }}>
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

      <p className="max-w-[820px] text-sm text-muted">
        The brackets are turn ranges, and the pin is where this deck lands.{" "}
        {winTurn.basis === "combo" ? "A combo in the deck can be run sooner than the rest of its signals suggest. " : ""}
        {rulesBracket > winTurn.bracket ? `The bracket rules still put it in bracket ${rulesBracket}. ` : ""}
        It is an estimate from the cards and simulated games of the deck, not a model trained on played games.
      </p>
    </div>
  );
}

export function HealthBlock({ health }: { health: AnalysisHealth }) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className={CARD}>
      <p className="text-[15px] text-muted">Deck health</p>
      <div className="mt-6 flex items-center gap-8">
        <div className="shrink-0 text-center">
          <div className="relative size-[116px]" role="img" aria-label={`Deck health ${health.score} out of 100, ${healthWord(health.score)}`}>
            <svg viewBox="0 0 100 100" className="size-full -rotate-90">
              <circle cx="50" cy="50" r={radius} fill="none" stroke="var(--line)" strokeWidth="7" />
              <circle
                cx="50"
                cy="50"
                r={radius}
                fill="none"
                stroke="var(--accent-text)"
                strokeWidth="7"
                strokeLinecap="round"
                strokeDasharray={`${(circumference * health.score) / 100} ${circumference}`}
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-[38px] leading-none font-medium tracking-[-0.05em]">{health.score}</span>
          </div>
          <p className="mt-2 text-sm text-muted">{healthWord(health.score)}</p>
        </div>
        <ul className="min-w-0 flex-1">
          {health.pillars.map((pillar) => (
            <li key={pillar.key} className="py-2">
              <div className="flex justify-between text-[15px]">
                <span>{pillar.label}</span>
                <span className="font-mono text-[13px] text-muted">{pillar.score}</span>
              </div>
              <div className="mt-1.5">
                <Meter value={pillar.score / 100} />
              </div>
            </li>
          ))}
        </ul>
      </div>

      <details className="mt-5">
        <summary className={SUMMARY}>Details</summary>
        <div className="mt-3 flex flex-col gap-6 text-sm">
          {health.pillars.map((pillar) => (
            <div key={pillar.key}>
              <p className="border-b border-line pb-2 text-[15px] text-muted">{pillar.label}</p>
              <ul>
                {pillar.spokes.map((spoke) => (
                  <li key={spoke.key} className="py-2.5">
                    <div className="flex justify-between gap-4 text-[15px]">
                      <span>{spoke.label}</span>
                      <span className="font-mono text-[13px] text-muted">
                        {spoke.observed}, usual {spoke.min} to {spoke.max}
                      </span>
                    </div>
                    <div className="mt-1.5">
                      <Meter value={spoke.score / 100} className="h-1" />
                    </div>
                    <p className="mt-1.5 text-muted">
                      {spoke.hint}
                      {spoke.cards.length > 0 && `. ${spoke.cards.join(", ")}`}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <p className="text-muted">{health.note}</p>
        </div>
      </details>
    </div>
  );
}

export function ArchenemyBlock({ archenemy }: { archenemy: AnalysisArchenemy }) {
  const steps = archenemy.levels.length;
  return (
    <div className={CARD}>
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-[15px] text-muted">Archenemy level</p>
        <p className="font-mono text-[13px] text-muted">
          {archenemy.level + 1} of {steps}
        </p>
      </div>
      <p className="mt-4 text-[clamp(40px,4vw,64px)] leading-none font-medium tracking-[-0.05em]">{archenemy.name}</p>
      <div className="mt-6 flex gap-1.5" role="img" aria-label={`Archenemy level ${archenemy.level + 1} of ${steps}, ${archenemy.name}`}>
        {archenemy.levels.map((name, step) => (
          <Segment key={name} filled={step <= archenemy.level} strength={stepStrength(step, steps)} />
        ))}
      </div>
      <div className="mt-2 flex justify-between text-sm text-muted">
        <span>{archenemy.levels[0]}</span>
        <span>{archenemy.levels[steps - 1]}</span>
      </div>

      {archenemy.patterns.length === 0 ? (
        <p className="mt-6 text-[15px] text-muted">Nothing in this deck is known for annoying a table.</p>
      ) : (
        <ul className="mt-6 flex flex-col gap-3 text-[15px]">
          {archenemy.patterns.map((pattern) => (
            <li key={pattern.key}>
              <span className="font-semibold">{pattern.label}.</span> <span className="text-muted">{pattern.text}</span>
              {pattern.cards.length > 0 && (
                <details className="mt-0.5 text-sm">
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
      <p className="mt-5 text-sm text-muted">A starting point for the talk before a game, not a verdict.</p>
    </div>
  );
}
