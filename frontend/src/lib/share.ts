import type { AnalysisBracket, AnalysisCombos } from "./types";

const bracketWord = (n: number) => (n === 5 ? "cEDH" : `bracket ${n}`);

/**
 * A short, plain summary of why a deck is the bracket it is, for the Rule 0 talk before a game: the rules that set
 * its floor with their cards, the speed estimate, the combos, and what the owner says. Plain text, so it pastes into
 * any chat.
 */
export function bracketSummary(deckName: string, bracket: AnalysisBracket, combos: AnalysisCombos | null, declared: number | null | undefined): string {
  const lines = [`${deckName}: ${bracketWord(bracket.bracket)} (${bracket.name}).`];
  if (declared) lines.push(`Owner calls it ${bracketWord(declared)}.`);
  const s = bracket.signals;
  lines.push(
    `Game Changers: ${s.gameChangers ? `${s.gameChangers} (${s.gameChangerCards.join(", ")})` : "none"}. ` +
      `Mass land denial: ${s.massLandDenial ? s.massLandDenialCards.join(", ") : "none"}. ` +
      `Extra turns: ${s.extraTurns ? s.extraTurnCards.join(", ") : "none"}.`,
  );
  if (combos?.available) {
    const names = combos.included.map((combo) => combo.cards.join(" + "));
    lines.push(`Combos: ${names.length ? names.join("; ") : "none found"}.`);
  }
  lines.push(`Rules floor ${bracket.floor}, speed estimate ${bracket.estimated} (a rough guess).`);
  return lines.join("\n");
}

/** One paste for a group chat: the deck, its facts and the link, readable without opening it. */
export function discordText(deck: {
  name: string;
  ownerName: string;
  commanderName: string | null;
  versionNumber: number;
  cardCount: number;
  priceUsd: number;
  bracket?: number | null;
  declaredBracket?: number | null;
}, url: string): string {
  const facts = [
    deck.commanderName ?? "No commander",
    `v${deck.versionNumber}`,
    `${deck.cardCount} cards`,
    deck.bracket ? (deck.bracket === 5 ? "cEDH" : `Bracket ${deck.bracket}`) : null,
    deck.declaredBracket ? `owner says ${bracketWord(deck.declaredBracket)}` : null,
    `$${Math.round(deck.priceUsd)}`,
  ].filter(Boolean);
  return `**${deck.name}** by ${deck.ownerName}\n${facts.join(" · ")}\n${url}`;
}
