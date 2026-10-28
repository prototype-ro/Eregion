"use client";

import { useState } from "react";
import { ManaCost } from "@/components/Mana";
import { ArchenemyBlock, HealthBlock, WinTurnBlock } from "./AnalysisOverview";
import { Column, Meter } from "./Meter";
import { basisLabel, chanceWord, percent } from "@/lib/analysis";
import { std, STD_TAG } from "@/lib/ui";
import { useAnalysis } from "@/lib/useAnalysis";
import type {
  AnalysisBracket,
  AnalysisCombo,
  AnalysisCombos,
  AnalysisConsistency,
  AnalysisEngine,
  AnalysisSpeed,
  DeckAnalysis,
  DeckCardLine,
} from "@/lib/types";

const COLORS = ["W", "U", "B", "R", "G"] as const;
const SHOWN_CARDS = 6;
const SHOWN_COMBOS = 6;

interface Props {
  lines: DeckCardLine[];
}

/** What the deck is, how fast it is and how reliably it runs, worked out by the server from the cards. */
export function AnalysisSection({ lines }: Props) {
  const { analysis, updating, failure, empty, retry } = useAnalysis(lines);

  // Someone who is not signed in cannot ask, and a section of errors would help nobody.
  if (failure?.status === 401 && !analysis) return null;
  if (empty && !analysis) return null;

  return (
    <section aria-labelledby="analysis-heading" className="border-t border-line pt-14 pb-24">
      <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2">
        <h2 id="analysis-heading" className="font-display text-[clamp(56px,7vw,112px)] leading-[0.92]">
          Analysis
        </h2>
        <p role="status" aria-live="polite" className="font-mono text-[13px] text-muted">
          {updating ? "Reading the deck" : ""}
        </p>
      </div>

      {failure && (
        <div className="mt-10 flex flex-wrap items-center gap-4">
          <p role="alert" className="max-w-[560px] rounded-2xl border border-danger-line bg-danger/10 px-4 py-3 text-sm text-ink">
            {failure.status === 429 ? "Too many analyses in a short time. Wait a moment, then try again." : failure.message}
          </p>
          <button type="button" onClick={retry} className={std("secondary")}>
            Try again
          </button>
        </div>
      )}

      {!analysis && !failure && <p className="mt-10 text-muted">Reading the deck.</p>}

      {analysis && (
        <div className={`mt-10 transition-opacity duration-200 motion-reduce:transition-none ${updating ? "opacity-60" : ""}`}>
          {analysis.winTurn && analysis.bracket && <WinTurnBlock winTurn={analysis.winTurn} rulesBracket={analysis.bracket.bracket} />}

          {(analysis.health || analysis.archenemy) && (
            <div className="mt-6 grid gap-6 md:grid-cols-2">
              {analysis.health && <HealthBlock health={analysis.health} />}
              {analysis.archenemy && <ArchenemyBlock archenemy={analysis.archenemy} />}
            </div>
          )}

          <div className="mt-16 grid gap-x-16 gap-y-14 md:grid-cols-2 xl:grid-cols-[1.2fr_1fr_1fr]">
            {analysis.bracket && <BracketBlock bracket={analysis.bracket} />}
            {analysis.engine ? <EngineBlock engine={analysis.engine} /> : <Placeholder title="Built around" text="Add more spells to see what the deck is built around." />}
            {analysis.consistency ? (
              <ConsistencyBlock consistency={analysis.consistency} />
            ) : (
              <Placeholder title="Consistency" text="Add more cards to see how reliably the deck runs." />
            )}
          </div>

          <div className="mt-16 grid gap-x-16 gap-y-14 md:grid-cols-2 xl:grid-cols-3">
            {analysis.speed && <SpeedBlock speed={analysis.speed} />}
            {analysis.combos && <CombosBlock combos={analysis.combos} />}
            {analysis.composition && <ColorsBlock analysis={analysis} />}
          </div>

          <p className="mt-16 max-w-[760px] text-sm leading-relaxed text-muted">
            The bracket rules (Game Changers, mass land denial, chained extra turns, two-card combos) follow the Commander bracket guidelines from Wizards of the
            Coast and are exact. The speed estimate and the labels for what a deck is built around are Eregion&apos;s own and are a guide, not a ruling. Chances
            assume you are on the play and draw from the 99. The setup speed comes from simulated games of the deck on its own, which measure how fast it gets going and not how fast it wins. Combos come from{" "}
            <a href="https://commanderspellbook.com" target="_blank" rel="noreferrer" className="text-accent-text underline underline-offset-4">
              Commander Spellbook
            </a>
            .
          </p>
        </div>
      )}
    </section>
  );
}

function Placeholder({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <p className="border-b border-line pb-2.5 text-[15px] text-muted">{title}</p>
      <p className="py-3 text-sm text-muted">{text}</p>
    </div>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return <p className="border-b border-line pb-2.5 text-[15px] text-muted">{children}</p>;
}

/** A name list that stays short: the first few, then how many more. */
function names(cards: string[]): string {
  if (cards.length <= SHOWN_CARDS) return cards.join(", ");
  return `${cards.slice(0, SHOWN_CARDS).join(", ")} and ${cards.length - SHOWN_CARDS} more`;
}

function BracketBlock({ bracket }: { bracket: AnalysisBracket }) {
  const s = bracket.signals;
  const rows: Array<[string, string, string[]]> = [
    ["Game Changers", String(s.gameChangers), s.gameChangerCards],
    ["Tutors", s.tutors ? `${s.tutors} (${s.unconditionalTutors} open)` : "0", []],
    ["Fast mana", String(s.fastMana), s.fastManaCards],
    ["Extra turns", String(s.extraTurns), s.extraTurnCards],
    ["Mass land denial", String(s.massLandDenial), s.massLandDenialCards],
    ["Two-card combos", s.twoCardCombos === null ? "unknown" : String(s.twoCardCombos), []],
  ];
  return (
    <div>
      <p className="text-[15px] text-muted">Commander bracket</p>
      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-5 gap-y-1">
        <p className="text-[clamp(64px,7vw,104px)] leading-none font-medium tracking-[-0.05em]">{bracket.bracket === 5 ? "cEDH" : bracket.bracket}</p>
        <p className="text-[clamp(24px,2.4vw,36px)] leading-none tracking-[-0.03em]">{bracket.name}</p>
      </div>
      <ol className="mt-5 flex gap-2" aria-label="Brackets, the shown one is filled">
        {[1, 2, 3, 4, 5].map((n) => (
          <li
            key={n}
            aria-current={n === bracket.bracket ? "true" : undefined}
            className={`flex size-9 items-center justify-center rounded-full border font-mono text-[13px] ${n === bracket.bracket ? "border-transparent bg-accent text-on-accent" : "border-line text-muted"}`}
          >
            {n}
          </li>
        ))}
      </ol>
      <p className="mt-3 font-mono text-[13px] text-accent-text">
        {bracket.floor === bracket.estimated ? "The rules and the speed signals agree" : basisLabel(bracket.basis)}. Rules floor {bracket.floor}, speed
        estimate {bracket.estimated}.
      </p>

      {bracket.reasons.length > 0 && (
        <ul className="mt-5 flex flex-col gap-2 text-[15px]">
          {bracket.reasons.map((reason) => (
            <li key={reason.kind + reason.bracket}>
              {reason.text}
              {reason.cards.length > 0 && <span className="block text-sm text-muted">{names(reason.cards)}</span>}
            </li>
          ))}
        </ul>
      )}
      {bracket.whatWouldChange.length > 0 && (
        <ul className="mt-4 flex flex-col gap-1.5 text-sm text-muted">
          {bracket.whatWouldChange.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      )}
      {bracket.note && <p className="mt-4 max-w-[480px] text-sm text-muted">{bracket.note}</p>}

      <div className="mt-8">
        <Heading>What the bracket reads</Heading>
        <ul>
          {rows.map(([label, value, cards]) => (
            <li key={label} className="py-2.5 text-[15px]">
              <div className="flex justify-between">
                <span>{label}</span>
                <span className="font-mono text-[13px] text-muted">{value}</span>
              </div>
              {cards.length > 0 && <p className="mt-0.5 text-sm text-muted">{names(cards)}</p>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function EngineBlock({ engine }: { engine: AnalysisEngine }) {
  const top = Math.max(...engine.themes.map((theme) => theme.score), 1);
  return (
    <div>
      <p className="text-[15px] text-muted">Built around</p>
      <p className="mt-1.5 text-[clamp(36px,3.6vw,56px)] leading-none font-medium tracking-[-0.04em]">{engine.primary}</p>
      <p className="mt-2 max-w-[420px] text-sm text-muted">{engine.description}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {engine.ambiguous && engine.runnerUp && <span className={STD_TAG.accent}>Close call with {engine.runnerUp}</span>}
        {engine.tribe && <span className={STD_TAG.plain}>{engine.tribe} tribe</span>}
      </div>

      <div className="mt-8">
        <Heading>Share of the spells</Heading>
        <ul>
          {engine.themes.map((theme) => (
            <li key={theme.name} className="py-2.5 text-[15px]">
              <div className="flex justify-between">
                <span className={theme.score < 8 ? "text-muted" : ""}>{theme.name}</span>
                <span className="font-mono text-[13px] text-muted">{theme.score.toFixed(1)}%</span>
              </div>
              <div className="mt-1.5">
                <Meter value={theme.score / top} className="h-1" />
              </div>
            </li>
          ))}
        </ul>
      </div>

      {engine.signatureCards.length > 0 && (
        <p className="mt-4 text-sm text-muted">
          <span className="text-ink">Leaning on it:</span> {names(engine.signatureCards)}
        </p>
      )}
    </div>
  );
}

function Chance({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <li className="py-2.5 text-[15px]">
      <div className="flex justify-between gap-4">
        <span>
          {label}
          {hint && <span className="block text-sm text-muted">{hint}</span>}
        </span>
        <span className="font-mono text-[13px] text-muted" aria-label={`${percent(value)}, ${chanceWord(value)}`}>
          {percent(value)}
        </span>
      </div>
      <div className="mt-1.5">
        <Meter value={value} className="h-1" />
      </div>
    </li>
  );
}

function ConsistencyBlock({ consistency: c }: { consistency: AnalysisConsistency }) {
  return (
    <div>
      <Heading>Consistency</Heading>
      <ul>
        <Chance label="Keepable opening hand" value={c.keepableOpener} hint="2 to 5 lands in 7 cards" />
        <Chance label="Land drop on turn 2" value={c.landDropTurn2} />
        <Chance label="Land drop on turn 3" value={c.landDropTurn3} />
        <Chance label="Land drop on turn 4" value={c.landDropTurn4} />
        <Chance label="Cheap ramp by turn 2" value={c.rampByTurn2} hint={`${c.cheapRamp} ramp cards of mana value 2 or less`} />
        <Chance label="Two ramp by turn 3" value={c.twoRampByTurn3} />
        {c.commanderOnCurve !== null && <Chance label="Commander on curve" value={c.commanderOnCurve} hint="lands and cheap ramp by its mana value" />}
        {COLORS.filter((color) => color in c.colorAccessTurn3).map((color) => (
          <Chance key={color} label={`A ${color === "W" ? "white" : color === "U" ? "blue" : color === "B" ? "black" : color === "R" ? "red" : "green"} source by turn 3`} value={c.colorAccessTurn3[color]} />
        ))}
      </ul>
      <p className="mt-3 text-sm text-muted">
        {c.lands} lands in {c.libraryCards} cards, {c.expectedOpeningLands.toFixed(1)} expected in a seven card hand.
      </p>
    </div>
  );
}

function SpeedBlock({ speed }: { speed: AnalysisSpeed }) {
  const top = Math.max(...speed.manaByTurn, 1);
  const combos = Object.entries(speed.comboByTurn);
  const commander = Object.entries(speed.commanderByTurn);
  return (
    <div>
      <Heading>Setup speed</Heading>
      <p className="py-3 text-sm text-muted">Average mana left for spells each turn, from {speed.games} simulated games.</p>
      <ol className="flex h-[120px] items-end gap-2 border-b border-line" aria-label="Average mana by turn">
        {speed.manaByTurn.map((mana, index) => (
          <li key={index} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
            <span className="font-mono text-xs text-muted">{mana.toFixed(1)}</span>
            <Column value={mana / top} />
          </li>
        ))}
      </ol>
      <div className="mt-2 flex gap-2 font-mono text-xs text-muted" aria-hidden="true">
        {speed.manaByTurn.map((_, index) => (
          <span key={index} className="min-w-0 flex-1 text-center">
            {index + 1}
          </span>
        ))}
      </div>

      {commander.length > 0 && (
        <ul className="mt-6">
          <li className="flex justify-between py-2 text-[15px]">
            <span>Commander cast</span>
            <span className="font-mono text-[13px] text-muted">{speed.commanderTurn === null ? "after turn 12" : `turn ${speed.commanderTurn}`}</span>
          </li>
          {commander.map(([turn, chance]) => (
            <Chance key={turn} label={`Cast by turn ${turn}`} value={chance} />
          ))}
        </ul>
      )}
      {combos.length > 0 && (
        <ul className="mt-6">
          <li className="flex justify-between py-2 text-[15px]">
            <span>Game-ending combo ready</span>
            <span className="font-mono text-[13px] text-muted">{speed.comboTurn === null ? "rarely" : `turn ${speed.comboTurn}`}</span>
          </li>
          {combos.map(([turn, chance]) => (
            <Chance key={turn} label={`Ready by turn ${turn}`} value={chance} />
          ))}
        </ul>
      )}
      <details className="mt-4 text-sm text-muted">
        <summary className="cursor-pointer">How this is simulated</summary>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
          {speed.assumptions.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function ComboRow({ combo, oneAway }: { combo: AnalysisCombo; oneAway: boolean }) {
  return (
    <li className="py-3 text-[15px]">
      <p>
        {combo.cards.map((card, index) => (
          <span key={card}>
            {index > 0 && <span className="text-muted"> + </span>}
            <span className={oneAway && combo.missing.includes(card) ? "text-accent-text underline decoration-dotted underline-offset-4" : ""}>{card}</span>
          </span>
        ))}
      </p>
      <p className="mt-0.5 text-sm text-muted">
        {combo.produces.length > 0 ? combo.produces.slice(0, 3).join(", ") : "A combo"}
        {combo.manaNeeded && <span className="ml-2 inline-flex items-center align-middle"><ManaCost cost={combo.manaNeeded} /></span>}
      </p>
    </li>
  );
}

function CombosBlock({ combos }: { combos: AnalysisCombos }) {
  const [all, setAll] = useState(false);
  if (!combos.available) {
    return <Placeholder title="Combos" text="Combo data is not available right now, so combos are not counted. Try again in a minute." />;
  }
  return (
    <div>
      <Heading>Combos in the deck</Heading>
      {combos.included.length === 0 ? <p className="py-3 text-sm text-muted">No combos found.</p> : <ul>{combos.included.map((combo) => <ComboRow key={combo.id} combo={combo} oneAway={false} />)}</ul>}
      {combos.oneCardAway.length > 0 && (
        <>
          <p className="mt-8 border-b border-line pb-2.5 text-[15px] text-muted">One card away</p>
          <ul>{(all ? combos.oneCardAway : combos.oneCardAway.slice(0, SHOWN_COMBOS)).map((combo) => <ComboRow key={combo.id} combo={combo} oneAway />)}</ul>
          {combos.oneCardAway.length > SHOWN_COMBOS && (
            <button type="button" onClick={() => setAll(!all)} aria-expanded={all} className={`${std("quiet")} mt-2 -ml-4`}>
              {all ? "Show fewer" : `Show all ${combos.oneCardAway.length}`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function ColorsBlock({ analysis }: { analysis: DeckAnalysis }) {
  const composition = analysis.composition!;
  const colors = COLORS.filter((color) => composition.pips[color] > 0 || composition.sources[color] > 0);
  const colorless = composition.sources.C ?? 0;
  const most = Math.max(...colors.flatMap((color) => [composition.pips[color], composition.sources[color]]), 1);
  return (
    <div>
      <Heading>Colours</Heading>
      <p className="py-3 text-sm text-muted">
        Pips are the coloured symbols in the costs of the spells. Sources are the cards that can make that colour. Median mana value{" "}
        <span className="font-mono">{composition.medianManaValue}</span>.
      </p>
      <ul>
        {colors.map((color) => (
          <li key={color} className="py-2.5">
            <div className="flex items-center justify-between text-[15px]">
              <ManaCost cost={`{${color}}`} />
              <span className="font-mono text-[13px] text-muted">
                {composition.pips[color]} pips, {composition.sources[color]} sources
              </span>
            </div>
            <div className="mt-1.5 grid gap-1">
              <Meter value={composition.pips[color] / most} className="h-1" />
              <Meter value={composition.sources[color] / most} className="h-1" fill="bg-muted" />
            </div>
          </li>
        ))}
        {colorless > 0 && (
          <li className="flex items-center justify-between py-2.5 text-[15px]">
            <ManaCost cost="{C}" />
            <span className="font-mono text-[13px] text-muted">{colorless} sources</span>
          </li>
        )}
      </ul>
    </div>
  );
}
