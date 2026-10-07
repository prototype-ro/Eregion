import type { DeckCardLine, DeckStats } from "./types";

/**
 * Client-side twin of the backend StatsCalculator, so the builder can show live stats
 * while a draft is being edited. The backend stays the source of truth for saved versions.
 */
export const CURVE_BUCKETS = 7;

const COUNTED = new Set(["commander", "main"]);
const TYPE_ORDER = ["Creature", "Planeswalker", "Instant", "Sorcery", "Artifact", "Enchantment", "Land", "Battle", "Other"];

export function isCounted(board: string): boolean {
  return COUNTED.has(board);
}

const round2 = (value: number) => Math.round(value * 100) / 100;

export function computeStats(lines: DeckCardLine[]): DeckStats {
  let total = 0;
  let lands = 0;
  let owned = 0;
  let nonLand = 0;
  let manaValueSum = 0;
  const curve = new Array<number>(CURVE_BUCKETS).fill(0);
  const counts = new Map<string, number>();

  for (const line of lines) {
    if (!isCounted(line.board)) continue;
    total += line.quantity;
    owned += Math.min(line.quantity, line.owned);
    counts.set(line.primaryType, (counts.get(line.primaryType) ?? 0) + line.quantity);

    if (line.primaryType === "Land") {
      lands += line.quantity;
    } else {
      nonLand += line.quantity;
      manaValueSum += line.manaValue * line.quantity;
      curve[Math.min(Math.floor(line.manaValue), CURVE_BUCKETS - 1)] += line.quantity;
    }
  }

  const types: Record<string, number> = {};
  for (const type of TYPE_ORDER) {
    const count = counts.get(type);
    if (count) types[type] = count;
  }
  for (const [type, count] of counts) {
    if (!(type in types) && count) types[type] = count;
  }

  return {
    totalCards: total,
    averageManaValue: nonLand === 0 ? 0 : round2(manaValueSum / nonLand),
    curve,
    types,
    lands,
    owned,
    missing: total - owned,
  };
}
