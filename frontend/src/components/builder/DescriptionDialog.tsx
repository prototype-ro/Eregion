"use client";

import { useState } from "react";
import { Dialog } from "@/components/Dialog";
import { api, ApiError } from "@/lib/api";
import { btn } from "@/lib/ui";

const MAX = 2000;

interface Props {
  open: boolean;
  onClose: () => void;
  deckId: string;
  description: string;
  /** Called after the description is saved, so the page can reload the deck. */
  onSaved: () => void;
}

/** Edits the text shown under a public deck, such as a short primer on how it plays. Saved on its own, without making a version. */
export function DescriptionDialog(props: Props) {
  return (
    <Dialog open={props.open} onClose={props.onClose} label="Deck description" size="md">
      <Form {...props} />
    </Dialog>
  );
}

function Form({ onClose, deckId, description, onSaved }: Props) {
  const [text, setText] = useState(description);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/decks/${deckId}`, { method: "PATCH", body: { description: text } });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? (err.fields?.description ?? err.message) : "Could not save the description.");
      setBusy(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <h2 className="font-display text-[44px] leading-none">Description</h2>
      <div className="flex flex-col gap-2">
        <label htmlFor="deck-description" className="text-sm text-muted">
          Shown on the deck&apos;s public page. Plain text, line breaks are kept.
        </label>
        <textarea
          id="deck-description"
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={MAX}
          rows={9}
          autoFocus
          placeholder="How the deck wins, what to mulligan for, what to swap in against which pods."
          className="w-full resize-y rounded-3xl border border-line bg-surface px-5 py-4 text-[15px] leading-relaxed text-ink placeholder:text-muted focus:border-ink focus:outline-none"
        />
        <p className="text-right font-mono text-xs text-muted">
          {text.length} / {MAX}
        </p>
      </div>
      {error && (
        <p role="alert" className="rounded-2xl border border-danger-line bg-danger/10 px-4 py-3 text-sm text-ink">
          {error}
        </p>
      )}
      <div className="flex gap-2.5">
        <button type="submit" disabled={busy || text === description} className={btn.large.primary}>
          Save
        </button>
        <button type="button" onClick={onClose} className={btn.large.secondary}>
          Cancel
        </button>
      </div>
    </form>
  );
}
