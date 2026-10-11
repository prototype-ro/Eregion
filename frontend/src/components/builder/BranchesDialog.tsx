"use client";

import { DotsThree } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { Dialog } from "@/components/Dialog";
import { Presence } from "@/components/motion/Presence";
import { api } from "@/lib/api";
import type { Branch, BranchStatus, Timeline } from "@/lib/types";
import { btn } from "@/lib/ui";
import { BranchActions } from "./BranchActions";

interface Props {
  open: boolean;
  onClose: () => void;
  deckId: string;
  timeline: Timeline;
  /** The branch of the version open in the builder. */
  currentBranchId: string | null;
  publishedVersion: number | null;
  /** Merging opens a new version, which would replace unsaved edits. */
  locked: boolean;
  /** Merge a branch into another one. The receiving branch is main when left out. */
  onMerge: (branch: Branch, into?: Branch) => void;
  /** Called with the fresh timeline after a rename or delete. */
  onChanged: (timeline: Timeline, deletedBranchId: string | null) => void;
}

/** Every branch on one line. Open a line for what can be done with it. */
export function BranchesDialog(props: Props) {
  return (
    <Dialog open={props.open} onClose={props.onClose} label="Branches" size="md">
      <Body {...props} />
    </Dialog>
  );
}

function Body({ onClose, deckId, timeline, currentBranchId, publishedVersion, locked, onMerge, onChanged }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Map<string, BranchStatus>>(new Map());

  // How far each branch is from main. The timeline changing (rename, delete, merge) means asking again.
  useEffect(() => {
    let cancelled = false;
    api<BranchStatus[]>(`/api/decks/${deckId}/branches/status`)
      .then((list) => {
        if (!cancelled) setStatuses(new Map(list.map((status) => [status.branchId, status])));
      })
      .catch(() => {
        // The counts are extra. The list works without them.
      });
    return () => {
      cancelled = true;
    };
  }, [deckId, timeline]);

  const root = timeline.branches.find((branch) => branch.main) ?? timeline.branches[0];

  return (
    <div className="flex flex-col gap-5">
      <h2 className="font-display text-[44px] leading-none">Branches</h2>
      <ul className="flex flex-col border-t border-line">
        {timeline.branches.map((branch) => {
          const status = statuses.get(branch.id);
          const isRoot = branch.id === root?.id;
          const expanded = openId === branch.id;
          return (
            <li key={branch.id} className="border-b border-line">
              <div className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg font-medium">
                    {branch.name}
                    {branch.id === currentBranchId && <span className="ml-3 rounded-full border border-accent-text px-2.5 py-0.5 text-xs font-normal text-accent-text">open</span>}
                  </p>
                  <p className="font-mono text-xs text-muted">
                    {branch.versions.length} {branch.versions.length === 1 ? "version" : "versions"}
                    {!isRoot && status && (status.ahead === 0 ? ", merged" : `, ${status.ahead} ahead${status.behind > 0 ? `, ${status.behind} behind` : ""}`)}
                  </p>
                </div>
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-label={`Actions for ${branch.name}`}
                  onClick={() => setOpenId(expanded ? null : branch.id)}
                  className={`${btn.quiet} !px-3 ${expanded ? "bg-surface text-ink" : ""}`}
                >
                  <DotsThree size={22} weight="bold" aria-hidden />
                </button>
              </div>
              <Presence show={expanded} collapse>
                <div className="pb-3">
                  <BranchActions
                    branch={branch}
                    deckId={deckId}
                    timeline={timeline}
                    publishedVersion={publishedVersion}
                    locked={locked}
                    status={status}
                    bare
                    onMerge={onMerge}
                    onChanged={onChanged}
                    onClose={() => setOpenId(null)}
                  />
                </div>
              </Presence>
            </li>
          );
        })}
      </ul>
      <div>
        <button type="button" onClick={onClose} className={btn.secondary}>
          Done
        </button>
      </div>
    </div>
  );
}
