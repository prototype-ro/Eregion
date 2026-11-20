"use client";

import { DotsThree, Minus, Plus } from "@phosphor-icons/react";
import { copiesLabel, copiesSpoken } from "@/lib/copies";
import { stdIcon } from "@/lib/ui";
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
  /** Skips each group's heading and share bar, for a board too small to benefit from them. */
  hideGroupHeaders?: boolean;
  /** One copy more or fewer, from the row's own stepper. Left out, the list has no stepper. */
  onQuantity?: (line: DeckCardLine, delta: number) => void;
}

/**
 * The three dots button that opens a card's menu, in the standard icon button. Over card art it is the glass style, which is what the
 * standard keeps for a control that floats over art; in the list it is the quiet one. The dots are an icon, so they sit in the exact
 * middle of the circle.
 */
export function DotsButton({
  line,
  onMenu,
  variant = "glass",
  size,
  className = "",
}: {
  line: DeckCardLine;
  onMenu: ViewProps["onMenu"];
  variant?: "glass" | "quiet";
  /** A square size in pixels, for a place too short for the standard 36px, such as a title strip in the stacks. */
  size?: number;
  className?: string;
}) {
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
      className={`${stdIcon("md", variant)} shrink-0 ${variant === "glass" ? "text-ink" : ""} ${className}`}
      style={size ? { width: size, height: size } : undefined}
    >
      <DotsThree size={size ? Math.max(10, Math.round(size * 0.55)) : 20} weight="bold" aria-hidden />
    </button>
  );
}

function Row({ line, selected, isNew, checkCollection, readOnly, showRoles, onSelect, onMenu, onQuantity }: { line: DeckCardLine; selected: boolean; isNew: boolean; checkCollection: boolean; readOnly: boolean; showRoles: boolean; onSelect: ViewProps["onSelect"]; onMenu: ViewProps["onMenu"]; onQuantity?: ViewProps["onQuantity"] }) {
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
        {/* A repeat is the accent colour and heavier, so a glance down the column finds every card that is in the deck more than once. */}
        <span
          className={`w-9 shrink-0 text-right font-mono tabular-nums ${line.quantity > 1 ? "text-[13px] font-bold text-accent-text" : "text-[12px] text-muted/70"}`}
          aria-label={copiesSpoken(line.quantity)}
        >
          {copiesLabel(line.quantity)}
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
      {/* One more or fewer copy without opening the menu. Shown on hover and while a key is on the row, so the list stays quiet. */}
      {!readOnly && onQuantity && line.board !== "commander" && (
        <span className="flex opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100 [@media(pointer:coarse)]:opacity-100">
          <button type="button" onClick={() => onQuantity(line, -1)} aria-label={`One fewer ${line.name}`} className={`${stdIcon("md", "quiet")} -my-px`}>
            <Minus size={14} weight="bold" aria-hidden />
          </button>
          <button type="button" onClick={() => onQuantity(line, 1)} aria-label={`One more ${line.name}`} className={`${stdIcon("md", "quiet")} -my-px`}>
            <Plus size={14} weight="bold" aria-hidden />
          </button>
        </span>
      )}
      {/* Always there, dimmed, so it is clear that a card has a menu. It lights up under the pointer. The row is 34px, so the 36px button takes 1px off each side. */}
      {!readOnly && <DotsButton line={line} onMenu={onMenu} variant="quiet" className="-my-px group-hover/row:text-ink" />}
    </li>
  );
}

/** How many rows a group title keeps with it at the top of a column. */
const KEEP_WITH_TITLE = 2;

export function CardList({ groups, selectedKey, newKeys, checkCollection, readOnly = false, showRoles = false, hideGroupHeaders = false, onSelect, onMenu, onQuantity }: ViewProps) {
  if (groups.length === 0) {
    return <p className="max-w-[420px] py-6 text-lg leading-normal text-muted">Nothing here yet. Search above to add cards.</p>;
  }
  const counts = groups.map((group) => group.lines.reduce((sum, line) => sum + line.quantity, 0));
  const total = counts.reduce((sum, count) => sum + count, 0);
  const renderRow = (line: (typeof groups)[number]["lines"][number]) => (
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
      onQuantity={onQuantity}
    />
  );
  return (
    <div className="group-columns group-flow">
      {groups.map((group, index) => (
        <section key={group.title || index} aria-label={group.title || undefined} className="mb-7">
          {/*
            The title and its first rows travel as one block. Chrome ignores break-after on a title in columns, so
            without this a title could sit alone at the foot of one column with its cards at the top of the next.
          */}
          <div className="group-start">
            {!hideGroupHeaders && (
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
            )}
            <ul>{group.lines.slice(0, KEEP_WITH_TITLE).map(renderRow)}</ul>
          </div>
          {group.lines.length > KEEP_WITH_TITLE && <ul>{group.lines.slice(KEEP_WITH_TITLE).map(renderRow)}</ul>}
        </section>
      ))}
    </div>
  );
}
