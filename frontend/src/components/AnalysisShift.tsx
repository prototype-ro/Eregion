"use client";

import { useEffect, useState } from "react";
import { analysisRequest, turnRange } from "@/lib/analysis";
import { api, ApiError } from "@/lib/api";
import { formatPrice } from "@/lib/links";
import type { DeckAnalysis, VersionDetail } from "@/lib/types";

interface Side {
  version: VersionDetail;
  analysis: DeckAnalysis;
}

/** Bracket, win turn and health read a finished deck, as on the deck page. */
const MIN_CARDS = 60;

const size = (version: VersionDetail) =>
  version.cards.filter((line) => line.board === "commander" || line.board === "main").reduce((sum, line) => sum + line.quantity, 0);

/**
 * What a change did to the deck as a whole: bracket, win turn, health, combos, Game Changers and price, before and
 * after. The question a player asks after a swap is "did that help?", and the card list alone does not answer it.
 */
export function AnalysisShift({ deckId, from, to }: { deckId: string; from: number; to: number }) {
  const [sides, setSides] = useState<[Side, Side] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setSides(null);
    setError(null);
    const load = async (number: number): Promise<Side> => {
      const version = await api<VersionDetail>(`/api/decks/${deckId}/versions/${number}`);
      const analysis = await api<DeckAnalysis>("/api/analysis", { method: "POST", body: analysisRequest(version.cards) });
      return { version, analysis };
    };
    Promise.all([load(from), load(to)])
      .then((pair) => live && setSides(pair))
      .catch((err) => live && setError(err instanceof ApiError ? err.message : "Could not analyse these versions."));
    return () => {
      live = false;
    };
  }, [deckId, from, to]);

  if (error) return <p className="text-sm text-muted">{error}</p>;
  if (!sides) return <p className="text-sm text-muted">Reading both versions.</p>;

  const [before, after] = sides;
  const finished = size(before.version) >= MIN_CARDS && size(after.version) >= MIN_CARDS;
  const bracket = (side: Side) => (side.analysis.bracket ? (side.analysis.bracket.bracket === 5 ? "cEDH" : String(side.analysis.bracket.bracket)) : "–");
  const rows: Array<{ label: string; was: string; now: string; better?: boolean | null }> = [];
  if (finished) {
    rows.push({ label: "Bracket", was: bracket(before), now: bracket(after) });
    if (before.analysis.winTurn && after.analysis.winTurn) {
      rows.push({
        label: "Win turn (rough)",
        was: turnRange(before.analysis.winTurn.turn),
        now: turnRange(after.analysis.winTurn.turn),
        better: after.analysis.winTurn.turn === before.analysis.winTurn.turn ? null : after.analysis.winTurn.turn < before.analysis.winTurn.turn,
      });
    }
    if (before.analysis.health && after.analysis.health) {
      rows.push({
        label: "Deck health",
        was: String(before.analysis.health.score),
        now: String(after.analysis.health.score),
        better: after.analysis.health.score === before.analysis.health.score ? null : after.analysis.health.score > before.analysis.health.score,
      });
    }
  }
  const combos = (side: Side) => side.analysis.combos?.included.length ?? 0;
  rows.push({ label: "Combos in the deck", was: String(combos(before)), now: String(combos(after)) });
  const changers = (side: Side) => side.analysis.bracket?.signals.gameChangers ?? 0;
  rows.push({ label: "Game Changers", was: String(changers(before)), now: String(changers(after)) });
  rows.push({
    label: "Price",
    was: formatPrice(before.version.stats.totalPriceUsd),
    now: formatPrice(after.version.stats.totalPriceUsd),
    better: after.version.stats.totalPriceUsd === before.version.stats.totalPriceUsd ? null : after.version.stats.totalPriceUsd < before.version.stats.totalPriceUsd,
  });

  return (
    <section aria-labelledby="shift-heading" className="mb-14">
      <h2 id="shift-heading" className="font-display text-[clamp(44px,5vw,72px)] leading-[0.92]">
        What it did
      </h2>
      <dl className="mt-6 grid max-w-[880px] gap-x-10 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((row) => {
          const changed = row.was !== row.now;
          return (
            <div key={row.label}>
              <dt className="font-mono text-[11px] tracking-[0.12em] text-muted uppercase">{row.label}</dt>
              <dd className="mt-1.5 text-2xl font-medium tracking-[-0.03em]">
                {changed ? (
                  <>
                    <span className="text-muted">{row.was}</span> <span aria-hidden="true">→</span>
                    <span className="sr-only"> to </span>{" "}
                    <span className={row.better === true ? "text-add-text" : row.better === false ? "text-danger" : ""}>{row.now}</span>
                  </>
                ) : (
                  <span>
                    {row.now} <span className="text-sm font-normal text-muted">no change</span>
                  </span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
      {!finished && <p className="mt-4 text-sm text-muted">Bracket, win turn and health show once both versions have {MIN_CARDS} cards.</p>}
    </section>
  );
}
