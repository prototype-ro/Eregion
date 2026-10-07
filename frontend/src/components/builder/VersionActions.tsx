"use client";

import Link from "next/link";
import { useState } from "react";
import { Dialog } from "@/components/Dialog";
import { api, ApiError } from "@/lib/api";
import type { DeckCardLine, Timeline, VersionDetail } from "@/lib/types";

interface Props {
  deckId: string;
  version: VersionDetail;
  /** The version shown on Explore, when public. */
  published: number | null;
  /** Unsaved edits would be lost by actions that open another version. */
  dirty: boolean;
  /** The newest version on the open version's branch. */
  branchHead: number | null;
  /** Opens a version without asking, for after the server changed the history. */
  onOpen: (versionNumber: number) => void;
  /** Reloads the deck after something changed that does not move the open version. */
  onReload: () => void;
  onPublish: (versionNumber: number) => void;
  onToast: (message: string) => void;
}

const button = "pill inline-flex min-h-11 items-center rounded-full border border-ink px-5 text-sm font-medium disabled:opacity-40";

/** What can be done to the version that is open: compare, label, restore, publish, delete. */
export function VersionActions({ deckId, version, published, dirty, branchHead, onOpen, onReload, onPublish, onToast }: Props) {
  const [noteOpen, setNoteOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const number = version.versionNumber;
  const lockedHint = dirty ? "Save or discard your changes first" : undefined;
  const isPublished = published === number;

  async function restore() {
    if (branchHead === null) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await api<VersionDetail>(`/api/decks/${deckId}/versions`, {
        method: "POST",
        body: {
          note: `Restored v${number}`,
          fromVersion: branchHead,
          cards: version.cards.map((line: DeckCardLine) => ({
            cardId: line.cardId,
            quantity: line.quantity,
            board: line.board,
            printingId: line.customPrintingId ? null : line.printingId,
            customPrintingId: line.customPrintingId,
            tags: line.tags,
          })),
        },
      });
      onToast(`Restored v${number} as v${saved.versionNumber}`);
      onOpen(saved.versionNumber);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not restore that version.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const timeline = await api<Timeline>(`/api/decks/${deckId}/versions/${number}`, { method: "DELETE" });
      setConfirmDelete(false);
      onToast(`Deleted v${number}`);
      // Move to what the deleted version grew from, or the newest version of the first branch.
      const parent = version.parentVersion;
      const exists = (n: number) => timeline.branches.some((branch) => branch.versions.some((v) => v.versionNumber === n));
      if (parent !== null && exists(parent)) {
        onOpen(parent);
      } else {
        const first = timeline.branches.find((branch) => branch.main) ?? timeline.branches[0];
        const tip = first?.versions[first.versions.length - 1];
        if (tip) onOpen(tip.versionNumber);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete that version.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 border-t border-line pt-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <p className="mr-2 text-sm text-muted">Version {number}</p>
        {version.parentVersion !== null && (
          <Link href={`/decks/${deckId}/diff?from=${version.parentVersion}&to=${number}`} className={button}>
            Compare with v{version.parentVersion}
          </Link>
        )}
        <button type="button" onClick={() => setNoteOpen(true)} className={button}>
          Edit note
        </button>
        {!version.head && branchHead !== null && (
          <button type="button" onClick={() => void restore()} disabled={busy || dirty} title={lockedHint} className={button}>
            Restore as latest on {version.branchName}
          </button>
        )}
        {!isPublished && (
          <button type="button" onClick={() => onPublish(number)} className={button}>
            Show on Explore
          </button>
        )}
        <button type="button" onClick={() => setConfirmDelete(true)} disabled={busy || dirty} title={lockedHint} className={`${button} border-add-line text-add-text`}>
          Delete version
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-2xl border border-add-line bg-add-bg px-4 py-3 text-sm text-add-text">
          {error}
        </p>
      )}

      {confirmDelete && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl border border-add-line bg-add-bg px-4 py-3 text-sm text-add-text">
          <span className="min-w-0 flex-1">
            Delete v{number} for good? Versions and branches that grew from it will grow from {version.parentVersion !== null ? `v${version.parentVersion}` : "the start"} instead.
          </span>
          <button type="button" disabled={busy} onClick={() => void remove()} className="min-h-11 rounded-full bg-add-text px-5 text-sm font-bold text-bg disabled:opacity-50">
            Delete v{number}
          </button>
          <button type="button" onClick={() => setConfirmDelete(false)} className="pill min-h-11 rounded-full border border-ink px-5 text-sm font-medium text-ink">
            Keep it
          </button>
        </div>
      )}

      <NoteDialog
        open={noteOpen}
        onClose={() => setNoteOpen(false)}
        deckId={deckId}
        number={number}
        initial={version.note}
        onSaved={() => {
          setNoteOpen(false);
          onToast("Note updated");
          onReload();
        }}
      />
    </div>
  );
}

function NoteDialog({ open, onClose, deckId, number, initial, onSaved }: { open: boolean; onClose: () => void; deckId: string; number: number; initial: string; onSaved: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} label={`Note for version ${number}`} size="sm">
      <NoteForm onClose={onClose} deckId={deckId} number={number} initial={initial} onSaved={onSaved} />
    </Dialog>
  );
}

function NoteForm({ onClose, deckId, number, initial, onSaved }: { onClose: () => void; deckId: string; number: number; initial: string; onSaved: () => void }) {
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/decks/${deckId}/versions/${number}`, { method: "PATCH", body: { note: text } });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the note.");
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
      <h2 className="font-display text-[44px] leading-none">Note for v{number}</h2>
      <div className="flex flex-col gap-2">
        <label htmlFor="version-note-edit" className="text-sm text-muted">
          What this version is
        </label>
        <input
          id="version-note-edit"
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={200}
          autoFocus
          className="min-h-12 rounded-full border border-line bg-surface px-5 text-[15px] text-ink focus:border-ink focus:outline-none"
        />
      </div>
      {error && (
        <p role="alert" className="rounded-2xl border border-add-line bg-add-bg px-4 py-3 text-sm text-add-text">
          {error}
        </p>
      )}
      <div className="flex gap-2.5">
        <button type="submit" disabled={busy} className="press min-h-12 rounded-full bg-accent px-7 text-sm font-bold text-on-accent disabled:opacity-50">
          Save note
        </button>
        <button type="button" onClick={onClose} className="pill min-h-12 rounded-full border border-ink px-7 text-sm font-medium">
          Cancel
        </button>
      </div>
    </form>
  );
}
