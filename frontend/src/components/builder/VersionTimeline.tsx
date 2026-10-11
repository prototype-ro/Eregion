"use client";

import { GitBranch } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { gsap, useGSAP, whenMotionAllowed } from "@/lib/motion";
import type { Timeline, VersionSummary } from "@/lib/types";

const WINDOW = 30; // versions drawn by default when a history is long
const ZOOM_MIN = 36;
const ZOOM_MAX = 120;
const ZOOM_DEFAULT = 76; // horizontal space per version
const LABEL_MIN_ZOOM = 52; // below this the version labels would overlap
const LANE = 84; // vertical space per branch
const GUTTER = 148;
const STUB = 118; // length of the dashed stub drawn when a branch's parent is not on screen
const COLLAPSE_ABOVE = 6; // up to this many branches are all drawn. With more, only the ones around the open version are at first
const RECENT_VERSIONS = 3; // a collapsed timeline draws the branches that hold this many of the newest versions
const MAX_HEIGHT = 440; // the diagram scrolls inside this, so a deck with many branches does not push the board off screen // room on the left for branch names
const PAD_RIGHT = 56;
const PAD_TOP = 58;
const HIT = 44; // clickable size of each dot

interface Node {
  version: VersionSummary;
  lane: number;
  branchId: string;
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
  /** While true, clicking a dot picks the version to compare with the open one instead of opening it. */
  comparing?: boolean;
  onCompare?: (versionNumber: number) => void;
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
export function VersionTimeline({ timeline, current, published, onSelect, comparing = false, onCompare }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);

  // When the open version changes (picked, or just saved), its dot pops so the eye lands on it.
  useGSAP(
    () => {
      if (firstRender.current) {
        firstRender.current = false;
        return;
      }
      whenMotionAllowed(() => {
        gsap.fromTo("[data-current-dot]", { scale: 0.3 }, { scale: 1, duration: 0.5, ease: "back.out(2.4)", clearProps: "transform" });
      });
    },
    { scope: scroller, dependencies: [current] },
  );
  const [hover, setHover] = useState<Hover | null>(null);
  const [zoom, setZoom] = useState(ZOOM_DEFAULT);
  const [showAll, setShowAll] = useState(false);
  const [allBranches, setAllBranches] = useState(false);
  const dots = useRef(new Map<number, HTMLButtonElement>());

  const { nodes, edges, stubs, width, height, lanes, total, hiddenBranches, collapsible } = useMemo(() => {
    // With many branches, draw only the ones holding the newest versions plus the open and public ones. A branch whose parent is not drawn gets a short labeled stub instead.
    const collapsible = timeline.branches.length > COLLAPSE_ABOVE;
    const wanted = new Set<string>();
    if (!collapsible || allBranches) {
      timeline.branches.forEach((branch) => wanted.add(branch.id));
    } else {
      const holding = (version: number | null) => timeline.branches.find((branch) => branch.versions.some((v) => v.versionNumber === version));
      // The branches of the newest few versions, then the open one and the public one.
      const newest = timeline.branches.flatMap((branch) => branch.versions.map((v) => ({ n: v.versionNumber, id: branch.id }))).sort((x, y) => y.n - x.n);
      newest.slice(0, RECENT_VERSIONS).forEach((entry) => wanted.add(entry.id));
      for (const branch of [holding(current), holding(published)]) if (branch) wanted.add(branch.id);
    }
    const all: Node[] = [];
    timeline.branches.forEach((branch, lane) => {
      if (!wanted.has(branch.id)) return;
      branch.versions.forEach((version, index) => {
        all.push({ version, lane, branchId: branch.id, branchName: branch.name, head: index === branch.versions.length - 1, x: 0, y: 0 });
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
    // When a branch splits off a branch that is not drawn, its stub needs room to the left of the first column.
    const drawn = new Set(placed.map((node) => node.version.versionNumber));
    const homeBranch = new Map<number, string>();
    timeline.branches.forEach((branch) => branch.versions.forEach((v) => homeBranch.set(v.versionNumber, branch.id)));
    const leadsToStub = placed.some((node) => {
      const parent = node.version.parentVersion;
      return parent !== null && !drawn.has(parent) && homeBranch.get(parent) !== node.branchId;
    });
    const lead = leadsToStub ? STUB : 0;
    placed.forEach((node, index) => {
      node.lane = visibleLanes.indexOf(node.lane);
      node.y = PAD_TOP + node.lane * LANE;
      node.x = GUTTER + lead + index * zoom;
    });

    const byNumber = new Map(placed.map((node) => [node.version.versionNumber, node]));
    const paths: Array<{ d: string; lane: number; key: string; merge: boolean }> = [];
    // Where a version lives, for branches that split off a branch which is not drawn.
    const homeOf = new Map<number, { id: string; name: string }>();
    timeline.branches.forEach((branch) => branch.versions.forEach((v) => homeOf.set(v.versionNumber, { id: branch.id, name: branch.name })));
    const stubList: Array<{ x: number; y: number; lane: number; label: string; full: string; key: string }> = [];
    // A branch leaves its parent with a short curve and then runs along its own lane, so lines do not
    // cut diagonally across the other branches. A merge does the reverse: along its own lane, then a short curve in.
    // How far along the lane a curve takes to change lane: a longer drop gets a longer, gentler slope, so it never turns sharply.
    const run = (from: Node, to: Node) => Math.min(Math.max(to.x - from.x, 0), Math.max(44, Math.abs(to.y - from.y) * 0.9));
    const fork = (from: Node, to: Node) => {
      if (from.lane === to.lane) return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
      const r = run(from, to);
      return `M ${from.x} ${from.y} C ${from.x + r * 0.5} ${from.y}, ${from.x + r * 0.5} ${to.y}, ${from.x + r} ${to.y} L ${to.x} ${to.y}`;
    };
    const join = (from: Node, to: Node) => {
      if (from.lane === to.lane) return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
      const r = run(from, to);
      return `M ${from.x} ${from.y} L ${to.x - r} ${from.y} C ${to.x - r * 0.5} ${from.y}, ${to.x - r * 0.5} ${to.y}, ${to.x} ${to.y}`;
    };
    for (const node of placed) {
      const parent = node.version.parentVersion === null ? undefined : byNumber.get(node.version.parentVersion);
      const parentHome = node.version.parentVersion === null ? undefined : homeOf.get(node.version.parentVersion);
      if (!parent && parentHome && parentHome.id !== node.branchId) {
        const name = parentHome.name.length > 12 ? `${parentHome.name.slice(0, 11)}…` : parentHome.name;
        stubList.push({ x: node.x, y: node.y, lane: node.lane, label: `${name} v${node.version.parentVersion}`, full: `Split from v${node.version.parentVersion} on ${parentHome.name}`, key: `s${node.version.versionNumber}` });
      }
      if (parent) paths.push({ d: fork(parent, node), lane: node.lane, key: `${parent.version.versionNumber}-${node.version.versionNumber}`, merge: false });
      const merged = node.version.mergeParent === null ? undefined : byNumber.get(node.version.mergeParent);
      if (merged) paths.push({ d: join(merged, node), lane: merged.lane, key: `m${merged.version.versionNumber}-${node.version.versionNumber}`, merge: true });
    }

    return {
      nodes: placed,
      edges: paths,
      stubs: stubList,
      width: GUTTER + lead + PAD_RIGHT + Math.max(placed.length - 1, 0) * zoom,
      height: PAD_TOP + Math.max(visibleLanes.length - 1, 0) * LANE + 44,
      lanes: visibleLanes.map((lane) => timeline.branches[lane]),
      total: all.length,
      hiddenBranches: timeline.branches.length - wanted.size,
      collapsible,
    };
  }, [timeline, zoom, showAll, allBranches, current, published]);

  const currentNode = nodes.find((node) => node.version.versionNumber === current) ?? null;

  // Bring the open version into view when the history is wider than the screen.
  useEffect(() => {
    const element = scroller.current;
    if (!element || !currentNode) return;
    element.scrollLeft = Math.max(0, currentNode.x - element.clientWidth / 2);
    // Only scroll down when the open version would be out of view, so the lanes above it stay visible.
    element.scrollTop = currentNode.y > element.clientHeight - 60 ? currentNode.y - element.clientHeight + 90 : 0;
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
      {(total > 8 || collapsible) && (
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 pb-2 text-sm text-muted">
        <p className="flex flex-wrap items-center gap-x-5 gap-y-1">
          {total > WINDOW && (showAll ? `Showing all ${total} versions.` : `Showing the latest ${nodes.length} of ${total} versions.`)}
          {total > WINDOW && (
            <button type="button" onClick={() => setShowAll((all) => !all)} className="ml-2 text-accent-text underline underline-offset-4">
              {showAll ? "Show only the latest" : `Show the ${hidden} earlier`}
            </button>
          )}
        </p>
        <div className="flex items-center gap-3">
        {collapsible && (
          <button
            type="button"
            aria-pressed={allBranches}
            onClick={() => setAllBranches((value) => !value)}
            title={allBranches ? "Show fewer branches" : `Show all ${timeline.branches.length} branches`}
            aria-label={allBranches ? "Show fewer branches" : `Show all ${timeline.branches.length} branches, ${hiddenBranches} hidden`}
            className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors [@media(pointer:coarse)]:h-11 ${allBranches ? "border-accent-text text-accent-text" : "border-line text-muted hover:border-ink hover:text-ink"}`}
          >
            <GitBranch size={16} aria-hidden />
            {allBranches ? timeline.branches.length : `+${hiddenBranches}`}
          </button>
        )}
        {total > 8 && (
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
            className="h-11 w-28 cursor-pointer accent-[var(--accent-text)]"
          />
        </label>
        )}
        </div>
      </div>
      )}
      <div className="relative">
      {/* Dot grid behind the diagram only, starting right of the branch names and fading at every edge. */}
      <div aria-hidden="true" className="dotted dotted-fade pointer-events-none absolute -top-8 right-0 bottom-0 left-[140px]" />
      <div ref={scroller} onScroll={() => setHover(null)} className="relative overflow-auto pb-2" style={{ maxHeight: MAX_HEIGHT }} tabIndex={-1}>
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
            {stubs.map((stub) => {
              const active = currentNode !== null && stub.lane === currentNode.lane;
              const color = active ? "var(--accent-text)" : "var(--muted)";
              // The label sits at the start of the dashed line, and never under the branch names on the left.
              const chip = Math.min(STUB - 24, stub.label.length * 6.2 + 14);
              const start = Math.max(stub.x - STUB, GUTTER + 2);
              return (
                <g key={stub.key}>
                  <title>{stub.full}</title>
                  <path d={`M ${start + chip} ${stub.y} L ${stub.x} ${stub.y}`} fill="none" strokeWidth={2} strokeLinecap="round" strokeDasharray="2 6" style={{ stroke: color, opacity: active ? 1 : 0.55 }} />
                  <rect x={start} y={stub.y - 11} width={chip} height={22} rx={11} style={{ fill: "var(--bg)", stroke: color, opacity: active ? 1 : 0.8 }} strokeWidth={1} />
                  <text x={start + chip / 2} y={stub.y + 4} textAnchor="middle" className="font-mono" style={{ fill: color, fontSize: 10 }}>
                    {stub.label}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Branch names live in a gutter that stays put while a long history scrolls. */}
          <div className="sticky left-0 z-10 h-full w-[148px]">
            {/* A soft blur, not a flat fill, so lines passing under the names blur out without leaving a visible box. */}
            <div aria-hidden="true" className="absolute inset-0 backdrop-blur-[5px] [mask-image:linear-gradient(to_right,#000_70%,transparent)]" />
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
                ref={(element) => {
                  if (element) dots.current.set(number, element);
                  else dots.current.delete(number);
                }}
                onKeyDown={(event) => {
                  const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
                  if (step === 0) return;
                  const neighbor = nodes[nodes.indexOf(node) + step];
                  if (neighbor) {
                    event.preventDefault();
                    dots.current.get(neighbor.version.versionNumber)?.focus();
                  }
                }}
                onClick={() => (comparing && onCompare && current !== null && number !== current ? onCompare(number) : comparing ? undefined : onSelect(number))}
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
                  data-current-dot={selected ? "" : undefined}
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
                  <span className={`absolute top-full mt-0.5 px-1 font-mono text-[11px] ${selected ? "text-ink" : "text-muted"}`}>v{number}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      </div>

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
          {comparing && current !== null && tip.versionNumber !== current && (
            <p className="mt-2 text-xs text-accent-text">Click to compare with v{current}</p>
          )}
        </div>
      )}
    </div>
  );
}
