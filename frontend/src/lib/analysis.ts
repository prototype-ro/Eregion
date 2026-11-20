import type { DeckCardLine } from "./types";

/** Only these boards are part of the deck, so only they are analysed. */
const ANALYSED = new Set(["commander", "main"]);

export interface AnalysisRequest {
  cards: Array<{ cardId: string; board: string; quantity: number }>;
}

/** What the server needs to analyse a deck: ids, boards and counts, nothing else. */
export function analysisRequest(lines: DeckCardLine[]): AnalysisRequest {
  const cards = lines
    .filter((line) => ANALYSED.has(line.board) && line.quantity > 0)
    .map((line) => ({ cardId: line.cardId, board: line.board, quantity: Math.min(line.quantity, 99) }));
  return { cards };
}

/** The same deck in any order gives the same key, so a deck edited back to an earlier shape reuses that answer. */
export function analysisKey(request: AnalysisRequest): string {
  return request.cards
    .map((card) => `${card.board}:${card.cardId}:${card.quantity}`)
    .sort()
    .join("|");
}

/** A probability from 0 to 1 as a whole percent. Never shows 0% or 100% for a chance that is not quite that. */
export function percent(probability: number): string {
  const whole = Math.round(probability * 100);
  if (whole <= 0 && probability > 0) return "<1%";
  if (whole >= 100 && probability < 1) return ">99%";
  return `${whole}%`;
}

/** "Opening hand" style wording of how a chance reads, for a screen reader and a quick glance. */
export function chanceWord(probability: number): "low" | "fair" | "good" | "very good" {
  if (probability < 0.5) return "low";
  if (probability < 0.75) return "fair";
  if (probability < 0.9) return "good";
  return "very good";
}

/** The basis codes the server sends, in words. An unknown code is shown as it is rather than hidden. */
export function basisLabel(basis: string): string {
  switch (basis) {
    case "speed":
      return "Set by how fast the deck looks";
    case "game_changers":
      return "Set by its Game Changers";
    case "mass_land_denial":
      return "Set by mass land denial";
    case "extra_turns":
      return "Set by chained extra turns";
    case "combo":
      return "Set by a two-card combo";
    default:
      return basis;
  }
}

/** The slowest and fastest turns the win turn bar shows. Each of its five brackets covers two turns, so a turn maps to a place in a straight line. */
export const SLOWEST_TURN = 12;
export const FASTEST_TURN = 2;

/** Where a turn sits on the win turn bar, as a percent from the left (slow side) to the right (fast side). */
export function turnPosition(turn: number): number {
  const share = (SLOWEST_TURN - turn) / (SLOWEST_TURN - FASTEST_TURN);
  return Math.round(Math.min(1, Math.max(0, share)) * 1000) / 10;
}

export type Tone = "good" | "fair" | "poor";

/** How a 0 to 100 health score reads, for its colour and for a screen reader. */
export function healthTone(score: number): Tone {
  if (score >= 75) return "good";
  if (score >= 50) return "fair";
  return "poor";
}

/** How strongly a step of a scale of `steps` takes the accent: 0.4 at the first step, 1 at the last. */
export function stepStrength(step: number, steps: number): number {
  const share = steps <= 1 ? 1 : Math.min(1, Math.max(0, step / (steps - 1)));
  return Math.round((0.4 + 0.6 * share) * 100) / 100;
}

/** "turn 6.8" as a short phrase, trimming a pointless ".0". */
export function turnLabel(turn: number): string {
  return Number.isInteger(turn) ? String(turn) : turn.toFixed(1);
}

/**
 * The estimated win turn as the range it really is. The estimate is a reading of signals, good to about a turn either
 * way, so "7.3" claimed a precision it does not have: it reads "7 to 8".
 */
export function turnRange(turn: number): string {
  const low = Math.max(1, Math.round(turn - 0.75));
  const high = Math.max(low + 1, Math.round(turn + 0.75));
  return `${low}–${high}`;
}

/** The word for a health score, so the ring never has to carry the meaning on its colour alone. */
export function healthWord(score: number): string {
  const tone = healthTone(score);
  return tone === "good" ? "Healthy" : tone === "fair" ? "Fair" : "Needs work";
}
