"use client";

import { useEffect, useState } from "react";
import { DiffView } from "@/components/DiffView";
import { api, ApiError } from "@/lib/api";
import type { DeckDiff } from "@/lib/types";
import { std } from "@/lib/ui";

interface Step {
  versionNumber: number;
  note: string | null;
  createdAt: string;
  cardCount: number;
  added: number;
  removed: number;
  changed: number;
}

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

/**
 * How a shared deck got to the version on show: each version it grew from, with the owner's note and what changed,
 * and the full diff of any step. This is what makes a deck on Eregion different from a list, so it sits right under
 * the deck's header. Nothing shows when the owner keeps the history private or there is only one version.
 */
export function PublicHistory({ deckId }: { deckId: string }) {
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [diff, setDiff] = useState<DeckDiff | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Step[]>(`/api/explore/${deckId}/history`)
      .then((list) => {
        setSteps(list);
        // The newest step opens by itself: what changed most recently is the first question a visitor has.
        if (list.length > 1) setOpen(list[list.length - 1].versionNumber);
      })
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
  return (
    <section aria-labelledby="history-heading" className="mt-14 border-t border-line pt-10">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="history-heading" className="font-display text-[clamp(44px,5vw,72px)] leading-[0.92]">
          How it got here
        </h2>
        <p className="font-mono text-[13px] text-muted">{steps.length} versions</p>
      </div>
      <ol className="mt-8 flex flex-col">
        {steps.map((step, index) => {
          const first = index === 0;
          const selected = open === step.versionNumber;
          return (
            <li key={step.versionNumber} className="border-l-2 border-line pb-5 pl-5 last:pb-0" style={selected ? { borderColor: "var(--accent-text)" } : undefined}>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="font-mono text-sm text-accent-text">v{step.versionNumber}</span>
                <span className="text-sm text-muted">{day(step.createdAt)}</span>
                <span className="text-sm text-muted">{step.cardCount} cards</span>
                {!first && (
                  <span className="font-mono text-sm" aria-label={`${step.added} added, ${step.removed} removed, ${step.changed} changed`}>
                    <span className="text-add-text">+{step.added}</span> <span className="text-danger">−{step.removed}</span>
                    {step.changed > 0 && <span className="text-muted"> ~{step.changed}</span>}
                  </span>
                )}
                {!first && (
                  <button type="button" aria-expanded={selected} onClick={() => setOpen(selected ? null : step.versionNumber)} className={std("quiet")}>
                    {selected ? "Hide changes" : "What changed"}
                  </button>
                )}
              </div>
              {step.note && <p className="mt-1 max-w-[68ch] text-[15px]">{step.note}</p>}
              {first && <p className="mt-1 text-sm text-muted">The first version.</p>}
              {selected && (
                <div className="mt-5">
                  {error && <p role="alert" className="text-sm text-danger">{error}</p>}
                  {!error && !diff && <p className="text-sm text-muted">Loading the changes.</p>}
                  {diff && <DiffView diff={diff} showOwned={false} />}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
