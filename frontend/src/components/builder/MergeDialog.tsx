"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/Dialog";
import { api, ApiError } from "@/lib/api";
import { deleteBlocker } from "@/lib/branches";
import type { Branch, MergeConflict, MergePreview, MergeSide, Timeline, VersionDetail } from "@/lib/types";
import { btn, field } from "@/lib/ui";

interface Props {
  open: boolean;
  onClose: () => void;
  deckId: string;
  timeline: Timeline;
  /** The version shown on Explore, when public. A branch holding it cannot be deleted. */
  publishedVersion: number | null;
  /** The branch whose changes come in. */
  branch: Branch | null;
  /** The branch that receives them. Main when left out. */
  into?: Branch | null;
  /** Called with the new version on the receiving branch after a successful merge. */
  onMerged: (version: VersionDetail, deletedBranch: boolean) => void;
}

type Choice = "ours" | "theirs";

/** What a card looks like on one side of a conflict. */
function describe(side: MergeSide): string {
  if (side.quantity === null) return "Not in the deck";
  const parts = [`${side.quantity} ${side.quantity === 1 ? "copy" : "copies"}`];
  if (side.printing) parts.push(side.printing.toUpperCase());
  if (side.tags.length > 0) parts.push(`tags: ${side.tags.join(", ")}`);
  return parts.join(", ");
}

/**
 * Previews merging a branch into main. Changes only one side made merge by themselves. Cards both sides
 * changed differently need a choice. The result is a new main version that remembers both parents.
 */
export function MergeDialog(props: Props) {
  return (
    <Dialog open={props.open} onClose={props.onClose} label={props.into ? `Bring ${props.branch?.name ?? "branch"} into ${props.into.name}` : "Merge into main"} size="md">
      {props.branch && <Body key={`${props.branch.id}-${props.into?.id ?? "main"}`} {...props} branch={props.branch} />}
    </Dialog>
  );
}

function Body({ onClose, deckId, timeline, publishedVersion, branch, into, onMerged }: Props & { branch: Branch }) {
  const target = into?.name ?? "main";
  const [preview, setPreview] = useState<MergePreview | null>(null);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [note, setNote] = useState("");
  const [deleteAfter, setDeleteAfter] = useState(false);
  // Said up front, so the option is not offered when the server would refuse the whole merge for it.
  const blocker = deleteBlocker(timeline, branch, publishedVersion);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<MergePreview>(`/api/decks/${deckId}/branches/${branch.id}/merge${into ? `?into=${into.id}` : ""}`)
      .then((result) => {
        if (!cancelled) setPreview(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Could not preview the merge.");
      });
    return () => {
      cancelled = true;
    };
  }, [deckId, branch.id, into]);

  const keyOf = (conflict: MergeConflict) => `${conflict.cardId}|${conflict.board}`;
  const unresolved = preview ? preview.conflicts.filter((conflict) => !choices[keyOf(conflict)]).length : 0;
  const changes = preview?.changes;

  async function merge() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const version = await api<VersionDetail>(`/api/decks/${deckId}/merge`, {
        method: "POST",
        body: {
          sourceBranchId: branch.id,
          targetBranchId: into?.id,
          expectedMainVersion: preview.mainVersion,
          expectedSourceVersion: preview.sourceVersion,
          resolutions: choices,
          note: note.trim() || undefined,
          deleteBranch: deleteAfter && blocker === null,
        },
      });
      onMerged(version, deleteAfter && blocker === null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "The merge did not go through.");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-7">
      <div>
        <h2 className="font-display text-[44px] leading-none">{into ? `Bring ${branch.name} into ${target}` : `Merge ${branch.name}`}</h2>
        <p className="mt-2 text-[15px] text-muted">
          {preview
            ? `Into ${target}. ${target} is at v${preview.mainVersion}, ${branch.name} at v${preview.sourceVersion}${preview.baseVersion !== null ? `, and they last shared v${preview.baseVersion}` : ""}.`
            : "Comparing the two lines."}
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-2xl border border-danger-line bg-danger/10 px-4 py-3 text-sm text-ink">
          {error}
        </p>
      )}

      {preview?.upToDate && <p className="text-lg">{target} already has everything on {branch.name}. There is nothing to merge.</p>}

      {preview && !preview.upToDate && (
        <>
          {preview.conflicts.length === 0 && !hasChanges(preview) && <p className="text-lg">The two lines end up with the same cards. Merging would only record the link between them.</p>}

          {changes && hasChanges(preview) && (
            <section aria-label={`Changes to ${target}`}>
              <h3 className="border-b border-line pb-2.5 text-[15px] text-muted">What {target} would change</h3>
              <ul className="mt-1">
                {changes.added.map((card) => (
                  <li key={`a-${card.cardId}-${card.board}`} className="flex justify-between gap-3 border-b border-line py-2.5 text-[15px]">
                    <span>
                      {card.name}
                      {card.board !== "main" && <span className="ml-2 text-xs text-muted capitalize">{card.board}</span>}
                    </span>
                    <span className="font-mono text-xs text-add-text">added{card.quantity > 1 ? `, ${card.quantity}x` : ""}</span>
                  </li>
                ))}
                {changes.removed.map((card) => (
                  <li key={`r-${card.cardId}-${card.board}`} className="flex justify-between gap-3 border-b border-line py-2.5 text-[15px] text-muted">
                    <span className="line-through">{card.name}</span>
                    <span className="font-mono text-xs">removed</span>
                  </li>
                ))}
                {changes.changed.map((card) => (
                  <li key={`c-${card.cardId}-${card.board}`} className="flex justify-between gap-3 border-b border-line py-2.5 text-[15px]">
                    <span>{card.name}</span>
                    <span className="font-mono text-xs text-muted">
                      {card.from} to <span className="text-ink">{card.to}</span>
                    </span>
                  </li>
                ))}
                {changes.printings.map((card) => (
                  <li key={`p-${card.cardId}-${card.board}`} className="flex justify-between gap-3 border-b border-line py-2.5 text-[15px]">
                    <span>{card.name}</span>
                    <span className="font-mono text-xs text-muted">
                      {card.from} to <span className="text-ink">{card.to}</span>
                    </span>
                  </li>
                ))}
                {changes.tags.map((card) => (
                  <li key={`t-${card.cardId}-${card.board}`} className="flex justify-between gap-3 border-b border-line py-2.5 text-[15px]">
                    <span>{card.name}</span>
                    <span className="font-mono text-xs text-muted">tags changed</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {preview.conflicts.length > 0 && (
            <section aria-label="Conflicts">
              <h3 className="border-b border-line pb-2.5 text-[15px] text-muted">
                Both lines changed these cards differently. Pick one for each ({unresolved} left).
              </h3>
              <ul>
                {preview.conflicts.map((conflict) => {
                  const key = keyOf(conflict);
                  const picked = choices[key];
                  const option = (value: Choice, title: string, side: MergeSide) => (
                    <label className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3.5 ${picked === value ? "border-accent-text bg-surface" : "border-line"}`}>
                      <input
                        type="radio"
                        name={`choice-${key}`}
                        checked={picked === value}
                        onChange={() => setChoices((current) => ({ ...current, [key]: value }))}
                        className="mt-0.5 h-5 w-5 accent-[var(--accent-text)]"
                        aria-label={`${conflict.name}: ${title}`}
                      />
                      <span>
                        <span className="block text-sm font-medium">{title}</span>
                        <span className="mt-0.5 block text-sm text-muted">{describe(side)}</span>
                      </span>
                    </label>
                  );
                  return (
                    <li key={key} className="border-b border-line py-5">
                      <p className="text-lg font-medium">
                        {conflict.name}
                        {conflict.board !== "main" && <span className="ml-2 text-xs font-normal text-muted capitalize">{conflict.board}</span>}
                      </p>
                      <p className="mt-1 text-sm text-muted">Before: {describe(conflict.base)}</p>
                      <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                        {option("ours", `Keep ${target}`, conflict.ours)}
                        {option("theirs", `Use ${branch.name}`, conflict.theirs)}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <div className="flex flex-col gap-2">
            <label htmlFor="merge-note" className="text-sm text-muted">
              Version note (optional)
            </label>
            <input
              id="merge-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={200}
              placeholder={`Merged ${branch.name} into ${target}`}
              className={field.lg}
            />
          </div>

          {!branch.main && (
            <label className={`flex items-start gap-3.5 ${blocker ? "opacity-60" : ""}`}>
              <input
                type="checkbox"
                checked={deleteAfter && blocker === null}
                disabled={blocker !== null}
                onChange={(event) => setDeleteAfter(event.target.checked)}
                className="mt-1 h-5 w-5 accent-[var(--accent-text)]"
              />
              <span>
                <span className="block text-[15px]">Delete {branch.name} after merging</span>
                <span className="mt-1 block text-sm text-muted">{blocker ?? `Its versions are removed for good. The merge on ${target} stays.`}</span>
              </span>
            </label>
          )}
        </>
      )}

      <div className="flex flex-wrap gap-2.5">
        {preview && !preview.upToDate && (
          <button
            type="button"
            onClick={() => void merge()}
            disabled={busy || unresolved > 0}
            className={btn.large.primary}
          >
            {busy ? "Merging" : `Merge into ${target}`}
          </button>
        )}
        <button type="button" onClick={onClose} className={btn.large.secondary}>
          {preview?.upToDate ? "Close" : "Cancel"}
        </button>
      </div>
    </div>
  );
}

function hasChanges(preview: MergePreview): boolean {
  const { added, removed, changed, printings, tags } = preview.changes;
  return added.length + removed.length + changed.length + printings.length + tags.length > 0;
}
