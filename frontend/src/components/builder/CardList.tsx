"use client";

import { lineKey, type LineGroup } from "@/lib/groups";
import type { DeckCardLine } from "@/lib/types";

export interface ViewProps {
  groups: LineGroup[];
  selectedKey: string | null;
  /** Keys (card and board) of lines that are not in the opened version. */
  newKeys: Set<string>;
  onSelect: (line: DeckCardLine) => void;
  /** Opens the card menu at a screen position. */
  onMenu: (line: DeckCardLine, x: number, y: number) => void;
  /** When on, cards you do not own are flagged. When off, nothing about the collection shows. */
  checkCollection: boolean;
  /** Minimum card width in pixels for the stacks and gallery views. */
  cardSize: number;
  /** Hides everything that edits: the card menu and its buttons. */
  readOnly?: boolean;
}

export const dotsClass =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl leading-none text-muted hover:bg-surface-2 hover:text-ink focus-visible:bg-surface-2 focus-visible:text-ink";

/** The three dots button that opens a card's menu. */
export function DotsButton({ line, onMenu, className = "" }: { line: DeckCardLine; onMenu: ViewProps["onMenu"]; className?: string }) {
  return (
    <button
      type="button"
      aria-label={`Options for ${line.name}`}
      aria-haspopup="menu"
      onClick={(event) => {
        event.stopPropagation();
        const box = event.currentTarget.getBoundingClientRect();
        onMenu(line, box.right - 300 > 8 ? box.right - 300 : box.left, box.bottom + 4);
      }}
      className={`${dotsClass} ${className}`}
    >
      <span aria-hidden="true">...</span>
    </button>
  );
}

function Row({ line, selected, isNew, checkCollection, readOnly, onSelect, onMenu }: { line: DeckCardLine; selected: boolean; isNew: boolean; checkCollection: boolean; readOnly: boolean; onSelect: ViewProps["onSelect"]; onMenu: ViewProps["onMenu"] }) {
  const needs = checkCollection && line.owned < line.quantity;
  return (
    <li
      className={`group/row flex items-center rounded-xl pr-1 ${selected ? "bg-surface" : ""} hover:bg-surface focus-within:bg-surface`}
      onMouseEnter={() => onSelect(line)}
      onContextMenu={(event) => {
        if (readOnly) return;
        event.preventDefault();
        onMenu(line, event.clientX, event.clientY);
      }}
    >
      <button
        type="button"
        onClick={() => onSelect(line)}
        className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 px-3 py-2 text-left text-[15px]"
      >
        {line.quantity > 1 && <span className="font-mono text-[13px] text-muted">{line.quantity}x</span>}
        <span className="truncate">{line.name}</span>
        {isNew && <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-bold text-on-accent">New</span>}
        {needs && <span className="rounded-full border border-add-line px-2.5 py-0.5 text-xs text-add-text">Need</span>}
      </button>
      {!readOnly && <DotsButton line={line} onMenu={onMenu} className="opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100 [@media(pointer:coarse)]:opacity-100" />}
    </li>
  );
}

export function CardList({ groups, selectedKey, newKeys, checkCollection, readOnly = false, onSelect, onMenu }: ViewProps) {
  if (groups.length === 0) {
    return <p className="max-w-[420px] py-6 text-lg leading-normal text-muted">Nothing here yet. Search above to add cards.</p>;
  }
  return (
    <div className="group-columns">
      {groups.map((group) => (
        <section key={group.title} aria-label={group.title} className="mb-9">
          <header className="flex items-baseline justify-between border-b border-line px-3 pb-2.5">
            <h3 className="text-[17px] font-medium">{group.title}</h3>
            <span className="font-mono text-[13px] text-muted">{group.lines.reduce((sum, line) => sum + line.quantity, 0)}</span>
          </header>
          <ul>
            {group.lines.map((line) => (
              <Row
                key={lineKey(line)}
                line={line}
                selected={selectedKey === lineKey(line)}
                isNew={newKeys.has(lineKey(line))}
                checkCollection={checkCollection}
                readOnly={readOnly}
                onSelect={onSelect}
                onMenu={onMenu}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
