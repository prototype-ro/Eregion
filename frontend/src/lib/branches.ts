import type { Branch, Timeline } from "./types";

/**
 * Why a branch cannot be deleted right now, or null when it can. These are the server's rules, said before the click:
 * a branch other branches split off from stays until they are gone, and so does the one that holds the public version.
 */
export function deleteBlocker(timeline: Timeline, branch: Branch, publishedVersion: number | null): string | null {
  if (branch.main) return "The main branch cannot be deleted.";
  const splitOff = timeline.branches.filter(
    (other) => other.id !== branch.id && other.forkedFromVersion !== null && branch.versions.some((v) => v.versionNumber === other.forkedFromVersion),
  );
  if (splitOff.length > 0) return `${splitOff.map((other) => other.name).join(", ")} split off it. Delete ${splitOff.length === 1 ? "that one" : "those"} first.`;
  if (publishedVersion !== null && branch.versions.some((v) => v.versionNumber === publishedVersion)) return "It holds the public version. Publish another version first.";
  return null;
}
