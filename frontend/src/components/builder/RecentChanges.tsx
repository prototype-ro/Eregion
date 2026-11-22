"use client";

import { useState } from "react";
import type { Timeline, VersionSummary } from "@/lib/types";

interface Props {
  timeline: Timeline;
  current: number | null;
  /** The version shown on Explore, when public. */
  published: number | null;
  onSelect: (versionNumber: number) => void;
  /** While picking a second version to compare, a row picks it instead of opening it. */
  comparing: boolean;
  onCompare: (versionNumber: number) => void;
  /** How many rows show before "Show all". */
  limit?: number;
}

/** "Nov 19", with the year only when it is not this year. */
function day(iso: string): string {
  const date = new Date(iso);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
}

/** What a version changed, in a few characters: +3 −1, or what kind of step it was when no card moved. */
function change(version: VersionSummary) {
  if (version.parentVersion === null) return <span className="text-muted">first version, {version.cardCount} cards</span>;
  if (version.added === 0 && version.removed === 0) {
    return <span className="text-muted">{version.mergeParent !== null ? `merged v${version.mergeParent}` : "no card changes"}</span>;
  }
  return (
    <>
      {version.added > 0 && <span className="text-add-text">+{version.added}</span>}
      {version.added > 0 && version.removed > 0 && " "}
      {version.removed > 0 && <span className="text-danger">&minus;{version.removed}</span>}
    </>
  );
}

/**
 * The newest saves as a list: number, note, what changed and when, readable without hovering the dots. On a phone it
 * stands in for the dots, which need more width than a phone has.
 */
export function RecentChanges({ timeline, current, published, onSelect, comparing, onCompare, limit = 3 }: Props) {
  const [all, setAll] = useState(false);
  const branchName = new Map(timeline.branches.map((branch) => [branch.id, branch.main ? null : branch.name]));
  const versions = timeline.branches.flatMap((branch) => branch.versions).sort((a, b) => b.versionNumber - a.versionNumber);
  if (versions.length === 0) return null;
  const shown = all ? versions : versions.slice(0, limit);

  return (
    <div className="mt-3">
      <h3 className="sr-only">Recent changes</h3>
      <ol className="flex flex-col">
        {shown.map((version) => {
          const n = version.versionNumber;
          const here = n === current;
          const branch = branchName.get(version.branchId);
          return (
            <li key={n}>
              <button
                type="button"
                aria-current={here ? "true" : undefined}
                onClick={() => (comparing ? onCompare(n) : onSelect(n))}
                className={`grid w-full grid-cols-[3rem_minmax(0,1fr)_auto] items-baseline gap-x-3 rounded-xl px-2 py-2 text-left text-sm transition-colors hover:bg-surface [@media(pointer:coarse)]:min-h-11 sm:grid-cols-[3rem_minmax(0,1fr)_auto_4.5rem] ${here ? "bg-surface" : ""}`}
              >
                <span className={`font-mono ${here ? "text-accent-text" : "text-muted"}`}>v{n}</span>
                <span className="min-w-0">
                  <span className="block truncate text-ink">{version.note || "No note"}</span>
                  {(branch || published === n) && (
                    <span className="block truncate text-xs text-muted">
                      {[branch && `on ${branch}`, published === n && "public"].filter(Boolean).join(", ")}
                    </span>
                  )}
                </span>
                <span className="font-mono text-xs whitespace-nowrap">{change(version)}</span>
                <span className="hidden text-right text-xs whitespace-nowrap text-muted sm:block">{day(version.createdAt)}</span>
              </button>
            </li>
          );
        })}
      </ol>
      {versions.length > limit && (
        <button type="button" aria-expanded={all} onClick={() => setAll((value) => !value)} className="mt-1 min-h-9 px-2 text-sm text-muted hover:text-ink">
          {all ? "Show fewer" : `Show all ${versions.length} versions`}
        </button>
      )}
    </div>
  );
}
