"use client";

import { DotsThree } from "@phosphor-icons/react";
import { lineKey, type LineGroup } from "@/lib/groups";
import type { DeckCardLine } from "@/lib/types";

export interface ViewProps {
  groups: LineGroup[];
  selectedKey: string | null;
  /** Keys (card and board) of lines that are not in the opened version. */
  newKeys: Set<string>;
  /** via says whether the card was hovered or deliberately clicked or tapped. */
  onSelect: (line: DeckCardLine, via?: "hover" | "click") => void;
  /** Opens the card menu at a screen position. */
  onMenu: (line: DeckCardLine, x: number, y: number) => void;
  /** When on, cards you do not own are flagged. When off, nothing about the collection shows. */
  checkCollection: boolean;
  /** Minimum card width in pixels for the stacks and gallery views. */
  cardSize: number;
  /** Hides everything that edits: the card menu and its buttons. */
  readOnly?: boolean;
  /** Shows a small badge for each of a card's other roles. */
  showRoles?: boolean;
}

export const dotsClass =
  "flex size-9 [@media(pointer:coarse)]:size-11 shrink-0 items-center justify-center rounded-full text-xl leading-none text-muted hover:bg-surface-2 hover:text-ink focus-visible:bg-surface-2 focus-visible:text-ink";

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

function Row({ line, selected, isNew, checkCollection, readOnly, showRoles, onSelect, onMenu }: { line: DeckCardLine; selected: boolean; isNew: boolean; checkCollection: boolean; readOnly: boolean; showRoles: boolean; onSelect: ViewProps["onSelect"]; onMenu: ViewProps["onMenu"] }) {
  const needs = checkCollection && line.owned < line.quantity;
  return (
    <li
      data-line-key={lineKey(line)}
      className={`group/row flex items-center gap-1 pr-1 ${selected ? "rounded-xl bg-surface" : ""} hover:bg-surface focus-within:bg-surface`}
      onMouseEnter={() => onSelect(line, "hover")}
      onContextMenu={(event) => {
        if (readOnly) return;
        event.preventDefault();
        onMenu(line, event.clientX, event.clientY);
      }}
    >
      <button
        type="button"
        onClick={() => onSelect(line, "click")}
        className="flex min-h-[34px] min-w-0 flex-1 items-center gap-2.5 px-2.5 py-1 text-left text-[14px] leading-snug [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:text-[15px]"
      >
        <span className={`w-5 shrink-0 text-right font-mono text-[12px] ${line.quantity > 1 ? "text-ink" : "text-muted"}`} aria-label={`${line.quantity} ${line.quantity === 1 ? "copy" : "copies"}`}>
          {line.quantity}
        </span>
        <span className="flex min-w-0 flex-col gap-1">
          <span className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="min-w-0">{line.name}</span>
            {isNew && <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-bold text-on-accent">New</span>}
            {needs && <span className="rounded-full border border-add-line px-2.5 py-0.5 text-xs text-add-text">Need</span>}
          </span>
          {showRoles && line.secondaryRoles.length > 0 && (
            <span className="flex flex-wrap gap-1" aria-label={`Also: ${line.secondaryRoles.join(", ")}`}>
              {line.secondaryRoles.map((role) => (
                <span key={role} title={`Also ${role}`} className="rounded-full border border-line px-2 py-px text-xs leading-normal text-muted">
                  {role}
                </span>
              ))}
            </span>
          )}
        </span>
      </button>
      {/* Always there, dimmed, so it is clear that a card has a menu. It lights up under the pointer. */}
      {!readOnly && (
        <button
          type="button"
          aria-label={`Options for ${line.name}`}
          aria-haspopup="menu"
          onClick={(event) => {
            event.stopPropagation();
            const box = event.currentTarget.getBoundingClientRect();
            onMenu(line, box.right - 300 > 8 ? box.right - 300 : box.left, box.bottom + 4);
          }}
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-ink focus-visible:bg-surface-2 focus-visible:text-ink group-hover/row:text-ink [@media(pointer:coarse)]:size-11"
        >
          <DotsThree size={20} weight="bold" aria-hidden />
        </button>
      )}
    </li>
  );
}

export function CardList({ groups, selectedKey, newKeys, checkCollection, readOnly = false, showRoles = false, onSelect, onMenu }: ViewProps) {
  if (groups.length === 0) {
    return <p className="max-w-[420px] py-6 text-lg leading-normal text-muted">Nothing here yet. Search above to add cards.</p>;
  }
  const counts = groups.map((group) => group.lines.reduce((sum, line) => sum + line.quantity, 0));
  const total = counts.reduce((sum, count) => sum + count, 0);
  return (
    <div className="group-columns group-flow">
      {groups.map((group, index) => (
        <section key={group.title} aria-label={group.title} className="mb-7">
          <header className="px-2.5 pb-2">
            <div className="flex items-baseline gap-2.5">
              <h3 className="text-[17px] font-medium">{group.title}</h3>
              <span className="font-mono text-[13px] text-muted">{counts[index]}</span>
            </div>
            {/* How much of the whole this group is, on the dot grid. */}
            <div aria-hidden="true" className="dotted mt-2 h-2 rounded-full">
              <div className="h-full rounded-full bg-accent-text/70" style={{ width: `${Math.max(4, (counts[index] / total) * 100)}%` }} />
            </div>
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
                showRoles={showRoles}
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
