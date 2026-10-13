"use client";

import Image from "next/image";
import { useState } from "react";
import { lineKey, type LineGroup } from "@/lib/groups";
import type { DeckCardLine } from "@/lib/types";
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

function Badges({ line, isNew }: { line: DeckCardLine; isNew: boolean }) {
  return (
    <>
      {line.quantity > 1 && <span className="rounded-full bg-bg px-2 py-0.5 font-mono text-xs text-ink">{line.quantity}x</span>}
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
export function CardStacks({ groups, selectedKey, newKeys, checkCollection, cardSize, readOnly = false, onSelect, onMenu }: ViewProps) {
  const [raised, setRaised] = useState<string | null>(null);
  if (groups.length === 0) return <Empty />;
  const strip = Math.round(cardSize * STRIP_RATIO);
  const total = groups.reduce((sum, group) => sum + group.lines.reduce((n, line) => n + line.quantity, 0), 0);

  return (
    <div style={{ columnWidth: cardSize, columnGap: 32 }}>
      {groups.map((group) => (
        <section key={group.title} aria-label={group.title} className="mb-8 break-inside-avoid">
          <ShareHeader group={group} share={group.lines.reduce((n, line) => n + line.quantity, 0) / Math.max(1, total)} />
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
                      aria-label={`${line.name}${line.quantity > 1 ? `, ${line.quantity} copies` : ""}`}
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
                    <span className="pointer-events-none absolute top-1 right-1 flex items-center gap-1">
                      <Badges line={line} isNew={newKeys.has(key)} />
                      {!readOnly && (
                        <span className="pointer-events-auto opacity-0 group-focus-within/stack:opacity-100 group-hover/stack:opacity-100">
                          <DotsButton line={line} onMenu={onMenu} className="h-8! w-8! [@media(pointer:coarse)]:h-11! [@media(pointer:coarse)]:w-11! bg-bg/90 text-ink" />
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
export function CardGallery({ groups, selectedKey, newKeys, checkCollection, cardSize, readOnly = false, onSelect, onMenu }: ViewProps) {
  if (groups.length === 0) return <Empty />;

  return (
    <div className="flex flex-col gap-12">
      {groups.map((group) => (
        <section key={group.title} aria-label={group.title}>
          <GroupHeader group={group} />
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
                  <button
                    type="button"
                    onClick={() => onSelect(line, "click")}
                    aria-label={`${line.name}${line.quantity > 1 ? `, ${line.quantity} copies` : ""}${needs ? ", not owned" : ""}`}
                    className={`relative block w-full rounded-[14px] ${selectedKey === key ? "outline-2 outline-offset-2 outline-accent-text" : ""}`}
                  >
                    <div className={`relative w-full overflow-hidden rounded-[14px] bg-surface ${CARD_RATIO}`}>
                      {line.imageNormal && <Image src={line.imageNormal} alt="" fill sizes="400px" className={`object-cover ${art(line, checkCollection)}`} />}
                    </div>
                  </button>
                  <span className="pointer-events-none absolute top-2 right-2 flex items-center gap-1">
                    <Badges line={line} isNew={newKeys.has(key)} />
                    {needs && <span className="rounded-full border border-add-line bg-bg px-2 py-0.5 text-xs text-add-text">Need</span>}
                    {!readOnly && (
                      <span className="pointer-events-auto opacity-0 group-focus-within/card:opacity-100 group-hover/card:opacity-100">
                        <DotsButton line={line} onMenu={onMenu} className="h-8! w-8! [@media(pointer:coarse)]:h-11! [@media(pointer:coarse)]:w-11! bg-bg/90 text-ink" />
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
