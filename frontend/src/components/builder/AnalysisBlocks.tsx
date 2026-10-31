"use client";

import { useState } from "react";
import { ManaCost } from "@/components/Mana";
import { basisLabel, chanceWord, percent } from "@/lib/analysis";
import type { AnalysisBracket, AnalysisCombo, AnalysisCombos, AnalysisConsistency, AnalysisEngine, AnalysisSpeed } from "@/lib/types";
import { Caption, COPPER_HOT, INK, MeterRow, Panel, SCREEN_BUTTON } from "./stats/screen";

/** The analysis panels of the statistics section: what the deck is, how fast it is and how reliably it runs. */

const COLOR_WORDS: Record<string, string> = {
  W: "white",
  U: "blue",
  B: "black",
  R: "red",
  G: "green",
};
const COLORS = ["W", "U", "B", "R", "G"] as const;
const SHOWN_CARDS = 6;
const SHOWN_COMBOS = 6;

/** A name list that stays short: the first few, then how many more. */
function names(cards: string[]): string {
  if (cards.length <= SHOWN_CARDS) return cards.join(", ");
  return `${cards.slice(0, SHOWN_CARDS).join(", ")} and ${cards.length - SHOWN_CARDS} more`;
}

function Sub({ children }: { children: React.ReactNode }) {
  return <Caption className="mt-6 border-b border-line pb-2">{children}</Caption>;
}

export function Placeholder({ title, text }: { title: string; text: string }) {
  return (
    <Panel title={title}>
      <p className="text-[14px] text-muted">{text}</p>
    </Panel>
  );
}

function Chance({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return <MeterRow label={label} value={value} shown={percent(value)} hint={hint} ariaValue={`${percent(value)}, ${chanceWord(value)}`} />;
}

export function BracketBlock({ bracket }: { bracket: AnalysisBracket }) {
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
    <Panel title="Commander bracket">
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
        <p className="text-[clamp(56px,6vw,88px)] leading-none font-medium tracking-[-0.05em]">{bracket.bracket === 5 ? "cEDH" : bracket.bracket}</p>
        <p className="text-[clamp(22px,2.2vw,32px)] leading-none tracking-[-0.03em]">{bracket.name}</p>
      </div>
      <ol className="mt-5 flex gap-2" aria-label="Brackets, the shown one is filled">
        {[1, 2, 3, 4, 5].map((n) => (
          <li
            key={n}
            aria-current={n === bracket.bracket ? "true" : undefined}
            className={`flex size-9 items-center justify-center rounded-full font-mono text-[13px] ${n === bracket.bracket ? "text-bg" : "border border-white/20 text-muted"}`}
            style={n === bracket.bracket ? { background: INK } : undefined}
          >
            {n}
          </li>
        ))}
      </ol>
      <p className="mt-3 font-mono text-[12px] text-accent-text">
        {bracket.floor === bracket.estimated ? "The rules and the speed signals agree" : basisLabel(bracket.basis)}. Rules floor {bracket.floor}, speed estimate{" "}
        {bracket.estimated}.
      </p>

      {bracket.reasons.length > 0 && (
        <ul className="mt-5 flex flex-col gap-2 text-[14px]">
          {bracket.reasons.map((reason) => (
            <li key={reason.kind + reason.bracket}>
              {reason.text}
              {reason.cards.length > 0 && <span className="block text-[13px] text-muted">{names(reason.cards)}</span>}
            </li>
          ))}
        </ul>
      )}
      {bracket.whatWouldChange.length > 0 && (
        <ul className="mt-4 flex flex-col gap-1.5 text-[13px] text-muted">
          {bracket.whatWouldChange.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      )}
      {bracket.note && <p className="mt-4 max-w-[480px] text-[13px] text-muted">{bracket.note}</p>}

      <Sub>What the bracket reads</Sub>
      <ul>
        {rows.map(([label, value, cards]) => (
          <li key={label} className="py-2 text-[14px]">
            <div className="flex justify-between">
              <span>{label}</span>
              <span className="font-mono text-[12px] text-muted">{value}</span>
            </div>
            {cards.length > 0 && <p className="mt-0.5 text-[13px] text-muted">{names(cards)}</p>}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function EngineBlock({ engine }: { engine: AnalysisEngine }) {
  const top = Math.max(...engine.themes.map((theme) => theme.score), 1);
  return (
    <Panel title="Built around">
      <p className="text-[clamp(32px,3.2vw,48px)] leading-none font-medium tracking-[-0.04em]">{engine.primary}</p>
      <p className="mt-2 max-w-[420px] text-[13px] text-muted">{engine.description}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {engine.ambiguous && engine.runnerUp && (
          <span className="inline-flex items-center rounded-full border px-3 py-1 text-[12px]" style={{ borderColor: COPPER_HOT, color: COPPER_HOT }}>
            Close call with {engine.runnerUp}
          </span>
        )}
        {engine.tribe && (
          <span className="inline-flex items-center rounded-full border border-white/20 px-3 py-1 text-[12px] text-muted">{engine.tribe} tribe</span>
        )}
      </div>

      <Sub>Share of the spells</Sub>
      <ul>
        {engine.themes.map((theme) => (
          <MeterRow
            key={theme.name}
            label={<span className={theme.score < 8 ? "text-muted" : ""}>{theme.name}</span>}
            value={theme.score / top}
            shown={`${theme.score.toFixed(1)}%`}
          />
        ))}
      </ul>

      {engine.signatureCards.length > 0 && (
        <p className="mt-4 text-[13px] text-muted">
          <span className="text-ink">Leaning on it:</span> {names(engine.signatureCards)}
        </p>
      )}
    </Panel>
  );
}

export function ConsistencyBlock({ consistency: c }: { consistency: AnalysisConsistency }) {
  return (
    <Panel title="Consistency" foot={`${c.lands} lands in ${c.libraryCards} cards, ${c.expectedOpeningLands.toFixed(1)} expected in a seven card hand.`}>
      <ul>
        <Chance label="Keepable opening hand" value={c.keepableOpener} hint="2 to 5 lands in 7 cards" />
        <Chance label="Land drop on turn 2" value={c.landDropTurn2} />
        <Chance label="Land drop on turn 3" value={c.landDropTurn3} />
        <Chance label="Land drop on turn 4" value={c.landDropTurn4} />
        <Chance label="Cheap ramp by turn 2" value={c.rampByTurn2} hint={`${c.cheapRamp} ramp cards of mana value 2 or less`} />
        <Chance label="Two ramp by turn 3" value={c.twoRampByTurn3} />
        {c.commanderOnCurve !== null && <Chance label="Commander on curve" value={c.commanderOnCurve} hint="lands and cheap ramp by its mana value" />}
        {COLORS.filter((color) => color in c.colorAccessTurn3).map((color) => (
          <Chance key={color} label={`A ${COLOR_WORDS[color]} source by turn 3`} value={c.colorAccessTurn3[color]} />
        ))}
      </ul>
    </Panel>
  );
}

/** Mana by turn as halftone stacks: one dot per mana, the last one sized by the fraction. */
function ManaStacks({ mana }: { mana: number[] }) {
  const P = 12;
  const colW = 30;
  const top = Math.max(4, Math.ceil(Math.max(...mana, 1)));
  const gap = mana.length > 1 ? (360 - mana.length * colW) / (mana.length - 1) : 0;
  const base = 18 + top * P;
  return (
    <svg
      viewBox={`0 0 360 ${base + 22}`}
      className="block w-full"
      role="img"
      aria-label={`Average mana by turn: ${mana.map((m, i) => `turn ${i + 1} ${m.toFixed(1)}`).join(", ")}`}
    >
      {mana.map((value, i) => {
        const x = i * (colW + gap) + colW / 2;
        const whole = Math.floor(value);
        const part = value - whole;
        return (
          <g key={i}>
            <text
              x={x}
              y={base - (Math.ceil(value) || 1) * P - 6}
              textAnchor="middle"
              fontSize="10"
              fontFamily="var(--font-mono), monospace"
              fill="var(--muted)"
            >
              {value.toFixed(1)}
            </text>
            {Array.from({ length: whole }, (_, k) => {
              const f = 1 - Math.pow(k / Math.max(1, top), 1.3);
              return <circle key={k} cx={x} cy={base - k * P - P / 2} r={P * 0.5 * (0.45 + 0.5 * f)} fill={INK} opacity={0.55 + 0.45 * f} />;
            })}
            {part > 0.05 && <circle cx={x} cy={base - whole * P - P / 2} r={P * 0.5 * 0.9 * Math.sqrt(part)} fill={COPPER_HOT} />}
            <text x={x} y={base + 16} textAnchor="middle" fontSize="10" fontFamily="var(--font-mono), monospace" fill="var(--muted)">
              {i + 1}
            </text>
          </g>
        );
      })}
      <line x1={0} x2={360} y1={base + 3} y2={base + 3} stroke="rgba(255,255,255,0.12)" />
    </svg>
  );
}

export function SpeedBlock({ speed }: { speed: AnalysisSpeed }) {
  const combos = Object.entries(speed.comboByTurn);
  const commander = Object.entries(speed.commanderByTurn);
  return (
    <Panel title="Setup speed" right={<Caption>{speed.games} games</Caption>}>
      <p className="mb-3 text-[13px] text-muted">Average mana left for spells each turn, one dot per mana, from simulated games.</p>
      <ManaStacks mana={speed.manaByTurn} />

      {commander.length > 0 && (
        <>
          <Sub>Commander cast · {speed.commanderTurn === null ? "after turn 12" : `turn ${speed.commanderTurn}`}</Sub>
          <ul>
            {commander.map(([turn, chance]) => (
              <Chance key={turn} label={`Cast by turn ${turn}`} value={chance} />
            ))}
          </ul>
        </>
      )}
      {combos.length > 0 && (
        <>
          <Sub>Game-ending combo ready · {speed.comboTurn === null ? "rarely" : `turn ${speed.comboTurn}`}</Sub>
          <ul>
            {combos.map(([turn, chance]) => (
              <Chance key={turn} label={`Ready by turn ${turn}`} value={chance} />
            ))}
          </ul>
        </>
      )}
      <details className="mt-4 text-[13px] text-muted">
        <summary className="inline-flex min-h-9 cursor-pointer items-center [@media(pointer:coarse)]:min-h-11">How this is simulated</summary>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
          {speed.assumptions.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      </details>
    </Panel>
  );
}

function ComboRow({ combo, oneAway }: { combo: AnalysisCombo; oneAway: boolean }) {
  return (
    <li className="flex gap-3 py-2.5 text-[14px]">
      <span className="mt-[7px] flex shrink-0 gap-1" aria-hidden="true">
        {combo.cards.map((card) =>
          oneAway && combo.missing.includes(card) ? (
            <span key={card} className="size-2 rounded-full border" style={{ borderColor: COPPER_HOT }} />
          ) : (
            <span key={card} className="size-2 rounded-full" style={{ background: COPPER_HOT }} />
          ),
        )}
      </span>
      <span className="min-w-0">
        <span className="block">
          {combo.cards.map((card, index) => (
            <span key={card}>
              {index > 0 && <span className="text-muted"> + </span>}
              <span className={oneAway && combo.missing.includes(card) ? "text-accent-text underline decoration-dotted underline-offset-4" : ""}>{card}</span>
            </span>
          ))}
        </span>
        <span className="mt-0.5 block text-[13px] text-muted">
          {combo.produces.length > 0 ? combo.produces.slice(0, 3).join(", ") : "A combo"}
          {combo.manaNeeded && (
            <span className="ml-2 inline-flex items-center align-middle">
              <ManaCost cost={combo.manaNeeded} />
            </span>
          )}
        </span>
      </span>
    </li>
  );
}

export function CombosBlock({ combos }: { combos: AnalysisCombos }) {
  const [all, setAll] = useState(false);
  if (!combos.available) {
    return <Placeholder title="Combos" text="Combo data is not available right now, so combos are not counted. Try again in a minute." />;
  }
  return (
    <Panel title="Combos" right={<Caption>{combos.included.length} in the deck</Caption>}>
      {combos.included.length === 0 ? (
        <p className="text-[14px] text-muted">No combos found.</p>
      ) : (
        <ul>
          {combos.included.map((combo) => (
            <ComboRow key={combo.id} combo={combo} oneAway={false} />
          ))}
        </ul>
      )}
      {combos.oneCardAway.length > 0 && (
        <>
          <Sub>One card away · {combos.oneCardAway.length}</Sub>
          <ul>
            {(all ? combos.oneCardAway : combos.oneCardAway.slice(0, SHOWN_COMBOS)).map((combo) => (
              <ComboRow key={combo.id} combo={combo} oneAway />
            ))}
          </ul>
          {combos.oneCardAway.length > SHOWN_COMBOS && (
            <button type="button" onClick={() => setAll(!all)} aria-expanded={all} className={`${SCREEN_BUTTON} mt-3`}>
              {all ? "Show fewer" : `Show all ${combos.oneCardAway.length}`}
            </button>
          )}
        </>
      )}
    </Panel>
  );
}
