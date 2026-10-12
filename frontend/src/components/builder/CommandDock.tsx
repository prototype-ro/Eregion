"use client";

import { MagnifyingGlass, SlidersHorizontal } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { btn } from "@/lib/ui";

interface Props {
  /** Slides in once the deck itself is on screen. */
  shown: boolean;
  /** The box that adds a card to the deck. Its results open upward. */
  search: ReactNode;
  /** The list, stacks and gallery switch. */
  views: ReactNode;
  /** The controls behind the Display button: grouping, sorting, collection and size. */
  display: ReactNode;
  /** The boards beside the deck, with how many cards each holds. */
  boards: Array<{ board: string; title: string; count: number }>;
  /** Save and Save new version, or a quiet note when there is nothing to save. */
  save: ReactNode;
}

/**
 * One glass bar fixed to the bottom of the deck page. Search, the view, the display options, the other boards and Save all live
 * here, so the top of the page can stay about the deck and the cards get the screen.
 */
export function CommandDock({ shown, search, views, display, boards, save }: Props) {
  const [open, setOpen] = useState(false);
  const holder = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (!holder.current?.contains(event.target as Node)) setOpen(false);
    };
    const key = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  return (
    <div inert={!shown} className={`pointer-events-none fixed inset-x-3 bottom-3 z-40 flex justify-center transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none ${shown ? "" : "translate-y-6 opacity-0"}`}>
      <div className="dock pointer-events-auto relative flex w-full max-w-[1040px] items-center gap-1.5 rounded-full p-1.5 pl-4 sm:gap-2">
        <MagnifyingGlass size={18} aria-hidden className="shrink-0 text-muted" />
        <div className="min-w-[120px] flex-1 sm:min-w-[220px]">{search}</div>
        <span aria-hidden="true" className="hidden h-5 w-px bg-line sm:block" />
        <div className="hidden sm:block">{views}</div>
        <div ref={holder} className="relative">
          <button type="button" aria-expanded={open} aria-controls="display-options" aria-label="Display options" onClick={() => setOpen((value) => !value)} className={`${btn.quiet} gap-1.5 px-3 text-sm`}>
            <SlidersHorizontal size={18} aria-hidden />
            <span className="hidden md:inline">Display</span>
          </button>
          {open && (
            <div id="display-options" className="absolute right-0 bottom-full mb-3 flex w-[min(340px,86vw)] flex-col gap-4 rounded-3xl border border-line bg-bg p-5 text-sm shadow-2xl">
              <div className="sm:hidden">{views}</div>
              {display}
            </div>
          )}
        </div>
        {boards.length > 0 && (
          <nav aria-label="Other boards" className="hidden items-center 2xl:flex">
            {boards.map((entry) => (
              <button
                key={entry.board}
                type="button"
                onClick={() => document.getElementById("other-boards")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                className={`${btn.quiet} gap-1.5 px-2.5 text-xs`}
              >
                {entry.title}
                <span className="font-mono text-muted">{entry.count}</span>
              </button>
            ))}
          </nav>
        )}
        {boards.length > 0 && (
          <button
            type="button"
            onClick={() => document.getElementById("other-boards")?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className={`${btn.quiet} hidden gap-1.5 px-2.5 text-xs md:inline-flex 2xl:hidden`}
          >
            Boards
            <span className="font-mono text-muted">{boards.reduce((sum, entry) => sum + entry.count, 0)}</span>
          </button>
        )}
        <div className="flex shrink-0 items-center gap-1.5">{save}</div>
      </div>
    </div>
  );
}
