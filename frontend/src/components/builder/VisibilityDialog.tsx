"use client";

import { useState } from "react";
import { Dialog } from "@/components/Dialog";
import { api, ApiError } from "@/lib/api";
import type { DeckDetail, Timeline, Visibility } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  deckId: string;
  token: string;
  timeline: Timeline;
  visibility: Visibility;
  publishedVersion: number | null;
  /** The version open in the builder, offered first when nothing is published yet. */
  currentVersion: number | null;
  onChanged: (deck: DeckDetail) => void;
}

/** Choose whether the deck is public and which saved version everyone sees on Explore. */
export function VisibilityDialog(props: Props) {
  return (
    <Dialog open={props.open} onClose={props.onClose} label="Deck visibility" size="sm">
      <Form {...props} />
    </Dialog>
  );
}

function Form({ onClose, deckId, token, timeline, visibility, publishedVersion, currentVersion, onChanged }: Props) {
  const versions = timeline.branches
    .flatMap((branch) => branch.versions.map((version) => ({ ...version, branch: branch.name })))
    .sort((a, b) => b.versionNumber - a.versionNumber);

  const [choice, setChoice] = useState<Visibility>(visibility);
  const [versionNumber, setVersionNumber] = useState<number | null>(publishedVersion ?? currentVersion ?? versions[0]?.versionNumber ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsVersion = choice === "public" && versionNumber === null;
  const unchanged = choice === visibility && (choice === "private" || versionNumber === publishedVersion);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const deck = await api<DeckDetail>(`/api/decks/${deckId}/visibility`, {
        method: "PUT",
        token,
        body: { visibility: choice, versionNumber: choice === "public" ? versionNumber : undefined },
      });
      onChanged(deck);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not change the visibility.");
      setSaving(false);
    }
  }

  const option = (value: Visibility, title: string, hint: string) => (
    <label className={`flex cursor-pointer items-start gap-3.5 rounded-2xl border p-4 ${choice === value ? "border-accent-text bg-surface" : "border-line"}`}>
      <input type="radio" name="visibility" checked={choice === value} onChange={() => setChoice(value)} className="mt-1 h-5 w-5 accent-[var(--accent-text)]" />
      <span>
        <span className="block text-[17px] font-medium">{title}</span>
        <span className="mt-1 block text-sm leading-snug text-muted">{hint}</span>
      </span>
    </label>
  );

  return (
    <div className="flex flex-col gap-6">
      <h2 className="font-display text-[44px] leading-none">Who can see this deck</h2>

      <div className="flex flex-col gap-3">
        {option("private", "Private", "Only you can see it.")}
        {option("public", "Public", "Listed on Explore for every signed in player, with your display name.")}
      </div>

      {choice === "public" && (
        <div className="flex flex-col gap-2">
          <label htmlFor="published-version" className="text-sm text-muted">
            Version to show
          </label>
          {versions.length === 0 ? (
            <p className="text-sm text-add-text">Save a version first. Only saved versions can be published.</p>
          ) : (
            <select
              id="published-version"
              value={versionNumber ?? ""}
              onChange={(event) => setVersionNumber(Number(event.target.value))}
              className="min-h-12 rounded-full border border-line bg-surface px-4 text-[15px] text-ink focus:border-ink focus:outline-none"
            >
              {versions.map((version) => (
                <option key={version.versionNumber} value={version.versionNumber}>
                  {`v${version.versionNumber} on ${version.branch}${version.note ? `, ${version.note}` : ""}`}
                </option>
              ))}
            </select>
          )}
          <p className="text-sm leading-snug text-muted">Only this version is shown. Edits and newer versions stay private until you publish again.</p>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-2xl border border-add-line bg-add-bg px-4 py-3 text-sm text-add-text">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2.5">
        <button type="button" onClick={() => void save()} disabled={saving || needsVersion || unchanged} className="press min-h-12 rounded-full bg-accent px-7 text-sm font-bold text-on-accent disabled:opacity-50">
          {saving ? "Saving" : "Save"}
        </button>
        <button type="button" onClick={onClose} className="pill min-h-12 rounded-full border border-ink px-7 text-sm font-medium">
          Cancel
        </button>
      </div>
    </div>
  );
}
