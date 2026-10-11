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

function DeleteForm({ deck, onClose, onDone }: Props & { deck: DeckSummary }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/decks/${deck.id}`, { method: "DELETE" });
      onDone(`Deleted ${deck.name}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete the deck.");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <h2 className="font-display text-[44px] leading-none">Delete deck</h2>
      <p className="text-[15px] leading-snug">
        Delete <span className="font-medium">{deck.name}</span>? Its {plural(deck.versionCount, "version")} and {plural(deck.branchCount, "branch", "branches")} are removed for good
        {deck.visibility === "public" ? ", and it disappears from Explore" : ""}. This cannot be undone.
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
