import type { Timeline } from "./types";

export interface ApplyCheck {
  ok: boolean;
  /** Why not, in words for the person editing. */
  reason: string | null;
}

/**
 * A draft can be saved over a version, instead of as a new one, only when nothing grew from that
 * version: no later version, merge or branch starts from it. Otherwise their history would shift.
 * The server enforces the same rule.
 */
export function canApplyInPlace(timeline: Timeline, versionNumber: number): ApplyCheck {
  for (const branch of timeline.branches) {
    if (branch.forkedFromVersion === versionNumber) {
      return { ok: false, reason: `The branch ${branch.name} split off from this version. Save a new version instead.` };
    }
    for (const version of branch.versions) {
      if (version.parentVersion === versionNumber) {
        return { ok: false, reason: `Version ${version.versionNumber} grew from this one. Save a new version instead.` };
      }
      if (version.mergeParent === versionNumber) {
        return { ok: false, reason: `Version ${version.versionNumber} merged this one in. Save a new version instead.` };
      }
    }
  }
  return { ok: true, reason: null };
}
