"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog } from "@/components/Dialog";
import { api, ApiError } from "@/lib/api";
import { buildHistory } from "@/lib/history";
import type { CardAppearance, DeckCardLine, Timeline } from "@/lib/types";
import { btn } from "@/lib/ui";

interface Props {
  line: DeckCardLine | null;
  deckId: string;
  timeline: Timeline;
  /** The version open in the builder. */
  current: number | null;
  onClose: () => void;
  onOpenVersion: (versionNumber: number) => void;
}

/** When a card came into the deck and left it, version by version, across every branch. */
export function CardHistoryDialog({ line, deckId, timeline, current, onClose, onOpenVersion }: Props) {
  return (
    <Dialog open={line !== null} onClose={onClose} label="Card history" size="md">
      {line && <Body key={line.cardId} line={line} deckId={deckId} timeline={timeline} current={current} onClose={onClose} onOpenVersion={onOpenVersion} />}
    </Dialog>
  );
}

function Body({ line, deckId, timeline, current, onClose, onOpenVersion }: Props & { line: DeckCardLine }) {
  const [appearances, setAppearances] = useState<CardAppearance[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<CardAppearance[]>(`/api/decks/${deckId}/cards/${line.cardId}/history`)
      .then((list) => {
        if (!cancelled) setAppearances(list);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Could not load the history.");
      });
    return () => {
      cancelled = true;
    };
  }, [deckId, line.cardId]);

  const history = useMemo(() => (appearances ? buildHistory(timeline, appearances) : null), [timeline, appearances]);
  const openAndClose = (version: number) => {
    onClose();
    onOpenVersion(version);
  };

  return (
    <div className="flex flex-col gap-7">
      <div>
        <h2 className="font-display text-[44px] leading-none">{line.name}</h2>
        <p className="mt-2 text-[15px] text-muted">
          {history
            ? history.versionsWith === 0
              ? "This card has never been in a saved version of this deck."
              : `In ${history.versionsWith} of ${history.versionsTotal} saved versions. First added in v${history.firstAdded}.`
            : "Reading the history."}
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-2xl border border-danger-line bg-danger/10 px-4 py-3 text-sm text-ink">
          {error}
        </p>
      )}

      {history && history.versionsWith > 0 && (
        <>
          <section aria-label="Versions with this card">
            <h3 className="border-b border-line pb-2.5 text-[15px] text-muted">Every version, by branch</h3>
            <ul className="mt-3 flex flex-col gap-3.5">
              {timeline.branches.map((branch) => (
                <li key={branch.id} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 truncate text-sm text-muted" title={branch.name}>
                    {branch.name}
                  </span>
                  <span className="flex flex-wrap gap-1.5">
                    {branch.versions.map((version) => {
                      const here = history.byVersion.get(version.versionNumber);
                      const total = here?.reduce((sum, a) => sum + a.quantity, 0) ?? 0;
                      const open = version.versionNumber === current;
                      return (
                        <button
                          key={version.versionNumber}
                          type="button"
                          onClick={() => openAndClose(version.versionNumber)}
                          aria-label={`Version ${version.versionNumber}: ${here ? `${total} ${total === 1 ? "copy" : "copies"}` : "not in the deck"}`}
                          title={`v${version.versionNumber}: ${here ? `${total} ${total === 1 ? "copy" : "copies"}, ${here.map((a) => a.board).join(" and ")}` : "not in the deck"}`}
                          className={`flex h-9 min-w-9 items-center justify-center rounded-full border px-2 font-mono text-xs ${
                            here ? "border-accent-text bg-accent text-on-accent" : "border-line text-muted"
                          } ${open ? "outline-2 outline-offset-2 outline-ink" : ""}`}
                        >
                          {here ? total : `v${version.versionNumber}`}
                        </button>
                      );
                    })}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">Filled: the card is in that version, with its copies. Outlined: it is not.</p>
          </section>

          <section aria-label="What changed">
            <h3 className="border-b border-line pb-2.5 text-[15px] text-muted">What changed, newest first</h3>
            <ul>
              {history.events.map((event) => (
                <li key={event.version} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line py-3.5">
                  <span className="min-w-0">
                    <span className="block text-[15px]">{event.changes.join(", ")}</span>
                    <span className="mt-0.5 block font-mono text-xs text-muted">
                      v{event.version} on {event.branch}
                    </span>
                  </span>
                  <button type="button" onClick={() => openAndClose(event.version)} className="pill min-h-10 rounded-full border border-ink px-4 text-xs font-medium">
                    Open v{event.version}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <div>
        <button type="button" onClick={onClose} className={btn.large.secondary}>
          Close
        </button>
      </div>
    </div>
  );
}
