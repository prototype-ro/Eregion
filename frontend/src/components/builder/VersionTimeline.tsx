"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Timeline, VersionSummary } from "@/lib/types";

const WINDOW = 30; // versions drawn by default when a history is long
const ZOOM_MIN = 36;
const ZOOM_MAX = 120;
const ZOOM_DEFAULT = 76; // horizontal space per version
const LABEL_MIN_ZOOM = 52; // below this the version labels would overlap
const LANE = 84; // vertical space per branch
const GUTTER = 148; // room on the left for branch names
const PAD_RIGHT = 56;
const PAD_TOP = 58;
const HIT = 44; // clickable size of each dot

interface Node {
  version: VersionSummary;
  lane: number;
  branchName: string;
  head: boolean;
  x: number;
  y: number;
}

interface Props {
  timeline: Timeline;
  /** The version being shown in the builder. */
  current: number | null;
  /** The version shown on Explore, when the deck is public. */
  published: number | null;
  onSelect: (versionNumber: number) => void;
}

interface Hover {
  node: Node;
  left: number;
  top: number;
}

const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

/**
 * A deck's history drawn as a multiverse timeline. Each branch is a horizontal lane of dots, one per
 * saved version. A branch curves away from the version it split from, and a dashed curve joins a merge
 * to the branch it brought in. Hover or focus a dot for its note, date and what changed, and click it to open that version.
 */
export function VersionTimeline({ timeline, current, published, onSelect }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  const [zoom, setZoom] = useState(ZOOM_DEFAULT);
  const [showAll, setShowAll] = useState(false);

  const { nodes, edges, width, height, lanes, total } = useMemo(() => {
    const all: Node[] = [];
    timeline.branches.forEach((branch, lane) => {
      branch.versions.forEach((version, index) => {
        all.push({ version, lane, branchName: branch.name, head: index === branch.versions.length - 1, x: 0, y: 0 });
      });
    });
    // Versions are numbered in the order they were made, so one shared column per number
    // keeps parallel branches readable as a single timeline.
    all.sort((a, b) => a.version.versionNumber - b.version.versionNumber);

    // A long history draws only its latest versions, plus the one that is open and the public one.
    const placed =
      showAll || all.length <= WINDOW
        ? all
        : all.filter((node, index) => index >= all.length - WINDOW || node.version.versionNumber === current || node.version.versionNumber === published);

    // Branches with nothing in view give up their lane.
    const visibleLanes = [...new Set(placed.map((node) => node.lane))].sort((a, b) => a - b);
    placed.forEach((node, index) => {
      node.lane = visibleLanes.indexOf(node.lane);
      node.y = PAD_TOP + node.lane * LANE;
      node.x = GUTTER + index * zoom;
    });

    const byNumber = new Map(placed.map((node) => [node.version.versionNumber, node]));
    const paths: Array<{ d: string; lane: number; key: string; merge: boolean }> = [];
    const curve = (from: Node, to: Node) => {
      if (from.lane === to.lane) return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
      const mid = from.x + (to.x - from.x) * 0.5;
      return `M ${from.x} ${from.y} C ${mid} ${from.y}, ${mid} ${to.y}, ${to.x} ${to.y}`;
    };
    for (const node of placed) {
      const parent = node.version.parentVersion === null ? undefined : byNumber.get(node.version.parentVersion);
      if (parent) paths.push({ d: curve(parent, node), lane: node.lane, key: `${parent.version.versionNumber}-${node.version.versionNumber}`, merge: false });
      const merged = node.version.mergeParent === null ? undefined : byNumber.get(node.version.mergeParent);
      if (merged) paths.push({ d: curve(merged, node), lane: merged.lane, key: `m${merged.version.versionNumber}-${node.version.versionNumber}`, merge: true });
    }

    return {
      nodes: placed,
      edges: paths,
      width: GUTTER + PAD_RIGHT + Math.max(placed.length - 1, 0) * zoom,
      height: PAD_TOP + Math.max(visibleLanes.length - 1, 0) * LANE + 44,
      lanes: visibleLanes.map((lane) => timeline.branches[lane]),
      total: all.length,
    };
  }, [timeline, zoom, showAll, current, published]);

  const currentNode = nodes.find((node) => node.version.versionNumber === current) ?? null;

  // Bring the open version into view when the history is wider than the screen.
  useEffect(() => {
    const element = scroller.current;
    if (!element || !currentNode) return;
    element.scrollLeft = Math.max(0, currentNode.x - element.clientWidth / 2);
  }, [currentNode]);

  if (nodes.length === 0) {
    return <p className="py-6 text-muted">No versions yet. Save the first one to start the timeline.</p>;
  }

  function show(node: Node, element: HTMLElement) {
    const box = element.getBoundingClientRect();
    setHover({ node, left: Math.min(Math.max(box.left + box.width / 2, 150), window.innerWidth - 150), top: box.bottom + 14 });
  }

  const tip = hover?.node.version;

  const hidden = total - nodes.length;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 pb-2 text-sm text-muted">
        <p>
          {total > WINDOW
            ? showAll
              ? `Showing all ${total} versions.`
              : `Showing the latest ${nodes.length} of ${total} versions.`
            : `${total} ${total === 1 ? "version" : "versions"}.`}
          {total > WINDOW && (
            <button type="button" onClick={() => setShowAll((all) => !all)} className="ml-2 text-accent-text underline underline-offset-4">
              {showAll ? "Show only the latest" : `Show the ${hidden} earlier`}
            </button>
          )}
        </p>
        <label className="flex items-center gap-3">
          Zoom
          <input
            type="range"
            min={ZOOM_MIN}
            max={ZOOM_MAX}
            step={4}
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
            aria-label="Timeline zoom"
            className="w-28 accent-[var(--accent-text)]"
          />
        </label>
      </div>
      <div ref={scroller} onScroll={() => setHover(null)} className="overflow-x-auto pb-2" tabIndex={-1}>
        <div className="relative" style={{ width, height, minWidth: "100%" }}>
          <svg width={width} height={height} className="absolute inset-0" aria-hidden="true">
            {edges.map((edge) => {
              const active = currentNode !== null && edge.lane === currentNode.lane;
              return (
                <path
                  key={edge.key}
                  d={edge.d}
                  fill="none"
                  strokeWidth={active && !edge.merge ? 3 : 2}
                  strokeLinecap="round"
                  strokeDasharray={edge.merge ? "2 7" : undefined}
                  style={{ stroke: active ? "var(--accent-text)" : "var(--muted)", opacity: edge.merge ? 0.9 : active ? 1 : 0.55 }}
                />
              );
            })}
          </svg>

          {/* Branch names live in a gutter that stays put while a long history scrolls. */}
          <div className="sticky left-0 z-10 h-full w-[132px] bg-surface">
            {lanes.map((branch, lane) => {
              const active = currentNode !== null && currentNode.lane === lane;
              return (
                <p
                  key={branch.id}
                  title={branch.name}
                  className={`absolute left-0 max-w-[124px] -translate-y-1/2 truncate rounded-full border px-3 py-1 text-xs ${
                    active ? "border-accent-text text-ink" : "border-line text-muted"
                  }`}
                  style={{ top: PAD_TOP + lane * LANE }}
                >
                  {branch.main && branch.name !== "main" ? `${branch.name} (main)` : branch.name}
                </p>
              );
            })}
          </div>

          {nodes.map((node) => {
            const number = node.version.versionNumber;
            const selected = number === current;
            const isPublished = number === published;
            const inCurrentBranch = currentNode !== null && node.lane === currentNode.lane;
            return (
              <button
                key={number}
                type="button"
                onClick={() => onSelect(number)}
                onMouseEnter={(event) => show(node, event.currentTarget)}
                onMouseLeave={() => setHover(null)}
                onFocus={(event) => show(node, event.currentTarget)}
                onBlur={() => setHover(null)}
                aria-label={`Version ${number} on ${node.branchName}${node.version.note ? `, ${node.version.note}` : ""}${isPublished ? ", public" : ""}${node.version.mergeParent !== null ? `, merged v${node.version.mergeParent}` : ""}`}
                aria-current={selected ? "true" : undefined}
                className="group absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center"
                style={{ left: node.x, top: node.y, width: HIT, height: HIT }}
              >
                <span
                  className={`block rounded-full border-2 transition-all duration-200 group-hover:scale-125 ${
                    selected ? "h-[22px] w-[22px] border-accent-text bg-accent-text" : "h-4 w-4 border-ink bg-bg"
                  } ${inCurrentBranch && !selected ? "border-accent-text" : ""} ${node.version.mergeParent !== null && !selected ? "ring-2 ring-accent-text ring-offset-2 ring-offset-surface" : ""}`}
                />
                {isPublished && (
                  <span aria-hidden="true" className="absolute -top-3 rounded-full bg-accent px-1.5 text-[10px] leading-4 font-bold text-on-accent">
                    public
                  </span>
                )}
                {(zoom >= LABEL_MIN_ZOOM || selected) && (
                  <span className={`absolute top-full mt-0.5 bg-surface px-1 font-mono text-[11px] ${selected ? "text-ink" : "text-muted"}`}>v{number}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <p className="flex flex-wrap gap-x-6 gap-y-1 px-1 pt-2 text-xs text-muted" aria-hidden="true">
        <span>Filled dot: open version</span>
        <span>Ringed dot: a merge</span>
        <span>Dotted line: what a merge brought in</span>
      </p>

      {hover && tip && (
        <div
          role="tooltip"
          className="pointer-events-none fixed z-40 w-[280px] -translate-x-1/2 rounded-2xl border border-line bg-bg p-4 text-sm shadow-2xl"
          style={{ left: hover.left, top: hover.top }}
        >
          <p className="font-medium">
            v{tip.versionNumber} on {hover.node.branchName}
            {hover.node.head ? <span className="ml-2 font-mono text-xs font-normal text-muted">latest</span> : null}
          </p>
          <p className={`mt-1 ${tip.note ? "" : "text-muted"}`}>{tip.note || "No note"}</p>
          <p className="mt-2 font-mono text-xs text-muted">
            {when(tip.createdAt)}, {tip.cardCount} cards, MV {tip.averageManaValue.toFixed(2)}
          </p>
          {tip.parentVersion !== null && (
            <p className="mt-1 font-mono text-xs text-muted">
              <span className="text-accent-text">+{tip.added}</span> <span>-{tip.removed}</span> vs v{tip.parentVersion}
            </p>
          )}
          {tip.mergeParent !== null && <p className="mt-1 text-xs text-accent-text">Merged in v{tip.mergeParent}</p>}
        </div>
      )}
    </div>
  );
}
