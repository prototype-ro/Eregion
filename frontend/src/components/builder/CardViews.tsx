"use client";

import Image from "next/image";
import { useState } from "react";
import { lineKey, type LineGroup } from "@/lib/groups";
import type { DeckCardLine } from "@/lib/types";
import { DotsButton, type ViewProps } from "./CardList";

const CARD_RATIO = "aspect-[488/680]";
/** How much of each card shows in a stack: enough for the title bar. */
const STRIP = 40;

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

/**
 * Piles of overlapping cards. Each card shows its title bar and the last one shows in full.
 * Clicking a card that is buried under others brings it to the front, drawn over its neighbors
 * without moving anything. Clicking it again puts it back.
 */
export function CardStacks({ groups, selectedKey, newKeys, checkCollection, onSelect, onMenu }: ViewProps) {
  const [raised, setRaised] = useState<string | null>(null);
  if (groups.length === 0) return <Empty />;

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-x-8 gap-y-12">
      {groups.map((group) => (
        <section key={group.title} aria-label={group.title}>
          <GroupHeader group={group} />
          <ul className="flex flex-col">
            {group.lines.map((line, index) => {
              const last = index === group.lines.length - 1;
              const key = lineKey(line);
              const front = raised === `${group.title}|${key}`;
              return (
                <li
                  key={key}
                  style={last ? undefined : { height: STRIP }}
                  className={`${front ? "relative z-20" : last ? "" : "overflow-hidden"}`}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    onMenu(line, event.clientX, event.clientY);
                  }}
                >
                  <div className="group/stack relative">
                    <button
                      type="button"
                      onClick={() => {
                        onSelect(line);
                        setRaised(front ? null : `${group.title}|${key}`);
                      }}
                      onMouseEnter={() => onSelect(line)}
                      aria-label={`${line.name}${line.quantity > 1 ? `, ${line.quantity} copies` : ""}`}
                      aria-pressed={front}
                      className={`block w-full rounded-[10px] text-left ${
                        front ? "shadow-[0_18px_40px_rgba(0,0,0,0.55)]" : ""
                      } ${selectedKey === key ? "outline-2 outline-offset-2 outline-accent-text" : ""}`}
                    >
                      <div className={`relative w-full overflow-hidden rounded-[10px] bg-surface ${CARD_RATIO}`}>
                        {line.imageNormal && <Image src={line.imageNormal} alt="" fill sizes="260px" className={`object-cover ${art(line, checkCollection)}`} />}
                      </div>
                    </button>
                    <span className="pointer-events-none absolute top-1 right-1 flex items-center gap-1">
                      <Badges line={line} isNew={newKeys.has(key)} />
                      <span className="pointer-events-auto opacity-0 group-focus-within/stack:opacity-100 group-hover/stack:opacity-100">
                        <DotsButton line={line} onMenu={onMenu} className="h-8! w-8! bg-bg/90 text-ink" />
                      </span>
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

/** Every card as a full image. */
export function CardGallery({ groups, selectedKey, newKeys, checkCollection, onSelect, onMenu }: ViewProps) {
  if (groups.length === 0) return <Empty />;

  return (
    <div className="flex flex-col gap-12">
      {groups.map((group) => (
        <section key={group.title} aria-label={group.title}>
          <GroupHeader group={group} />
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-x-5 gap-y-7">
            {group.lines.map((line) => {
              const key = lineKey(line);
              return (
                <li
                  key={key}
                  className="flex flex-col gap-1.5"
                  onMouseEnter={() => onSelect(line)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    onMenu(line, event.clientX, event.clientY);
                  }}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(line)}
                    aria-label={line.name}
                    className={`relative block w-full rounded-[14px] ${selectedKey === key ? "outline-2 outline-offset-2 outline-accent-text" : ""}`}
                  >
                    <div className={`relative w-full overflow-hidden rounded-[14px] bg-surface ${CARD_RATIO}`}>
                      {line.imageNormal && <Image src={line.imageNormal} alt="" fill sizes="260px" className={`object-cover ${art(line, checkCollection)}`} />}
                    </div>
                    <span className="absolute top-2 right-2 flex gap-1">
                      <Badges line={line} isNew={newKeys.has(key)} />
                    </span>
                  </button>
                  <div className="flex items-center justify-between gap-1 pl-1">
                    <p className="flex min-w-0 items-center gap-2 text-sm">
                      <span className="truncate">{line.name}</span>
                      {checkCollection && line.owned < line.quantity && (
                        <span className="shrink-0 rounded-full border border-add-line px-2 py-0.5 text-xs text-add-text">Need</span>
                      )}
                    </p>
                    <DotsButton line={line} onMenu={onMenu} className="-mr-1" />
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
