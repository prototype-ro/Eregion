"use client";

import type { ReactNode } from "react";
import type { LineGroup } from "@/lib/groups";
import type { Board } from "@/lib/types";

export interface SideBoard {
  board: Exclude<Board, "commander" | "main">;
  title: string;
  /** Shown when the board is empty. */
  hint: string;
  count: number;
  groups: LineGroup[];
}

interface Props {
  boards: SideBoard[];
  /** Draws the cards of one board the way the deck is being viewed. */
  renderCards: (groups: LineGroup[]) => ReactNode;
  /** The box that adds a card to that board. */
  renderSearch: (board: SideBoard["board"]) => ReactNode;
}

/**
 * The boards that sit beside the deck and are not part of its hundred cards: the maybeboard, the cards being considered, and the
 * tokens the deck makes. Each shows its cards the same way as the deck and has its own box to add to it.
 */
export function SideBoards({ boards, renderCards, renderSearch }: Props) {
  return (
    <section id="other-boards" aria-label="Other boards" className="mt-16 scroll-mt-6 border-t border-line pt-10">
      <h2 className="font-display text-[clamp(40px,5vw,64px)] leading-none">Other boards</h2>
      <p className="mt-3 max-w-[60ch] text-sm text-muted">Cards you are weighing, and tokens the deck makes. They do not count toward the hundred.</p>
      <div className="mt-8 flex flex-col gap-10">
        {boards.map((entry) => (
          <section key={entry.board} aria-label={entry.title}>
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-line pb-3">
              <h3 className="flex items-baseline gap-2.5 text-[20px] font-medium">
                {entry.title}
                <span className="font-mono text-[13px] font-normal text-muted">{entry.count}</span>
              </h3>
              <div className="w-full sm:w-[320px]">{renderSearch(entry.board)}</div>
            </div>
            <div className="pt-5">
              {entry.groups.length === 0 ? <p className="py-3 text-sm text-muted">{entry.hint}</p> : renderCards(entry.groups)}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
