"use client";

import { useState } from "react";
import { Dialog } from "@/components/Dialog";
import { api, ApiError } from "@/lib/api";
import { plural } from "@/lib/deckfilter";
import type { DeckSummary } from "@/lib/types";
import { btn, field } from "@/lib/ui";

interface Props {
  deck: DeckSummary | null;
  onClose: () => void;
  /** Called after the change went through, so the list can reload. */
  onDone: (message: string) => void;
}

export function RenameDeckDialog({ deck, onClose, onDone }: Props) {
  return (
    <Dialog open={deck !== null} onClose={onClose} label="Rename deck" size="sm">
      {deck && <RenameForm key={deck.id} deck={deck} onClose={onClose} onDone={onDone} />}
    </Dialog>
  );
}

function RenameForm({ deck, onClose, onDone }: Props & { deck: DeckSummary }) {
  const [name, setName] = useState(deck.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/decks/${deck.id}`, { method: "PATCH", body: { name } });
      onDone("Deck renamed");
    } catch (err) {
      setError(err instanceof ApiError ? (err.fields?.name ?? err.message) : "Could not rename the deck.");
      setBusy(false);
    }
  }

  const unchanged = name.trim() === deck.name || name.trim() === "";

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <h2 className="font-display text-[44px] leading-none">Rename deck</h2>
      <div className="flex flex-col gap-2">
        <label htmlFor="rename-deck" className="text-sm text-muted">
          Deck name
        </label>
        <input id="rename-deck" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} autoFocus className={field.lg} />
      </div>
      {error && (
        <p role="alert" className="rounded-2xl border border-danger-line bg-danger/10 px-4 py-3 text-sm text-ink">
          {error}
        </p>
      )}
      <div className="flex gap-2.5">
        <button type="submit" disabled={busy || unchanged} className={btn.large.primary}>
          Rename
        </button>
        <button type="button" onClick={onClose} className={btn.large.secondary}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function DeleteDeckDialog({ deck, onClose, onDone }: Props) {
  return (
    <Dialog open={deck !== null} onClose={onClose} label="Delete deck" size="sm">
      {deck && <DeleteForm key={deck.id} deck={deck} onClose={onClose} onDone={onDone} />}
    </Dialog>
  );
}

interface BulkProps {
  decks: DeckSummary[];
  onClose: () => void;
  /** Called after all deletes have been attempted. Failed decks stay selected so the caller can retry. */
  onDone: (message: string, failed: DeckSummary[]) => void;
}

export function BulkDeleteDeckDialog({ decks, onClose, onDone }: BulkProps) {
  return (
    <Dialog open={decks.length > 0} onClose={onClose} label="Delete decks" size="sm">
      {decks.length > 0 && <BulkDeleteForm key={decks.map((d) => d.id).join(",")} decks={decks} onClose={onClose} onDone={onDone} />}
    </Dialog>
  );
}

function BulkDeleteForm({ decks, onClose, onDone }: BulkProps) {
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    const results = await Promise.allSettled(decks.map((deck) => api(`/api/decks/${deck.id}`, { method: "DELETE" })));
    const failed = decks.filter((_, i) => results[i].status === "rejected");
    const succeeded = decks.length - failed.length;
    const message =
      failed.length === 0
        ? `Moved ${plural(succeeded, "deck")} to the trash`
        : succeeded === 0
          ? `Could not delete ${plural(failed.length, "deck")}`
          : `Moved ${succeeded} of ${decks.length} decks to the trash, ${failed.length} failed`;
    onDone(message, failed);
  }

  return (
    <div className="flex flex-col gap-5">
      <h2 className="font-display text-[44px] leading-none">Delete decks</h2>
      <p className="text-[15px] leading-snug">
        Move {plural(decks.length, "deck")} to the trash? Their versions and branches go with them, and any that are public disappear from Explore. You can restore them from the trash for 30 days.
      </p>
      <div className="flex gap-2.5">
        <button type="button" disabled={busy} onClick={() => void remove()} className={btn.large.dangerSolid}>
          {busy ? "Deleting" : `Delete ${plural(decks.length, "deck")}`}
        </button>
        <button type="button" onClick={onClose} className={btn.large.secondary}>
          Keep them
        </button>
      </div>
    </div>
  );
}

function DeleteForm({ deck, onClose, onDone }: Props & { deck: DeckSummary }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/decks/${deck.id}`, { method: "DELETE" });
      onDone(`Moved ${deck.name} to the trash`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete the deck.");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <h2 className="font-display text-[44px] leading-none">Delete deck</h2>
      <p className="text-[15px] leading-snug">
        Move <span className="font-medium">{deck.name}</span> to the trash? Its {plural(deck.versionCount, "version")} and {plural(deck.branchCount, "branch", "branches")} go
        with it{deck.visibility === "public" ? ", and it disappears from Explore" : ""}. You can restore it from the trash for 30 days.
      </p>
      {error && (
        <p role="alert" className="rounded-2xl border border-danger-line bg-danger/10 px-4 py-3 text-sm text-ink">
          {error}
        </p>
      )}
      <div className="flex gap-2.5">
        <button type="button" disabled={busy} onClick={() => void remove()} className={btn.large.dangerSolid}>
          {busy ? "Deleting" : "Delete deck"}
        </button>
        <button type="button" onClick={onClose} className={btn.large.secondary}>
          Keep it
        </button>
      </div>
    </div>
  );
}
