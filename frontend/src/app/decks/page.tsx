"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DeleteDeckDialog, RenameDeckDialog } from "@/components/decks/DeckDialogs";
import { DeckTile } from "@/components/decks/DeckTile";
import { DeckToolbar } from "@/components/decks/DeckToolbar";
import { Nav } from "@/components/Nav";
import { api, ApiError } from "@/lib/api";
import {
  DEFAULT_DIRECTION,
  DECK_SORTS,
  isFiltering,
  matches,
  NO_FILTERS,
  sortDecks,
  type DeckDirection,
  type DeckFilters,
  type DeckSort,
} from "@/lib/deckfilter";
import type { DeckDetail, DeckSummary } from "@/lib/types";

const VIEW_KEY = "eregion-decks-view";

interface StoredView {
  sort: DeckSort;
  direction: DeckDirection;
  visibility: DeckFilters["visibility"];
  legality: DeckFilters["legality"];
  colors: string[];
}

export default function DecksPage() {
  const router = useRouter();
  const [decks, setDecks] = useState<DeckSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  const [filters, setFilters] = useState<DeckFilters>(NO_FILTERS);
  const [sort, setSort] = useState<DeckSort>("updated");
  const [direction, setDirection] = useState<DeckDirection>("desc");
  const [renaming, setRenaming] = useState<DeckSummary | null>(null);
  const [deleting, setDeleting] = useState<DeckSummary | null>(null);
  // The saved view is applied first. Saving only starts after that, or the defaults would overwrite it.
  const [restored, setRestored] = useState(false);

  // Remember how the list was sorted and filtered. The search text is not kept.
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(VIEW_KEY) ?? "null") as Partial<StoredView> | null;
      if (!stored) {
        setRestored(true);
        return;
      }
      if (DECK_SORTS.some(([value]) => value === stored.sort)) setSort(stored.sort as DeckSort);
      if (stored.direction === "asc" || stored.direction === "desc") setDirection(stored.direction);
      setFilters((current) => ({
        ...current,
        visibility: ["all", "public", "private"].includes(stored.visibility ?? "") ? (stored.visibility as DeckFilters["visibility"]) : "all",
        legality: ["all", "legal", "issues"].includes(stored.legality ?? "") ? (stored.legality as DeckFilters["legality"]) : "all",
        colors: Array.isArray(stored.colors) ? stored.colors.filter((c) => "WUBRGC".includes(c)) : [],
      }));
    } catch {
      // Storage blocked or unreadable: the defaults apply.
    }
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return;
    try {
      const view: StoredView = { sort, direction, visibility: filters.visibility, legality: filters.legality, colors: filters.colors };
      localStorage.setItem(VIEW_KEY, JSON.stringify(view));
    } catch {
      // Not remembered, nothing else is affected.
    }
  }, [restored, sort, direction, filters.visibility, filters.legality, filters.colors]);

  const load = useCallback(async () => {
    try {
      setDecks(await api<DeckSummary[]>("/api/decks"));
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace("/login");
        return;
      }
      setError(err instanceof ApiError ? err.message : "Could not load your decks.");
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  // Edits made in another tab show up when this one comes back into view.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const shown = useMemo(() => sortDecks((decks ?? []).filter((deck) => matches(deck, filters)), sort, direction), [decks, filters, sort, direction]);

  function chooseSort(next: DeckSort) {
    setSort(next);
    setDirection(DEFAULT_DIRECTION[next]);
  }

  async function createDeck(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setCreating(true);
    try {
      const created = await api<DeckDetail>("/api/decks", { method: "POST", body: { name: trimmed } });
      router.push(`/decks/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the deck.");
      setCreating(false);
    }
  }

  async function duplicate(deck: DeckSummary) {
    try {
      const copy = await api<DeckDetail>(`/api/decks/${deck.id}/duplicate`, { method: "POST" });
      setToast(`Copied as ${copy.name}`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not copy the deck.");
    }
  }

  async function setVisibility(deck: DeckSummary, visibility: "public" | "private") {
    try {
      await api(`/api/decks/${deck.id}/visibility`, {
        method: "PUT",
        body: { visibility, versionNumber: visibility === "public" ? deck.latestVersion : undefined },
      });
      setToast(visibility === "public" ? `${deck.name} is public, showing v${deck.latestVersion}` : `${deck.name} is private`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not change the visibility.");
    }
  }

  const finished = (message: string) => {
    setRenaming(null);
    setDeleting(null);
    setToast(message);
    void load();
  };

  return (
    <div className="shell">
      <Nav active="decks" />

      <main className="pb-24">
        <h1 className="pt-16 pb-8 font-display text-[clamp(72px,13vw,200px)] leading-[0.9]">Your decks</h1>

        <form onSubmit={createDeck} className="mb-10 flex max-w-[560px] flex-col gap-2">
          <label htmlFor="deckName" className="text-sm text-muted">
            New deck name
          </label>
          <div className="flex gap-2.5">
            <input
              id="deckName"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              className="min-h-12 flex-1 rounded-full border border-line bg-surface px-5 text-base text-ink focus:border-ink focus:outline-none"
            />
            <button type="submit" disabled={creating || name.trim() === ""} className="press min-h-12 rounded-full bg-accent px-6 text-sm font-bold text-on-accent disabled:opacity-50">
              {creating ? "Creating" : "Create and open"}
            </button>
          </div>
        </form>

        {decks !== null && decks.length > 0 && (
          <DeckToolbar filters={filters} onFilters={setFilters} sort={sort} direction={direction} onSort={chooseSort} onFlip={() => setDirection((d) => (d === "asc" ? "desc" : "asc"))} shown={shown.length} total={decks.length} />
        )}

        {error && (
          <p role="alert" className="mb-8 max-w-[560px] rounded-2xl border border-add-line bg-add-bg px-4 py-3 text-sm text-add-text">
            {error}
          </p>
        )}

        {decks === null && !error && (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-x-5 gap-y-9 border-t border-line pt-6" aria-label="Loading your decks" aria-busy="true">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <li key={i} className="animate-pulse">
                <div className="aspect-[5/4] rounded-card bg-surface" />
                <div className="mt-4 h-5 w-2/3 rounded-full bg-surface" />
                <div className="mt-2.5 h-4 w-1/2 rounded-full bg-surface" />
              </li>
            ))}
          </ul>
        )}

        {decks !== null && decks.length === 0 && (
          <div className="max-w-[460px] border-t border-line pt-8">
            <p className="text-lg leading-normal text-muted">No decks yet. Name one above, then add cards and save your first version.</p>
            <p className="mt-4 text-[15px] text-muted">
              Want ideas first?{" "}
              <Link href="/explore" className="text-accent-text underline underline-offset-4">
                Browse decks other players shared
              </Link>
              , or{" "}
              <Link href="/collection" className="text-accent-text underline underline-offset-4">
                add the cards you own
              </Link>
              .
            </p>
          </div>
        )}

        {decks !== null && decks.length > 0 && shown.length === 0 && (
          <p className="max-w-[460px] text-lg leading-normal text-muted">
            No deck matches.{" "}
            {isFiltering(filters) && (
              <button type="button" onClick={() => setFilters({ ...NO_FILTERS })} className="text-accent-text underline underline-offset-4">
                Clear the filters
              </button>
            )}
          </p>
        )}

        {shown.length > 0 && (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-x-5 gap-y-10">
            {shown.map((deck) => (
              <DeckTile key={deck.id} deck={deck} onRename={setRenaming} onDelete={setDeleting} onDuplicate={(d) => void duplicate(d)} onVisibility={(d, v) => void setVisibility(d, v)} />
            ))}
          </ul>
        )}
      </main>

      <RenameDeckDialog deck={renaming} onClose={() => setRenaming(null)} onDone={finished} />
      <DeleteDeckDialog deck={deleting} onClose={() => setDeleting(null)} onDone={finished} />

      {toast && (
        <p role="status" className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full border border-line bg-bg px-5 py-3 text-sm shadow-2xl">
          {toast}
        </p>
      )}
    </div>
  );
}
