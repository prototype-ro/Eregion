import type { Board, CardAppearance, Timeline } from "./types";

export interface HistoryEvent {
  version: number;
  branch: string;
  /** What changed in this version compared with the version it grew from. */
  changes: string[];
}

export interface CardHistory {
  /** Newest first. */
  events: HistoryEvent[];
  /** The card's appearances in each version that has it. */
  byVersion: Map<number, CardAppearance[]>;
  versionsWith: number;
  versionsTotal: number;
  firstAdded: number | null;
}

const BOARD_NAMES: Record<Board, string> = { commander: "the commander slot", main: "the mainboard", maybe: "the maybeboard", considering: "considering", tokens: "the tokens" };
const board = (name: Board) => BOARD_NAMES[name];
const copies = (n: number) => `${n} ${n === 1 ? "copy" : "copies"}`;

/** Describes what happened to a card between two versions, from its appearances in each. Empty when nothing changed. */
export function describeChange(before: CardAppearance[], after: CardAppearance[]): string[] {
  const was = new Map(before.map((a) => [a.board, a]));
  const now = new Map(after.map((a) => [a.board, a]));
  const boards = [...new Set([...was.keys(), ...now.keys()])];

  const gone = boards.filter((b) => was.has(b) && !now.has(b));
  const came = boards.filter((b) => !was.has(b) && now.has(b));
  const changes: string[] = [];

  // A card that left one board and arrived on another with the same count was moved.
  if (gone.length === 1 && came.length === 1 && was.get(gone[0])!.quantity === now.get(came[0])!.quantity) {
    changes.push(`moved from ${board(gone[0])} to ${board(came[0])}`);
  } else {
    came.forEach((b) => changes.push(`added to ${board(b)}${now.get(b)!.quantity > 1 ? `, ${copies(now.get(b)!.quantity)}` : ""}`));
    gone.forEach((b) => changes.push(`removed from ${board(b)}`));
  }
  for (const b of boards) {
    const a = was.get(b);
    const c = now.get(b);
    if (!a || !c) continue;
    if (a.quantity !== c.quantity) changes.push(`${copies(a.quantity)} to ${copies(c.quantity)}`);
    if (a.printing !== c.printing) changes.push(`printing ${a.printing.toUpperCase()} to ${c.printing.toUpperCase()}`);
    const tagsA = a.tags.map((t) => t.toLowerCase()).sort().join("|");
    const tagsC = c.tags.map((t) => t.toLowerCase()).sort().join("|");
    if (tagsA !== tagsC) changes.push("tags changed");
  }
  return changes;
}

/**
 * Turns a card's appearances into the story of that card: what changed in each version compared with
 * the version it grew from, which versions have it, and when it first arrived.
 */
export function buildHistory(timeline: Timeline, appearances: CardAppearance[]): CardHistory {
  const byVersion = new Map<number, CardAppearance[]>();
  for (const appearance of appearances) {
    byVersion.set(appearance.versionNumber, [...(byVersion.get(appearance.versionNumber) ?? []), appearance]);
  }

  const events: HistoryEvent[] = [];
  let total = 0;
  for (const branch of timeline.branches) {
    for (const version of branch.versions) {
      total += 1;
      const before = version.parentVersion === null ? [] : (byVersion.get(version.parentVersion) ?? []);
      const changes = describeChange(before, byVersion.get(version.versionNumber) ?? []);
      if (changes.length > 0) events.push({ version: version.versionNumber, branch: branch.name, changes });
    }
  }
  events.sort((a, b) => b.version - a.version);

  const withCard = [...byVersion.keys()].sort((a, b) => a - b);
  return { events, byVersion, versionsWith: withCard.length, versionsTotal: total, firstAdded: withCard[0] ?? null };
}
