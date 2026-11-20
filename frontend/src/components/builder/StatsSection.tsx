"use client";

import Link from "next/link";
import { useMemo } from "react";
import { turnLabel, turnRange } from "@/lib/analysis";
import { formatPrice } from "@/lib/links";
import { std } from "@/lib/ui";
import { useAnalysis } from "@/lib/useAnalysis";
import { useStrandColor } from "@/lib/useStrandColor";
import type { DeckCardLine, DeckStats } from "@/lib/types";
import { BracketBlock, CombosBlock, ConsistencyBlock, EngineBlock, Placeholder, SpeedBlock } from "./AnalysisBlocks";
import { ArchenemyBlock, HealthBlock, WinTurnBlock } from "./AnalysisOverview";
import { ColourEclipses } from "./stats/ColourEclipses";
import { Composition } from "./stats/Composition";
import { HalftoneCurve } from "./stats/HalftoneCurve";
import { Caption, DotMeter, glowOf, GlowProvider, Panel } from "./stats/screen";

/** Below this many cards in the commander and main boards, estimates that read a whole deck stay hidden. */
const MIN_CARDS_FOR_ESTIMATES = 60;

interface Props {
  deckId: string;
  stats: DeckStats;
  /** The deck's cards, for the composition, the curve and the analysis. */
  lines: DeckCardLine[];
  /** Stats of the opened version, to show how the draft shifted. Null before the first save. */
  saved: DeckStats | null;
  savedVersion: number;
  removed: DeckCardLine[];
  showCollection: boolean;
  /** A page someone else's deck: no changes to compare against. */
  readOnly?: boolean;
  /** Whether to ask the server for the analysis; only a signed-in viewer can, unless analysisSource is given. */
  analyse?: boolean;
  /** Where a ready analysis of these cards can be read without signing in, such as a public deck's own address. */
  analysisSource?: string;
}

/**
 * The deck's numbers and its analysis in one section under the cards: a readout of the headline figures, the composition and the
 * curve as halftone screens, then what the deck is, how fast it is and how reliably it runs.
 */
export function StatsSection({ deckId, stats, lines, saved, savedVersion, removed, showCollection, readOnly = false, analyse = true, analysisSource }: Props) {
  const { analysis, updating, failure, empty, retry } = useAnalysis(lines, analyse, analysisSource);
  // The graphs glow in the version timeline's strand colour: the person's pick, or the commander's art.
  const { color: strand } = useStrandColor(lines.find((line) => line.board === "commander")?.imageArtCrop ?? null);
  const glow = useMemo(() => glowOf(strand), [strand]);
  const shift = saved ? Math.round((stats.averageManaValue - saved.averageManaValue) * 100) / 100 : 0;
  // Someone who is not signed in cannot ask, and a wall of errors would help nobody.
  const showAnalysis = analyse && !empty && !(failure?.status === 401 && !analysis);
  // The bracket estimate, win turn, health and consistency read a finished deck. On a deck of a dozen cards they
  // would state confident numbers about almost nothing, so they wait until the deck is most of the way there.
  const deckSize = lines.filter((line) => line.board === "commander" || line.board === "main").reduce((sum, line) => sum + line.quantity, 0);
  const tooSmall = deckSize < MIN_CARDS_FOR_ESTIMATES;
  // A win turn read only from card quality and speed, with no combo that ends the game, should say so.
  const noFinisher = analysis?.bracket?.signals.endingCombos === 0 && analysis?.winTurn?.basis !== "combo";

  const figures: Array<{ label: string; value: string; note?: string }> = [
    {
      label: "Average mana value",
      value: stats.averageManaValue.toFixed(2),
      note: saved
        ? `${shift === 0 ? "same as" : shift < 0 ? `down ${Math.abs(shift).toFixed(2)} from` : `up ${shift.toFixed(2)} from`} v${savedVersion}, lands excluded`
        : "lands excluded",
    },
  ];
  if (analysis?.bracket && !tooSmall)
    figures.push({
      label: "Bracket",
      value: analysis.bracket.bracket === 5 ? "cEDH" : String(analysis.bracket.bracket),
      note: analysis.bracket.name,
    });
  if (analysis?.winTurn && !tooSmall)
    figures.push({
      label: "Win turn",
      value: turnRange(analysis.winTurn.turn),
      note: noFinisher ? "rough estimate, no combo found" : "rough estimate",
    });
  figures.push({
    label: "Deck value",
    value: formatPrice(stats.totalPriceUsd),
    note: "Scryfall market prices, daily",
  });
  if (showCollection)
    figures.push({
      label: "Your collection",
      value: `${stats.owned}/${stats.totalCards}`,
      note: `${stats.missing} still needed`,
    });

  const typeTop = Math.max(1, ...Object.values(stats.types));

  return (
    <section aria-labelledby="stats-heading" className="border-t border-line pt-14 pb-24">
      <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2">
        <h2 id="stats-heading" className="font-display text-[clamp(56px,7vw,112px)] leading-[0.92]">
          Statistics
        </h2>
        <p role="status" aria-live="polite" className="font-mono text-[13px] text-muted">
          {showAnalysis && updating ? "Reading the deck" : ""}
        </p>
      </div>

      {showAnalysis && failure && (
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <p role="alert" className="max-w-[560px] rounded-2xl border border-danger-line bg-danger/10 px-4 py-3 text-sm text-ink">
            {failure.status === 429 ? "Too many analyses in a short time. Wait a moment, then try again." : failure.message}
          </p>
          <button type="button" onClick={retry} className={std("secondary")}>
            Try again
          </button>
        </div>
      )}

      <div
        className={`mt-10 flex flex-col gap-4 transition-opacity duration-200 motion-reduce:transition-none sm:gap-5 ${showAnalysis && updating && analysis ? "opacity-70" : ""}`}
      >
        <Panel>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-3 xl:flex xl:justify-between">
            {figures.map((figure) => (
              <div key={figure.label} className="min-w-0">
                <dt>
                  <Caption>{figure.label}</Caption>
                </dt>
                <dd className="mt-2 text-[clamp(40px,4.6vw,72px)] leading-none font-medium tracking-[-0.05em] whitespace-nowrap">{figure.value}</dd>
                {figure.note && <dd className="mt-2 font-mono text-[12px] text-accent-text">{figure.note}</dd>}
              </div>
            ))}
          </dl>
        </Panel>

        <GlowProvider value={glow}>
          <div className="grid gap-4 sm:gap-5 xl:grid-cols-12">
            <div className="min-w-0 xl:col-span-7">
              <Composition lines={lines} combos={analysis?.combos ?? null} className="h-full" />
            </div>
            <div className="min-w-0 xl:col-span-5">
              <HalftoneCurve lines={lines} average={stats.averageManaValue} className="h-full" />
            </div>
          </div>
        </GlowProvider>

        {showAnalysis && !analysis && !failure && <p className="py-6 text-muted">Reading the deck.</p>}

        {showAnalysis && analysis && tooSmall && (
          <p className="max-w-[640px] text-muted">
            The bracket, win turn, health and consistency appear once the deck has {MIN_CARDS_FOR_ESTIMATES} cards. With {deckSize} so far they
            would only be guesses.
          </p>
        )}

        {showAnalysis && analysis && !tooSmall && (
          <>
            {analysis.winTurn && analysis.bracket && <WinTurnBlock winTurn={analysis.winTurn} rulesBracket={analysis.bracket.bracket} noFinisher={noFinisher} simulatedComboTurn={analysis.speed?.comboMean ?? null} />}

            <div className="grid gap-4 sm:gap-5 md:grid-cols-2 xl:grid-cols-3">
              {analysis.health && <HealthBlock health={analysis.health} />}
              {analysis.archenemy && <ArchenemyBlock archenemy={analysis.archenemy} />}
              {analysis.composition && <ColourEclipses composition={analysis.composition} />}
            </div>

            <div className="grid items-start gap-4 sm:gap-5 md:grid-cols-2 xl:grid-cols-3">
              {analysis.bracket && <BracketBlock bracket={analysis.bracket} />}
              {analysis.engine ? (
                <EngineBlock engine={analysis.engine} />
              ) : (
                <Placeholder title="Built around" text="Add more spells to see what the deck is built around." />
              )}
              {analysis.consistency ? (
                <ConsistencyBlock consistency={analysis.consistency} />
              ) : (
                <Placeholder title="Consistency" text="Add more cards to see how reliably the deck runs." />
              )}
            </div>
          </>
        )}

        <div className="grid items-start gap-4 sm:gap-5 md:grid-cols-2 xl:grid-cols-3">
          {showAnalysis && !tooSmall && analysis?.speed && <SpeedBlock speed={analysis.speed} />}
          {showAnalysis && analysis?.combos && <CombosBlock combos={analysis.combos} />}
          <div className="flex min-w-0 flex-col gap-4 sm:gap-5">
            <Panel title="Card types" right={<Caption>{stats.totalCards} cards</Caption>}>
              <ul>
                {Object.entries(stats.types).map(([type, count]) => (
                  <li key={type} className="py-2">
                    <div className="flex justify-between text-[14px]">
                      <span>{type}</span>
                      <span className="font-mono text-[12px] text-muted">{count}</span>
                    </div>
                    <div className="mt-1.5">
                      <DotMeter value={count / typeTop} />
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>

            {!readOnly && (
              <Panel
                title={saved ? `Removed since v${savedVersion}` : "Removed"}
                right={
                  saved && (
                    <Link
                      href={`/decks/${deckId}/diff`}
                      className="-my-2 inline-flex min-h-9 min-w-11 items-center justify-center font-mono text-[11px] tracking-[0.12em] text-accent-text uppercase [@media(pointer:coarse)]:min-h-11"
                    >
                      Full diff
                    </Link>
                  )
                }
              >
                {removed.length === 0 ? (
                  <p className="text-[14px] text-muted">Nothing removed.</p>
                ) : (
                  <ul>
                    {removed.map((line) => (
                      <li key={`${line.cardId}|${line.board}`} className="flex justify-between py-2 text-[14px] text-muted line-through">
                        <span>{line.name}</span>
                        <span className="font-mono text-[12px]">{line.quantity > 1 ? `${line.quantity}x` : ""}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            )}
          </div>
        </div>

        {showAnalysis && analysis && (
          <p className="mt-10 max-w-[760px] text-sm leading-relaxed text-muted">
            The bracket rules (Game Changers, mass land denial, chained extra turns, two-card combos) follow the Commander bracket guidelines from Wizards of
            the Coast and are exact. The speed estimate and the labels for what a deck is built around are Eregion&apos;s own and are a guide, not a ruling.
            Chances assume you are on the play and draw from the 99. The setup speed comes from simulated games of the deck on its own, which measure how fast
            it gets going and not how fast it wins. Combos come from{" "}
            <a href="https://commanderspellbook.com" target="_blank" rel="noreferrer" className="text-accent-text underline underline-offset-4">
              Commander Spellbook
            </a>
            .
          </p>
        )}
      </div>
    </section>
  );
}
