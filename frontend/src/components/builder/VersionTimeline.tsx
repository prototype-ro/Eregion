"use client";

import { useEffect, useMemo, useRef } from "react";
import type { Timeline, VersionSummary } from "@/lib/types";

const COLUMN = 76; // horizontal space per version
const LANE = 84; // vertical space per branch
const GUTTER = 148; // room on the left for branch names
const PAD_RIGHT = 56;
const PAD_TOP = 58;
const HIT = 44; // clickable size of each dot

interface Node {
  version: VersionSummary;
  lane: number;
  branchName: string;
  x: number;
  y: number;
}

interface Props {
  timeline: Timeline;
  /** The version being shown in the builder. */
  current: number | null;
  onSelect: (versionNumber: number) => void;
}

/**
 * A deck's history drawn as a multiverse timeline. Each branch is a horizontal lane of
 * dots, one per saved version. A branch curves away from the version it split from, so
 * the original line stays straight and new directions fan out below it. Click any dot to
 * open that version.
 */
export function VersionTimeline({ timeline, current, onSelect }: Props) {
  const scroller = useRef<HTMLDivElement>(null);

  const { nodes, edges, width, height, lanes } = useMemo(() => {
    const placed: Node[] = [];
    timeline.branches.forEach((branch, lane) => {
      for (const version of branch.versions) {
        placed.push({ version, lane, branchName: branch.name, x: 0, y: PAD_TOP + lane * LANE });
      }
    });
    // Versions are numbered in the order they were made, so one shared column per number
    // keeps parallel branches readable as a single timeline.
    placed.sort((a, b) => a.version.versionNumber - b.version.versionNumber);
    placed.forEach((node, index) => {
      node.x = GUTTER + index * COLUMN;
    });

    const byNumber = new Map(placed.map((node) => [node.version.versionNumber, node]));
    const paths: Array<{ d: string; lane: number; key: string }> = [];
    for (const node of placed) {
      const parentNumber = node.version.parentVersion;
      const parent = parentNumber === null ? undefined : byNumber.get(parentNumber);
      if (!parent) continue;
      const sameLane = parent.lane === node.lane;
      const mid = parent.x + (node.x - parent.x) * 0.5;
      const d = sameLane
        ? `M ${parent.x} ${parent.y} L ${node.x} ${node.y}`
        : `M ${parent.x} ${parent.y} C ${mid} ${parent.y}, ${mid} ${node.y}, ${node.x} ${node.y}`;
      paths.push({ d, lane: node.lane, key: `${parent.version.versionNumber}-${node.version.versionNumber}` });
    }

    return {
      nodes: placed,
      edges: paths,
      width: GUTTER + PAD_RIGHT + Math.max(placed.length - 1, 0) * COLUMN,
      height: PAD_TOP + (timeline.branches.length - 1) * LANE + 44,
      lanes: timeline.branches,
    };
  }, [timeline]);

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

  return (
    <div ref={scroller} className="overflow-x-auto pb-2" tabIndex={-1}>
      <div className="relative" style={{ width, height, minWidth: "100%" }}>
        <svg width={width} height={height} className="absolute inset-0" aria-hidden="true">
          {edges.map((edge) => {
            const active = currentNode !== null && edge.lane === currentNode.lane;
            return (
              <path
                key={edge.key}
                d={edge.d}
                fill="none"
                strokeWidth={active ? 3 : 2}
                strokeLinecap="round"
                style={{ stroke: active ? "var(--accent-text)" : "var(--muted)", opacity: active ? 1 : 0.55 }}
              />
            );
          })}
        </svg>

        {/* Branch names live in a gutter that stays put while a long history scrolls. */}
        <div className="sticky left-0 z-10 h-full w-[132px] bg-surface">
          {lanes.map((branch, lane) => {
            if (!nodes.some((node) => node.lane === lane)) return null;
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
                {branch.name}
              </p>
            );
          })}
        </div>

        {nodes.map((node) => {
          const selected = node.version.versionNumber === current;
          const inCurrentBranch = currentNode !== null && node.lane === currentNode.lane;
          return (
            <button
              key={node.version.versionNumber}
              type="button"
              onClick={() => onSelect(node.version.versionNumber)}
              aria-label={`Version ${node.version.versionNumber} on ${node.branchName}${node.version.note ? `, ${node.version.note}` : ""}`}
              aria-current={selected ? "true" : undefined}
              title={`v${node.version.versionNumber}${node.version.note ? `: ${node.version.note}` : ""}`}
              className="group absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center"
              style={{ left: node.x, top: node.y, width: HIT, height: HIT }}
            >
              <span
                className={`block rounded-full border-2 transition-all duration-200 group-hover:scale-125 ${
                  selected ? "h-[22px] w-[22px] border-accent-text bg-accent-text" : "h-4 w-4 border-ink bg-bg"
                } ${inCurrentBranch && !selected ? "border-accent-text" : ""}`}
              />
              <span
                className={`absolute top-full mt-0.5 bg-surface px-1 font-mono text-[11px] ${selected ? "text-ink" : "text-muted"}`}
              >
                v{node.version.versionNumber}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
