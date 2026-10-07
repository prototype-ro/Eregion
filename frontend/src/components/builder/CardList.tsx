"use client";

import { lineKey, type LineGroup } from "@/lib/groups";
import type { Board, DeckCardLine } from "@/lib/types";

interface Props {
  groups: LineGroup[];
  selectedKey: string | null;
  /** Keys (card and board) of lines that are not in the last saved version. */
  newKeys: Set<string>;
  onSelect: (line: DeckCardLine) => void;
  onQuantity: (line: DeckCardLine, delta: number) => void;
  onRemove: (line: DeckCardLine) => void;
  onMove: (line: DeckCardLine, board: Board) => void;
}

function Row({
  line,
  selected,
  isNew,
  onSelect,
  onQuantity,
  onRemove,
  onMove,
}: {
  line: DeckCardLine;
  selected: boolean;
  isNew: boolean;
  onSelect: Props["onSelect"];
  onQuantity: Props["onQuantity"];
  onRemove: Props["onRemove"];
  onMove: Props["onMove"];
}) {
  const needs = line.owned < line.quantity;
  const isCommander = line.board === "commander";
  const stepper = "flex h-11 w-11 items-center justify-center rounded-full border border-line text-lg leading-none";

  return (
    <li
      className={`group/row rounded-xl ${selected ? "bg-surface" : ""} hover:bg-surface focus-within:bg-surface`}
      onMouseEnter={() => onSelect(line)}
    >
      <div className="flex min-h-11 items-center px-3 py-1">
        <button
          type="button"
          onClick={() => onSelect(line)}
          className="flex min-w-0 items-center gap-2.5 py-2 text-left text-[15px]"
        >
          {line.quantity > 1 && <span className="font-mono text-[13px] text-muted">{line.quantity}x</span>}
          <span className="truncate">{line.name}</span>
          {isNew && (
            <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-bold text-on-accent">New</span>
          )}
          {needs && (
            <span className="rounded-full border border-add-line px-2.5 py-0.5 text-xs text-add-text">Need</span>
          )}
        </button>
      </div>

      <div className="hidden flex-wrap gap-2 px-3 pb-2 group-focus-within/row:flex group-hover/row:flex">
        {!isCommander && (
          <>
            <button type="button" aria-label={`Remove one ${line.name}`} onClick={() => onQuantity(line, -1)} className={stepper}>
              -
            </button>
            <button type="button" aria-label={`Add one ${line.name}`} onClick={() => onQuantity(line, 1)} className={stepper}>
              +
            </button>
            <button
              type="button"
              onClick={() => onMove(line, line.board === "main" ? "maybe" : "main")}
              className="min-h-11 rounded-full border border-line px-4 text-sm"
            >
              {line.board === "main" ? "Move to maybeboard" : "Move to mainboard"}
            </button>
          </>
        )}
        <button type="button" onClick={() => onRemove(line)} className="min-h-11 rounded-full border border-line px-4 text-sm">
          Remove
        </button>
      </div>
    </li>
  );
}

export function CardList({ groups, selectedKey, newKeys, ...handlers }: Props) {
  if (groups.length === 0) {
    return <p className="max-w-[420px] py-6 text-lg leading-normal text-muted">Nothing here yet. Search above to add cards.</p>;
  }
  return (
    <div className="group-columns">
      {groups.map((group) => (
        <section key={group.title} aria-label={group.title} className="mb-9">
          <header className="flex items-baseline justify-between border-b border-line px-3 pb-2.5">
            <h3 className="text-[17px] font-medium">{group.title}</h3>
            <span className="font-mono text-[13px] text-muted">
              {group.lines.reduce((sum, line) => sum + line.quantity, 0)}
            </span>
          </header>
          <ul>
            {group.lines.map((line) => (
              <Row
                key={lineKey(line)}
                line={line}
                selected={selectedKey === lineKey(line)}
                isNew={newKeys.has(lineKey(line))}
                {...handlers}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
