"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { DeckDiff } from "@/lib/types";

interface Step {
  versionNumber: number;
  note: string | null;
  createdAt: string;
  cardCount: number;
  added: number;
  removed: number;
  changed: number;
}

const SHOWN = 3; // the newest versions listed before "Show all"
const NAMES = 8; // card names listed per kind of change before "and N more"

/** "Nov 19", with the year only when it is not this year. */
function day(iso: string): string {
  const date = new Date(iso);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
}

function names(list: string[]): string {
  return list.length > NAMES ? `${list.slice(0, NAMES).join(", ")} and ${list.length - NAMES} more` : list.join(", ");
}

/**
 * How a shared deck got to the version on show, newest first and one line each: the owner's note, what moved and when.
 * Opening a line lists the cards that came in and went out. Nothing shows when the owner keeps the history private or
 * there is only one version.
 */
export function PublicHistory({ deckId }: { deckId: string }) {
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [diff, setDiff] = useState<DeckDiff | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Step[]>(`/api/explore/${deckId}/history`)
      .then(setSteps)
      .catch(() => setSteps([]));
  }, [deckId]);

  useEffect(() => {
    if (!steps || open === null) return;
    const at = steps.findIndex((step) => step.versionNumber === open);
    if (at < 1) return;
    let live = true;
    setDiff(null);
    setError(null);
    api<DeckDiff>(`/api/explore/${deckId}/diff?from=${steps[at - 1].versionNumber}&to=${open}`)
      .then((data) => live && setDiff(data))
      .catch((err) => live && setError(err instanceof ApiError ? err.message : "Could not load that change."));
    return () => {
      live = false;
    };
  }, [deckId, open, steps]);

  if (!steps || steps.length < 2) return null;
  const first = steps[0].versionNumber;
  const newest = [...steps].reverse();
  const shown = all ? newest : newest.slice(0, SHOWN);

  return (
    <section aria-labelledby="history-heading" className="mt-12 border-t border-line pt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="history-heading" className="font-display text-[34px] leading-none">
          How it got here
        </h2>
        <p className="font-mono text-[13px] text-muted">{steps.length} versions</p>
      </div>
      <ol className="mt-4 flex flex-col">
        {shown.map((step) => {
          const isFirst = step.versionNumber === first;
          const selected = open === step.versionNumber;
          const moved = step.added > 0 || step.removed > 0 || step.changed > 0;
          return (
            <li key={step.versionNumber}>
              <button
                type="button"
                aria-expanded={isFirst ? undefined : selected}
                disabled={isFirst}
                onClick={() => setOpen(selected ? null : step.versionNumber)}
                className={`grid w-full grid-cols-[3rem_minmax(0,1fr)_auto] items-baseline gap-x-3 rounded-xl px-2 py-2 text-left text-sm transition-colors enabled:hover:bg-surface disabled:cursor-default [@media(pointer:coarse)]:min-h-11 sm:grid-cols-[3rem_minmax(0,1fr)_auto_4.5rem] ${selected ? "bg-surface" : ""}`}
              >
                <span className="font-mono text-accent-text">v{step.versionNumber}</span>
                <span className="truncate text-ink">{isFirst ? `First version, ${step.cardCount} ${step.cardCount === 1 ? "card" : "cards"}` : step.note || "No note"}</span>
                <span className="font-mono text-xs whitespace-nowrap" aria-label={isFirst ? undefined : `${step.added} added, ${step.removed} removed, ${step.changed} changed`}>
                  {isFirst ? null : moved ? (
                    <>
                      {step.added > 0 && <span className="text-add-text">+{step.added} </span>}
                      {step.removed > 0 && <span className="text-danger">&minus;{step.removed} </span>}
                      {step.changed > 0 && <span className="text-muted">{step.changed} changed</span>}
                    </>
                  ) : (
                    <span className="text-muted">no card changes</span>
                  )}
                </span>
                <span className="hidden text-right text-xs whitespace-nowrap text-muted sm:block">{day(step.createdAt)}</span>
              </button>
              {selected && (
                <div className="mb-2 ml-[3.75rem] flex flex-col gap-1 px-2 pb-2 text-sm">
                  {error && <p role="alert" className="text-danger">{error}</p>}
                  {!error && !diff && <p className="text-muted">Loading the changes.</p>}
                  {diff && (
                    <>
                      {diff.added.length > 0 && (
                        <p>
                          <span className="text-add-text">In </span>
                          {names(diff.added.map((card) => card.name))}
                        </p>
                      )}
                      {diff.removed.length > 0 && (
                        <p>
                          <span className="text-danger">Out </span>
                          {names(diff.removed.map((card) => card.name))}
                        </p>
                      )}
                      {diff.changed.length > 0 && (
                        <p>
                          <span className="text-muted">Changed </span>
                          {names(diff.changed.map((card) => `${card.name} ${card.from} to ${card.to}`))}
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {steps.length > SHOWN && (
        <button type="button" aria-expanded={all} onClick={() => setAll((value) => !value)} className="mt-1 min-h-9 px-2 text-sm text-muted hover:text-ink">
          {all ? "Show fewer" : `Show all ${steps.length} versions`}
        </button>
      )}
    </section>
  );
}
