"use client";

import Image from "next/image";
import { lineKey, type LineGroup } from "@/lib/groups";
import type { Board, DeckCardLine } from "@/lib/types";

export interface ViewProps {
  groups: LineGroup[];
  selectedKey: string | null;
  /** Keys (card and board) of lines that are not in the opened version. */
  newKeys: Set<string>;
  onSelect: (line: DeckCardLine) => void;
  onQuantity: (line: DeckCardLine, delta: number) => void;
  onRemove: (line: DeckCardLine) => void;
  onMove: (line: DeckCardLine, board: Board) => void;
}

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

/** Dim cards you do not own, so what is missing reads at a glance. */
function art(line: DeckCardLine) {
  return line.owned >= line.quantity ? "" : "grayscale opacity-60";
}

function Badges({ line, isNew }: { line: DeckCardLine; isNew: boolean }) {
  return (
    <>
      {line.quantity > 1 && (
        <span className="rounded-full bg-bg px-2 py-0.5 font-mono text-xs text-ink">{line.quantity}x</span>
      )}
      {isNew && <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-on-accent">New</span>}
    </>
  );
}

/** Piles of overlapping cards. Each card shows its title bar, the last one shows in full. */
export function CardStacks({ groups, selectedKey, newKeys, onSelect }: ViewProps) {
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
              return (
                <li key={key} style={last ? undefined : { height: STRIP }} className={last ? "" : "overflow-hidden"}>
                  <button
                    type="button"
                    onClick={() => onSelect(line)}
                    onMouseEnter={() => onSelect(line)}
                    aria-label={`${line.name}${line.quantity > 1 ? `, ${line.quantity} copies` : ""}`}
                    className={`group relative block w-full rounded-[10px] text-left ${
                      selectedKey === key ? "outline-2 outline-offset-2 outline-accent-text" : ""
                    }`}
                  >
                    <div className={`relative w-full overflow-hidden rounded-[10px] bg-surface ${CARD_RATIO}`}>
                      {line.imageNormal && (
                        <Image
                          src={line.imageNormal}
                          alt=""
                          fill
                          sizes="260px"
                          className={`object-cover ${art(line)}`}
                        />
                      )}
                    </div>
                    <span className="absolute top-1.5 right-1.5 flex gap-1">
                      <Badges line={line} isNew={newKeys.has(key)} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Every card as a full image, with the same quick edits as the list. */
export function CardGallery({ groups, selectedKey, newKeys, onSelect, onQuantity, onRemove, onMove }: ViewProps) {
  if (groups.length === 0) return <Empty />;
  const small = "flex h-11 w-11 items-center justify-center rounded-full border border-line text-lg leading-none";

  return (
    <div className="flex flex-col gap-12">
      {groups.map((group) => (
        <section key={group.title} aria-label={group.title}>
          <GroupHeader group={group} />
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-x-5 gap-y-7">
            {group.lines.map((line) => {
              const key = lineKey(line);
              const isCommander = line.board === "commander";
              return (
                <li key={key} className="group/card flex flex-col gap-2.5" onMouseEnter={() => onSelect(line)}>
                  <button
                    type="button"
                    onClick={() => onSelect(line)}
                    aria-label={line.name}
                    className={`relative block w-full rounded-[14px] ${
                      selectedKey === key ? "outline-2 outline-offset-2 outline-accent-text" : ""
                    }`}
                  >
                    <div className={`relative w-full overflow-hidden rounded-[14px] bg-surface ${CARD_RATIO}`}>
                      {line.imageNormal && (
                        <Image src={line.imageNormal} alt="" fill sizes="260px" className={`object-cover ${art(line)}`} />
                      )}
                    </div>
                    <span className="absolute top-2 right-2 flex gap-1">
                      <Badges line={line} isNew={newKeys.has(key)} />
                    </span>
                  </button>
                  <div className="flex items-center justify-between gap-2 px-1">
                    <p className="truncate text-sm">{line.name}</p>
                    {line.owned < line.quantity && (
                      <span className="shrink-0 rounded-full border border-add-line px-2 py-0.5 text-xs text-add-text">Need</span>
                    )}
                  </div>
                  <div className="hidden flex-wrap gap-2 group-focus-within/card:flex group-hover/card:flex">
                    {!isCommander && (
                      <>
                        <button type="button" aria-label={`Remove one ${line.name}`} onClick={() => onQuantity(line, -1)} className={small}>
                          -
                        </button>
                        <button type="button" aria-label={`Add one ${line.name}`} onClick={() => onQuantity(line, 1)} className={small}>
                          +
                        </button>
                        <button
                          type="button"
                          onClick={() => onMove(line, line.board === "main" ? "maybe" : "main")}
                          className="min-h-11 rounded-full border border-line px-4 text-sm"
                        >
                          {line.board === "main" ? "Maybeboard" : "Mainboard"}
                        </button>
                      </>
                    )}
                    <button type="button" onClick={() => onRemove(line)} className="min-h-11 rounded-full border border-line px-4 text-sm">
                      Remove
                    </button>
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
