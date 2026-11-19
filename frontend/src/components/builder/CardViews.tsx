"use client";

import Image from "next/image";
import { useState } from "react";
import { copiesLabel, copiesSpoken, pileEdges } from "@/lib/copies";
import { lineKey, type LineGroup } from "@/lib/groups";
import type { DeckCardLine } from "@/lib/types";
import { STD_TAG } from "@/lib/ui";
import { DotsButton, type ViewProps } from "./CardList";

const CARD_RATIO = "aspect-[488/680]";
/** The title bar is about this share of a card's width, so a stack keeps showing just the titles at any size. */
const STRIP_RATIO = 0.163;

function Empty() {
  return <p className="max-w-[420px] py-6 text-lg leading-normal text-muted">Nothing here yet. Search above to add cards.</p>;
}

function GroupHeader({ group }: { group: LineGroup }) {
  return (
    <header className="mb-4 flex items-baseline justify-between border-b border-line pb-2.5">
      <h3 className="text-[17px] font-medium">{group.title}</h3>
      <span className="font-mono text-[13px] text-muted">{group.lines.reduce((sum, line) => sum + line.quantity, 0)}</span>
    </header>
  );
}

/** With the collection check on, cards you do not own are dimmed so what is missing reads at a glance. */
function art(line: DeckCardLine, checkCollection: boolean) {
  return checkCollection && line.owned < line.quantity ? "grayscale opacity-60" : "";
}

/** The count of a repeated card, in the accent so it reads at once. */
function CopiesPill({ quantity, compact = false }: { quantity: number; compact?: boolean }) {
  if (quantity <= 1) return null;
  return (
    <span aria-hidden="true" className={`${STD_TAG.overArt} ${compact ? "px-1.5 py-px text-[11px]" : "px-2.5 py-0.5 text-[13px]"}`}>
      {copiesLabel(quantity)}
    </span>
  );
}

function Badges({ line, isNew }: { line: DeckCardLine; isNew: boolean }) {
  return (
    <>
      <CopiesPill quantity={line.quantity} compact />
      {isNew && <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-on-accent">New</span>}
    </>
  );
}

/** A group heading with a dotted bar that shows how much of the deck the group is. */
function ShareHeader({ group, share }: { group: LineGroup; share: number }) {
  return (
    <header className="mb-2.5">
      <div className="flex items-baseline gap-2">
        <h3 className="text-[15px] font-medium">{group.title}</h3>
        <span className="font-mono text-xs text-muted">{group.lines.reduce((sum, line) => sum + line.quantity, 0)}</span>
      </div>
      <div aria-hidden="true" className="dotted mt-1.5 h-1.5 rounded-full">
        <div className="h-full rounded-full bg-accent-text/70" style={{ width: `${Math.max(4, share * 100)}%` }} />
      </div>
    </header>
  );
}

/**
 * Piles of overlapping cards, packed into columns so short piles share a column. Each card shows its title bar and the
 * last one shows in full. Clicking a card that is buried under others brings it to the front and floats it over its
 * neighbors without moving anything. Clicking it again puts it back.
 */
export function CardStacks({ groups, selectedKey, newKeys, checkCollection, cardSize, readOnly = false, hideGroupHeaders = false, onSelect, onMenu }: ViewProps) {
  const [raised, setRaised] = useState<string | null>(null);
  if (groups.length === 0) return <Empty />;
  const strip = Math.round(cardSize * STRIP_RATIO);
  // The card menu button has to fit in the strip, or the next card in the pile cuts it off: the standard 36px where there is room,
  // smaller on a short strip, and always a little air above and below.
  const menuSize = Math.min(36, Math.max(16, strip - 6));
  const total = groups.reduce((sum, group) => sum + group.lines.reduce((n, line) => n + line.quantity, 0), 0);

  return (
    <div style={{ columnWidth: cardSize, columnGap: 32 }}>
      {groups.map((group, index) => (
        <section key={group.title || index} aria-label={group.title || undefined} className="mb-8 break-inside-avoid">
          {!hideGroupHeaders && <ShareHeader group={group} share={group.lines.reduce((n, line) => n + line.quantity, 0) / Math.max(1, total)} />}
          <ul className="flex flex-col">
            {group.lines.map((line, index) => {
              const last = index === group.lines.length - 1;
              const key = lineKey(line);
              const front = raised === `${group.title}|${key}`;
              return (
                <li
                  key={key}
                  data-line-key={key}
                  style={last ? undefined : { height: strip }}
                  className={`${front ? "relative z-20" : last ? "" : "overflow-hidden"}`}
                  onContextMenu={(event) => {
                    if (readOnly) return;
                    event.preventDefault();
                    onMenu(line, event.clientX, event.clientY);
                  }}
                >
                  <div className="group/stack relative">
                    <button
                      type="button"
                      onClick={() => {
                        // The first tap raises a card out of the stack; tapping the raised card opens it.
                        onSelect(line, front ? "click" : "hover");
                        setRaised(front ? null : `${group.title}|${key}`);
                      }}
                      onMouseEnter={() => onSelect(line, "hover")}
                      aria-label={`${line.name}${line.quantity > 1 ? `, ${copiesSpoken(line.quantity)}` : ""}`}
                      aria-pressed={front}
                      className={`block w-full rounded-[10px] text-left ${
                        front ? "shadow-[0_18px_40px_rgba(0,0,0,0.55)]" : "shadow-[0_-2px_6px_rgba(0,0,0,0.25)]"
                      }`}
                    >
                      <div className={`relative w-full overflow-hidden rounded-[10px] bg-surface ${CARD_RATIO}`}>
                        {line.imageNormal && <Image src={line.imageNormal} alt="" fill sizes="400px" className={`object-cover ${art(line, checkCollection)}`} />}
                        {/* Drawn inside the card, because a card in the stack is cut to its visible strip and an outside outline would be cut with it. */}
                        {selectedKey === key && <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[10px] ring-[3px] ring-accent-text ring-inset" />}
                      </div>
                    </button>
                    <span className="pointer-events-none absolute top-0 right-1.5 flex items-center gap-1" style={{ height: strip }}>
                      <Badges line={line} isNew={newKeys.has(key)} />
                      {!readOnly && (
                        <span className="pointer-events-auto opacity-0 group-focus-within/stack:opacity-100 group-hover/stack:opacity-100">
                          <DotsButton line={line} onMenu={onMenu} size={menuSize} />
                        </span>
                      )}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Every card as a full image. The image already shows the title, so the name is only in the accessible label. */
export function CardGallery({ groups, selectedKey, newKeys, checkCollection, cardSize, readOnly = false, hideGroupHeaders = false, onSelect, onMenu }: ViewProps) {
  if (groups.length === 0) return <Empty />;

  return (
    <div className="flex flex-col gap-12">
      {groups.map((group, index) => (
        <section key={group.title || index} aria-label={group.title || undefined}>
          {!hideGroupHeaders && <GroupHeader group={group} />}
          <ul className="grid gap-5" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${cardSize}px, 1fr))` }}>
            {group.lines.map((line) => {
              const key = lineKey(line);
              const needs = checkCollection && line.owned < line.quantity;
              return (
                <li
                  key={key}
                  data-line-key={key}
                  className="group/card relative"
                  onMouseEnter={() => onSelect(line, "hover")}
                  onContextMenu={(event) => {
                    if (readOnly) return;
                    event.preventDefault();
                    onMenu(line, event.clientX, event.clientY);
                  }}
                >
                  {/* Repeated cards sit on a small pile: the edges of one or two more cards peek out behind, so a repeat is seen without reading anything. */}
                  {pileEdges(line.quantity) === 2 && <span aria-hidden="true" className="absolute inset-0 translate-x-3 translate-y-3 rounded-[14px] border border-line bg-surface" />}
                  {pileEdges(line.quantity) >= 1 && <span aria-hidden="true" className="absolute inset-0 translate-x-1.5 translate-y-1.5 rounded-[14px] border border-line bg-surface-2" />}
                  <button
                    type="button"
                    onClick={() => onSelect(line, "click")}
                    aria-label={`${line.name}${line.quantity > 1 ? `, ${copiesSpoken(line.quantity)}` : ""}${needs ? ", not owned" : ""}`}
                    className={`relative block w-full rounded-[14px] ${selectedKey === key ? "outline-2 outline-offset-2 outline-accent-text" : ""}`}
                  >
                    <div className={`relative w-full overflow-hidden rounded-[14px] bg-surface ${CARD_RATIO}`}>
                      {line.imageNormal && <Image src={line.imageNormal} alt="" fill sizes="400px" className={`object-cover ${art(line, checkCollection)}`} />}
                    </div>
                  </button>
                  {/* On the bottom edge, over the artist line and not the name or the cost, and over the pile's edges so the two read together. */}
                  <span className="pointer-events-none absolute -bottom-3 left-1/2 -translate-x-1/2">
                    <CopiesPill quantity={line.quantity} />
                  </span>
                  <span className="pointer-events-none absolute top-2 right-2 flex items-center gap-1">
                    {newKeys.has(key) && <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-on-accent">New</span>}
                    {needs && <span className="rounded-full border border-add-line bg-bg px-2 py-0.5 text-xs text-add-text">Need</span>}
                    {!readOnly && (
                      <span className="pointer-events-auto opacity-0 group-focus-within/card:opacity-100 group-hover/card:opacity-100">
                        <DotsButton line={line} onMenu={onMenu} />
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
