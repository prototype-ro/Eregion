"use client";

import { CaretDown } from "@phosphor-icons/react";
import { useState, type ReactNode } from "react";
import { Presence } from "@/components/motion/Presence";
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
 * tokens the deck makes. Each folds away, starts open only when it holds cards, and has its own box to add to it.
 */
export function SideBoards({ boards, renderCards, renderSearch }: Props) {
  // Absent means "as it started": open when the board has cards. Once the person folds or opens one, that choice stands.
  const [chosen, setChosen] = useState<Record<string, boolean>>({});
  return (
    <section id="other-boards" aria-label="Other boards" className="mt-12 scroll-mt-6 border-t border-line pt-6">
      <div className="flex flex-col">
        {boards.map((entry) => {
          const open = chosen[entry.board] ?? entry.count > 0;
          const bodyId = `board-${entry.board}`;
          return (
            <section key={entry.board} aria-label={entry.title} className="border-b border-line last:border-b-0">
              <h3>
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={bodyId}
                  onClick={() => setChosen((current) => ({ ...current, [entry.board]: !open }))}
                  className="flex min-h-11 w-full items-baseline gap-2.5 px-2.5 py-3 text-left hover:bg-surface/60"
                >
                  <span className="text-[17px] font-medium">{entry.title}</span>
                  <span className="font-mono text-[13px] font-normal text-muted">{entry.count}</span>
                  <CaretDown size={14} aria-hidden className={`ml-auto self-center text-muted transition-transform duration-300 motion-reduce:transition-none ${open ? "rotate-180" : ""}`} />
                </button>
              </h3>
              <Presence show={open} collapse id={bodyId}>
                <div className="px-2.5 pt-1 pb-6">
                  <div className="mb-4 w-full sm:w-[320px]">{renderSearch(entry.board)}</div>
                  {entry.groups.length === 0 ? <p className="text-sm text-muted">{entry.hint}</p> : renderCards(entry.groups)}
                </div>
              </Presence>
            </section>
          );
        })}
      </div>
    </section>
  );
}
