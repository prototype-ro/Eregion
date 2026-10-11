"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { Branch, BranchStatus, Timeline } from "@/lib/types";
import { deleteBlocker } from "@/lib/branches";
import { btn } from "@/lib/ui";

interface Props {
  deckId: string;
  branch: Branch;
  timeline: Timeline;
  /** The version shown on Explore, when the deck is public. */
  publishedVersion: number | null;
  /** Merging opens a new version, which would replace unsaved edits. */
  locked: boolean;
  /** Known already by the caller. Left out, the panel asks for it. */
  status?: BranchStatus;
  onMerge: (branch: Branch, into?: Branch) => void;
  /** Called with the fresh timeline after a rename or a delete. */
  onChanged: (timeline: Timeline, deletedBranchId: string | null) => void;
  onClose: () => void;
  /** Leave out the name, counts and status line, for callers that already show them next to the panel. */
  bare?: boolean;
}

const item = "flex min-h-9 [@media(pointer:coarse)]:min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 text-left text-sm transition-colors hover:bg-surface disabled:opacity-40 disabled:hover:bg-transparent";
const head = (branch: Branch) => branch.versions[branch.versions.length - 1];

/**
 * Everything you can do to one branch, in one short list: rename it, bring its changes into main or main's into it,
 * compare it, delete it. Used by the menu on the timeline and by each row of the Branches list, so it behaves the same in both.
 */
export function BranchActions({ deckId, branch, timeline, publishedVersion, locked, status: known, onMerge, onChanged, onClose, bare = false }: Props) {
  const [mode, setMode] = useState<"menu" | "rename" | "delete">("menu");
  const [draft, setDraft] = useState(branch.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetched, setFetched] = useState<BranchStatus | null>(null);

  const root = timeline.branches.find((candidate) => candidate.main) ?? timeline.branches[0];
  const isRoot = branch.id === root?.id;
  const status = known ?? fetched ?? undefined;

  useEffect(() => {
    if (known || isRoot) return;
    let cancelled = false;
    api<BranchStatus[]>(`/api/decks/${deckId}/branches/status`)
      .then((list) => {
        if (!cancelled) setFetched(list.find((entry) => entry.branchId === branch.id) ?? null);
      })
      .catch(() => {
        // The counts are extra. The list works without them.
      });
    return () => {
      cancelled = true;
    };
  }, [deckId, branch.id, known, isRoot, timeline]);

  // The rules the server enforces, said before the click instead of after it.
  const cannotDelete = deleteBlocker(timeline, branch, publishedVersion);
  const lockedHint = locked ? "Save or discard your changes first" : undefined;
  const tip = head(branch);

  async function run(action: () => Promise<Timeline>, deletedId: string | null) {
    setBusy(true);
    setError(null);
    try {
      const next = await action();
      onChanged(next, deletedId);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  const meta = `${branch.versions.length} ${branch.versions.length === 1 ? "version" : "versions"}${tip ? `, latest v${tip.versionNumber}` : ""}${branch.forkedFromVersion !== null ? `, from v${branch.forkedFromVersion}` : ""}`;

  return (
    <div className="flex flex-col gap-1 text-sm">
      <div className={bare && mode !== "rename" ? "hidden" : "px-3 pt-1.5 pb-2"}>
        {mode === "rename" ? (
          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void run(() => api<Timeline>(`/api/decks/${deckId}/branches/${branch.id}`, { method: "PATCH", body: { name: draft } }), null);
            }}
          >
            <label htmlFor={`rename-${branch.id}`} className="sr-only">
              New name for {branch.name}
            </label>
            <input
              id={`rename-${branch.id}`}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.stopPropagation();
                  setMode("menu");
                }
              }}
              maxLength={40}
              autoFocus
              onFocus={(event) => event.currentTarget.select()}
              className="min-h-10 min-w-0 flex-1 rounded-full border border-line bg-surface px-4 text-[15px] text-ink focus:border-ink focus:outline-none"
            />
            <button type="submit" disabled={busy || draft.trim() === "" || draft.trim() === branch.name} className={`${btn.primary} !min-h-10 px-4 text-sm`}>
              Save
            </button>
          </form>
        ) : (
          <>
            <p className="text-base font-medium">{branch.name}</p>
            <p className="mt-0.5 font-mono text-xs text-muted">{meta}</p>
            {!isRoot && status && (
              <p className="mt-1.5 text-muted">
                {status.ahead === 0 ? (
                  <span className="text-accent-text">Everything here is already on {root?.name ?? "main"}.</span>
                ) : (
                  <>
                    <span className="text-ink">
                      {status.ahead} {status.ahead === 1 ? "version" : "versions"} ahead
                    </span>
                    {status.behind > 0 && `, ${status.behind} behind ${root?.name ?? "main"}`}
                  </>
                )}
              </p>
            )}
          </>
        )}
      </div>

      {error && (
        <p role="alert" className="mx-1 rounded-xl border border-danger-line bg-danger/10 px-3 py-2 text-ink">
          {error}
        </p>
      )}

      {mode === "delete" ? (
        <div className="mx-1 flex flex-col gap-3 rounded-xl border border-danger-line bg-danger/10 p-3">
          <p>
            Delete <span className="font-medium">{branch.name}</span> and its {branch.versions.length} {branch.versions.length === 1 ? "version" : "versions"} for good?
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(() => api<Timeline>(`/api/decks/${deckId}/branches/${branch.id}`, { method: "DELETE" }), branch.id)}
              className="inline-flex min-h-10 items-center rounded-full bg-danger px-5 text-sm font-bold text-bg disabled:opacity-50"
            >
              Delete branch
            </button>
            <button type="button" onClick={() => setMode("menu")} className={`${btn.quiet} !min-h-10 text-sm text-ink`}>
              Keep it
            </button>
          </div>
        </div>
      ) : (
        mode === "menu" && (
          <div role="menu" className="flex flex-col">
            <button type="button" role="menuitem" onClick={() => (setDraft(branch.name), setError(null), setMode("rename"))} className={item}>
              Rename
            </button>
            {!isRoot && status && status.ahead > 0 && (
              <button type="button" role="menuitem" disabled={locked} title={lockedHint} onClick={() => onMerge(branch)} className={`${item} text-accent-text`}>
                Merge into {root?.name ?? "main"}
                {locked && <span className="text-xs text-muted">{lockedHint}</span>}
              </button>
            )}
            {!isRoot && root && status && status.behind > 0 && (
              <button type="button" role="menuitem" disabled={locked} title={lockedHint} onClick={() => onMerge(root, branch)} className={item}>
                Update from {root.name}
              </button>
            )}
            {!isRoot && root && tip && head(root) && (
              <Link role="menuitem" href={`/decks/${deckId}/diff?from=${head(root).versionNumber}&to=${tip.versionNumber}`} className={item}>
                Compare with {root.name}
              </Link>
            )}
            {!isRoot && (
              <>
                <button type="button" role="menuitem" disabled={cannotDelete !== null} onClick={() => (setError(null), setMode("delete"))} className={`${item} text-danger`}>
                  Delete branch
                </button>
                {cannotDelete && <p className="px-3 pb-1 text-xs text-muted">{cannotDelete}</p>}
              </>
            )}
          </div>
        )
      )}
    </div>
  );
}
