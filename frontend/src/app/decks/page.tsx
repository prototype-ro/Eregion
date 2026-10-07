"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DeleteDeckDialog, RenameDeckDialog } from "@/components/decks/DeckDialogs";
import { NewDeckDialog, type NewDeckDraft } from "@/components/decks/NewDeckDialog";
import { DeckRow, DeckTile } from "@/components/decks/DeckTile";
import { ImportDialog, type ImportedCard } from "@/components/builder/ImportDialog";
import type { DeckActions } from "@/components/decks/DeckMenu";
import { DeckToolbar } from "@/components/decks/DeckToolbar";
import { Nav } from "@/components/Nav";
import { api, ApiError } from "@/lib/api";
import {
  DEFAULT_DIRECTION,
  DECK_SORTS,
  isFiltering,
  matches,
  NO_FILTERS,
  PAGE_SIZE,
  plural,
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
  status: DeckFilters["status"];
  view: "grid" | "list";
}

export default function DecksPage() {
  const router = useRouter();
  const [decks, setDecks] = useState<DeckSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [draft, setDraft] = useState<NewDeckDraft | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [limit, setLimit] = useState(PAGE_SIZE);

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
        status: ["active", "archived", "all"].includes(stored.status ?? "") ? (stored.status as DeckFilters["status"]) : "active",
      }));
      if (stored.view === "list") setView("list");
    } catch {
      // Storage blocked or unreadable: the defaults apply.
    }
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return;
    try {
      const saved: StoredView = { sort, direction, visibility: filters.visibility, legality: filters.legality, colors: filters.colors, status: filters.status, view };
      localStorage.setItem(VIEW_KEY, JSON.stringify(saved));
    } catch {
      // Not remembered, nothing else is affected.
    }
  }, [restored, sort, direction, filters.visibility, filters.legality, filters.colors, filters.status, view]);

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

  // A new search, filter or order starts again from the first page.
  useEffect(() => {
    setLimit(PAGE_SIZE);
  }, [filters, sort, direction, view]);

  function chooseSort(next: DeckSort) {
    setSort(next);
    setDirection(DEFAULT_DIRECTION[next]);
  }

  /** Makes the deck, then opens it. cards stay empty for a plain new deck. */
  async function createDeck(name: string, cards: Array<{ cardId: string; quantity: number; board: string }>) {
    setCreating(true);
    setCreateError(null);
    try {
      const created = await api<DeckDetail>("/api/decks", { method: "POST", body: { name, cards: cards.length > 0 ? cards : undefined } });
      router.push(`/decks/${created.id}`);
    } catch (err) {
      setCreateError(err instanceof ApiError ? (err.fields?.cards ?? err.message) : "Could not create the deck.");
      setCreating(false);
      setNewOpen(true);
    }
  }

  const createFromDraft = (next: NewDeckDraft) =>
    createDeck(next.name, next.commander ? [{ cardId: next.commander.id, quantity: 1, board: "commander" }] : []);

  function importedToDeck(cards: ImportedCard[]) {
    const name = draft?.name || "Imported deck";
    const lines = cards.map(({ card, quantity, board }) => ({ cardId: card.id, quantity, board }));
    // A commander chosen in the dialog leads the deck, unless the list brought its own.
    if (draft?.commander && !lines.some((line) => line.board === "commander")) {
      lines.unshift({ cardId: draft.commander.id, quantity: 1, board: "commander" });
    }
    setListOpen(false);
    void createDeck(name, lines);
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

  async function setFlag(deck: DeckSummary, flag: "pinned" | "archived") {
    const next = !deck[flag];
    try {
      await api(`/api/decks/${deck.id}/flags`, { method: "PATCH", body: { [flag]: next } });
      setToast(
        flag === "pinned"
          ? next ? `${deck.name} is pinned to the top` : `${deck.name} is unpinned`
          : next ? `${deck.name} is archived` : `${deck.name} is back in your active decks`,
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not change that.");
    }
  }

  const actions: DeckActions = {
    onRename: setRenaming,
    onDelete: setDeleting,
    onDuplicate: (deck) => void duplicate(deck),
    onVisibility: (deck, visibility) => void setVisibility(deck, visibility),
    onPin: (deck) => void setFlag(deck, "pinned"),
    onArchive: (deck) => void setFlag(deck, "archived"),
  };

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

        <div className="mb-10 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setCreateError(null);
              setNewOpen(true);
            }}
            className="press min-h-14 rounded-full bg-accent px-8 text-base font-bold text-on-accent"
          >
            New deck
          </button>
          <button
            type="button"
            onClick={() => {
              setDraft({ name: "", commander: null });
              setListOpen(true);
            }}
            className="pill min-h-14 rounded-full border border-ink px-7 text-base font-medium"
          >
            Import a list
          </button>
        </div>

        {decks !== null && decks.length > 0 && (
          <DeckToolbar filters={filters} onFilters={setFilters} sort={sort} direction={direction} onSort={chooseSort} onFlip={() => setDirection((d) => (d === "asc" ? "desc" : "asc"))} shown={shown.length} total={decks.length} view={view} onView={setView} />
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

        {shown.length > 0 && view === "grid" && (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-x-5 gap-y-10">
            {shown.slice(0, limit).map((deck) => (
              <DeckTile key={deck.id} deck={deck} actions={actions} />
            ))}
          </ul>
        )}

        {shown.length > 0 && view === "list" && (
          <ul className="border-t border-line">
            {shown.slice(0, limit).map((deck) => (
              <DeckRow key={deck.id} deck={deck} actions={actions} />
            ))}
          </ul>
        )}

        {shown.length > limit && (
          <div className="mt-12 flex flex-wrap items-center gap-4">
            <button type="button" onClick={() => setLimit((current) => current + PAGE_SIZE)} className="pill min-h-12 rounded-full border border-ink px-7 text-sm font-medium">
              Show {Math.min(PAGE_SIZE, shown.length - limit)} more
            </button>
            <p className="text-sm text-muted">
              Showing {limit} of {plural(shown.length, "deck")}
            </p>
          </div>
        )}
      </main>

      <NewDeckDialog
        open={newOpen}
        onClose={() => setNewOpen(false)}
        busy={creating}
        error={createError}
        onCreate={(next) => void createFromDraft(next)}
        onFromList={(next) => {
          setDraft(next);
          setNewOpen(false);
          setListOpen(true);
        }}
      />
      <ImportDialog
        open={listOpen}
        onClose={() => setListOpen(false)}
        onImport={(cards) => importedToDeck(cards)}
        title="Start a deck from a list"
        addLabel="Create a new deck from this list"
        replaceLabel={null}
        confirmLabel={(count) => `Create a deck with ${count} cards`}
      />
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
