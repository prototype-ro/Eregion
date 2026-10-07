"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { exploreCommanderUrl } from "@/lib/links";
import { canLead } from "@/lib/legality";
import type { Board, DeckCardLine } from "@/lib/types";

export interface MenuTarget {
  line: DeckCardLine;
  x: number;
  y: number;
}

interface Props {
  target: MenuTarget | null;
  onClose: () => void;
  onPeek: (line: DeckCardLine) => void;
  onPrinting: (line: DeckCardLine) => void;
  onTags: (line: DeckCardLine) => void;
  onQuantity: (line: DeckCardLine, delta: number) => void;
  onMove: (line: DeckCardLine, board: Board) => void;
  onSetCommander: (line: DeckCardLine) => void;
  onSetBackground: (line: DeckCardLine) => void;
  onRemove: (line: DeckCardLine) => void;
  onNotify: (message: string) => void;
}

const item =
  "flex min-h-11 w-full items-center rounded-xl px-3.5 text-left text-[15px] hover:bg-surface focus:bg-surface focus:outline-none";

/** The quick menu for a card, opened from its three dots or by right-clicking it. */
export function CardMenu({ target, onClose, onPeek, onPrinting, onTags, onQuantity, onMove, onSetCommander, onSetBackground, onRemove, onNotify }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const [amount, setAmount] = useState(1);

  // Keep the menu on screen: flip it away from the edges once its size is known.
  useLayoutEffect(() => {
    if (!target || !ref.current) return;
    const { width, height } = ref.current.getBoundingClientRect();
    setPosition({
      left: Math.max(8, Math.min(target.x, window.innerWidth - width - 8)),
      top: Math.max(8, Math.min(target.y, window.innerHeight - height - 8)),
    });
    setAmount(1);
    ref.current.querySelector<HTMLElement>("[role=menuitem]")?.focus();
  }, [target]);

  useEffect(() => {
    if (!target) return;
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key !== "Escape") return;
      if (event instanceof PointerEvent && ref.current?.contains(event.target as Node)) return;
      onClose();
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
    };
  }, [target, onClose]);

  if (!target) return null;
  const { line } = target;
  const isCommander = line.board === "commander";
  const isBackground = line.typeLine.includes("Background");
  const canLeadDeck = canLead(line) && !isBackground;

  const act = (fn: () => void) => () => {
    fn();
    onClose();
  };

  async function copyName() {
    try {
      await navigator.clipboard.writeText(line.name);
      onNotify(`Copied "${line.name}"`);
    } catch {
      onNotify("Could not copy. Select the name and copy it by hand.");
    }
    onClose();
  }

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={`Options for ${line.name}`}
      className="fixed z-50 w-[300px] rounded-3xl border border-line bg-bg p-2 shadow-2xl"
      style={{ left: position.left, top: position.top }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <p className="truncate px-3.5 pt-2 pb-1.5 font-mono text-xs text-muted">{line.name}</p>

      <button role="menuitem" className={item} onClick={act(() => onPeek(line))}>
        Show all details
      </button>
      <button role="menuitem" className={item} onClick={act(() => onPrinting(line))}>
        Change printing
      </button>
      <button role="menuitem" className={item} onClick={act(() => onTags(line))}>
        Edit tags
      </button>
      <button role="menuitem" className={item} onClick={copyName}>
        Copy card name
      </button>

      <div className="my-1.5 border-t border-line" />

      {isBackground && !isCommander && (
        <button role="menuitem" className={item} onClick={act(() => onSetBackground(line))}>
          Set as background
        </button>
      )}
      {canLeadDeck && !isCommander && (
        <button role="menuitem" className={item} onClick={act(() => onSetCommander(line))}>
          Set as commander
        </button>
      )}
      {canLeadDeck && (
        // A new tab keeps an unsaved draft safe.
        <a role="menuitem" className={item} href={exploreCommanderUrl(line.cardId)} target="_blank" rel="noopener noreferrer" onClick={onClose}>
          Find decks with this commander
        </a>
      )}

      {!isCommander && (
        <>
          <div className="my-1.5 border-t border-line" />
          <div className="flex items-center gap-2 px-2 py-1">
            <label htmlFor="menu-amount" className="sr-only">
              Number of copies
            </label>
            <input
              id="menu-amount"
              type="number"
              min={1}
              max={99}
              value={amount}
              onChange={(event) => setAmount(Math.max(1, Math.min(99, Number(event.target.value) || 1)))}
              className="min-h-11 w-16 rounded-full border border-line bg-surface px-3 text-center text-[15px] text-ink focus:border-ink focus:outline-none"
            />
            <button role="menuitem" className="press min-h-11 flex-1 rounded-full bg-accent text-sm font-bold text-on-accent" onClick={act(() => onQuantity(line, amount))}>
              Add
            </button>
            <button role="menuitem" className="pill min-h-11 flex-1 rounded-full border border-ink text-sm font-medium" onClick={act(() => onQuantity(line, -amount))}>
              Remove
            </button>
          </div>
          <button role="menuitem" className={item} onClick={act(() => onMove(line, line.board === "main" ? "maybe" : "main"))}>
            {line.board === "main" ? "Move to maybeboard" : "Move to mainboard"}
          </button>
        </>
      )}
      <button role="menuitem" className={`${item} text-add-text`} onClick={act(() => onRemove(line))}>
        Remove from deck
      </button>
    </div>
  );
}
