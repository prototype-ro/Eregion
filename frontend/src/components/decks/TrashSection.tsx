"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { std } from "@/lib/ui";

interface TrashedDeck {
  id: string;
  name: string;
  deletedAt: string;
  purgeAt: string;
}

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });

/**
 * Decks deleted in the last 30 days, under the deck list. Restoring brings a deck back exactly as it was; deleting it
 * forever skips the wait. Hidden when the trash is empty. `refresh` changes whenever the deck list reloads, so a deck
 * that was just deleted shows up here at once.
 */
export function TrashSection({ refresh, onRestored }: { refresh: number; onRestored: (message: string) => void }) {
  const [trash, setTrash] = useState<TrashedDeck[]>([]);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setTrash(await api<TrashedDeck[]>("/api/decks/trash"));
    } catch {
      setTrash([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refresh]);

  async function act(deck: TrashedDeck, kind: "restore" | "forever") {
    setBusy(deck.id);
    setError(null);
    try {
      if (kind === "restore") {
        await api(`/api/decks/${deck.id}/restore`, { method: "POST" });
        onRestored(`${deck.name} is back`);
      } else {
        await api(`/api/decks/${deck.id}/forever`, { method: "DELETE" });
      }
      setConfirming(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not change the trash.");
    } finally {
      setBusy(null);
    }
  }

  if (trash.length === 0) return null;
  return (
    <details className="mt-16 border-t border-line pt-6">
      <summary className="inline-flex min-h-9 cursor-pointer items-center gap-2 text-[15px] text-muted hover:text-ink [@media(pointer:coarse)]:min-h-11">
        Trash <span className="font-mono text-xs">{trash.length}</span>
      </summary>
      <p className="mt-3 max-w-[560px] text-sm text-muted">Deleted decks stay here for 30 days, then they are removed for good.</p>
      {error && (
        <p role="alert" className="mt-3 max-w-[560px] rounded-2xl border border-danger-line bg-danger/10 px-4 py-3 text-sm">
          {error}
        </p>
      )}
      <ul className="mt-4 flex max-w-[760px] flex-col divide-y divide-line">
        {trash.map((deck) => (
          <li key={deck.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="truncate font-medium">{deck.name}</p>
              <p className="text-xs text-muted">
                Deleted {day(deck.deletedAt)}, removed for good on {day(deck.purgeAt)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {confirming === deck.id ? (
                <>
                  <button type="button" disabled={busy === deck.id} onClick={() => void act(deck, "forever")} className={std("dangerSolid")}>
                    Delete forever
                  </button>
                  <button type="button" onClick={() => setConfirming(null)} className={std("quiet")}>
                    Keep it
                  </button>
                </>
              ) : (
                <>
                  <button type="button" disabled={busy === deck.id} onClick={() => void act(deck, "restore")} className={std("secondary")}>
                    Restore
                  </button>
                  <button type="button" onClick={() => setConfirming(deck.id)} aria-label={`Delete ${deck.name} forever`} className={std("quiet")}>
                    Delete forever
                  </button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </details>
  );
}
