"use client";

import Link from "next/link";
import { useState } from "react";
import { Dialog } from "@/components/Dialog";
import { api, ApiError } from "@/lib/api";
import type { Branch, Timeline } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  deckId: string;
  timeline: Timeline;
  /** The branch of the version open in the builder. */
  currentBranchId: string | null;
  /** Called with the fresh timeline after a rename or delete. */
  onChanged: (timeline: Timeline, deletedBranchId: string | null) => void;
}

const head = (branch: Branch) => branch.versions[branch.versions.length - 1];

/** Rename, delete and compare the deck's branches. */
export function BranchesDialog(props: Props) {
  return (
    <Dialog open={props.open} onClose={props.onClose} label="Branches" size="md">
      <Body {...props} />
    </Dialog>
  );
}

function Body({ onClose, deckId, timeline, currentBranchId, onChanged }: Props) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const root = timeline.branches.find((branch) => branch.forkedFromVersion === null) ?? timeline.branches[0];

  async function run(action: () => Promise<Timeline>, deletedId: string | null) {
    setBusy(true);
    setError(null);
    try {
      const next = await action();
      setRenaming(null);
      setDeleting(null);
      onChanged(next, deletedId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const rename = (branch: Branch) =>
    run(() => api<Timeline>(`/api/decks/${deckId}/branches/${branch.id}`, { method: "PATCH", body: { name: draft } }), null);
  const remove = (branch: Branch) =>
    run(() => api<Timeline>(`/api/decks/${deckId}/branches/${branch.id}`, { method: "DELETE" }), branch.id);

  return (
    <div className="flex flex-col gap-6">
      <h2 className="font-display text-[44px] leading-none">Branches</h2>
      <p className="text-[15px] leading-snug text-muted">
        Each branch is its own line of versions. Deleting one removes its versions for good. The first branch stays, and a branch that others split from cannot be deleted until they are gone.
      </p>

      {error && (
        <p role="alert" className="rounded-2xl border border-add-line bg-add-bg px-4 py-3 text-sm text-add-text">
          {error}
        </p>
      )}

      <ul className="flex flex-col">
        {timeline.branches.map((branch) => {
          const tip = head(branch);
          const isRoot = branch.id === root?.id;
          return (
            <li key={branch.id} className="flex flex-col gap-3 border-b border-line py-5 first:border-t">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                {renaming === branch.id ? (
                  <form
                    className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void rename(branch);
                    }}
                  >
                    <label htmlFor={`rename-${branch.id}`} className="sr-only">
                      New name for {branch.name}
                    </label>
                    <input
                      id={`rename-${branch.id}`}
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      maxLength={40}
                      autoFocus
                      className="min-h-11 min-w-[180px] flex-1 rounded-full border border-line bg-surface px-4 text-[15px] text-ink focus:border-ink focus:outline-none"
                    />
                    <button type="submit" disabled={busy || draft.trim() === ""} className="press min-h-11 rounded-full bg-accent px-5 text-sm font-bold text-on-accent disabled:opacity-50">
                      Rename
                    </button>
                    <button type="button" onClick={() => setRenaming(null)} className="pill min-h-11 rounded-full border border-ink px-5 text-sm font-medium">
                      Cancel
                    </button>
                  </form>
                ) : (
                  <p className="min-w-0 text-xl font-medium">
                    {branch.name}
                    {branch.id === currentBranchId && <span className="ml-3 rounded-full border border-accent-text px-2.5 py-0.5 text-xs font-normal text-accent-text">open</span>}
                  </p>
                )}
                <p className="font-mono text-[13px] text-muted">
                  {branch.versions.length} {branch.versions.length === 1 ? "version" : "versions"}
                  {tip ? `, latest v${tip.versionNumber}` : ""}
                  {branch.forkedFromVersion !== null ? `, from v${branch.forkedFromVersion}` : ""}
                </p>
              </div>

              {deleting === branch.id ? (
                <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-add-line bg-add-bg px-4 py-3 text-sm text-add-text">
                  <span className="min-w-0 flex-1">
                    Delete {branch.name} and its {branch.versions.length} {branch.versions.length === 1 ? "version" : "versions"}? This cannot be undone.
                  </span>
                  <button type="button" disabled={busy} onClick={() => void remove(branch)} className="min-h-11 rounded-full bg-add-text px-5 text-sm font-bold text-bg disabled:opacity-50">
                    Delete branch
                  </button>
                  <button type="button" onClick={() => setDeleting(null)} className="pill min-h-11 rounded-full border border-ink px-5 text-sm font-medium text-ink">
                    Keep it
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setRenaming(branch.id);
                      setDraft(branch.name);
                      setDeleting(null);
                      setError(null);
                    }}
                    className="pill min-h-11 rounded-full border border-ink px-5 text-sm font-medium"
                  >
                    Rename
                  </button>
                  {!isRoot && root && tip && head(root) && (
                    <Link
                      href={`/decks/${deckId}/diff?from=${head(root).versionNumber}&to=${tip.versionNumber}`}
                      className="pill inline-flex min-h-11 items-center rounded-full border border-ink px-5 text-sm font-medium"
                    >
                      Compare with {root.name}
                    </Link>
                  )}
                  {!isRoot && (
                    <button
                      type="button"
                      onClick={() => {
                        setDeleting(branch.id);
                        setRenaming(null);
                        setError(null);
                      }}
                      className="pill min-h-11 rounded-full border border-add-line px-5 text-sm font-medium text-add-text"
                    >
                      Delete
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div>
        <button type="button" onClick={onClose} className="pill min-h-12 rounded-full border border-ink px-7 text-sm font-medium">
          Done
        </button>
      </div>
    </div>
  );
}
