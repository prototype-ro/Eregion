"use client";

import { Check, GitBranch } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { artHue, DEFAULT_STRAND, strandColorOf } from "@/lib/artColor";
import { Flip, gsap, MOTION, REDUCED, useGSAP, whenMotionAllowed } from "@/lib/motion";
import type { Timeline, VersionSummary } from "@/lib/types";
import { NodeTip } from "./NodeTip";
import { StrandLayer, type Strand } from "./StrandLayer";

const WINDOW = 30; // versions drawn by default when a history is long
const ZOOM_MIN = 36;
const ZOOM_MAX = 120;
const ZOOM_DEFAULT = 76; // horizontal space per version
const LABEL_MIN_ZOOM = 52; // below this the version labels would overlap
const LANE = 76; // vertical space per branch
const GUTTER = 148;
const STUB = 118; // longest dashed stub drawn when a branch's parent is not on screen
const LEAD = 76; // room left of the first column for a stub, the same for every deck so a version never moves because of which branches are drawn
const COLLAPSE_ABOVE = 6; // up to this many branches are all drawn. With more, only the ones around the open version are at first
const RECENT_VERSIONS = 3; // a collapsed timeline draws the branches that hold this many of the newest versions
const MAX_HEIGHT = "min(78vh, 760px)"; // the diagram scrolls inside this, so a deck with many branches does not push the board off screen
const PAD_RIGHT = 56;
const PAD_TOP = 40;
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
  /** Where the branch and zoom controls go: the panel's title row, so they take no row of their own. */
  controlsSlot?: HTMLElement | null;
  /** Used to remember, for this deck, whether all branches are shown and how far the timeline is zoomed. */
  deckId: string;
  /** A branch name was clicked: the builder opens that branch's menu under it. */
  onBranchClick?: (branchId: string, anchor: HTMLElement) => void;
  /** The branch whose menu is open, drawn as pressed. */
  menuBranchId?: string | null;
  /** The commander's art. The strands take their colour from it unless a colour was picked. */
  artUrl?: string | null;
}

interface Hover {
  node: Node;
  left: number;
  top: number;
}

/** Which branches are drawn: all of them, or with many branches only those holding the newest versions plus the open and public ones. */
function branchesToDraw(timeline: Timeline, current: number | null, published: number | null, everything: boolean, pinned: Set<string>): Set<string> {
  const wanted = new Set<string>();
  if (everything || timeline.branches.length <= COLLAPSE_ABOVE) {
    timeline.branches.forEach((branch) => wanted.add(branch.id));
    return wanted;
  }
  const holding = (version: number | null) => timeline.branches.find((branch) => branch.versions.some((v) => v.versionNumber === version));
  const newest = timeline.branches.flatMap((branch) => branch.versions.map((v) => ({ n: v.versionNumber, id: branch.id }))).sort((x, y) => y.n - x.n);
  newest.slice(0, RECENT_VERSIONS).forEach((entry) => wanted.add(entry.id));
  for (const branch of [holding(current), holding(published)]) if (branch) wanted.add(branch.id);
  // A branch you have opened stays drawn until you collapse again, so lanes do not vanish as you move between versions.
  pinned.forEach((id) => wanted.add(id));
  return wanted;
}

/** The colours a person can pick for the strands, besides the one taken from the commander's art. */
const STRAND_CHOICES: Array<[string, string]> = [["#38d6ff", "Cyan"], ["#9b6bff", "Violet"], ["#ff4fd8", "Magenta"], ["#3dff8a", "Green"], ["#ffb02e", "Amber"]];
const STRAND_KEY = "eregion-strand-color";

/** Whether the page is showing its dark theme. On a light one the strands are drawn as ink instead of light. */
function useDarkTheme() {
  const [dark, setDark] = useState(true);
  useEffect(() => {
    const read = () => {
      const set = document.documentElement.getAttribute("data-theme");
      setDark(set ? set === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches);
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    query.addEventListener("change", read);
    return () => {
      observer.disconnect();
      query.removeEventListener("change", read);
    };
  }, []);
  return dark;
}

const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

/**
 * A deck's history drawn as a multiverse timeline. Each branch is a horizontal lane of dots, one per
 * saved version. A branch curves away from the version it split from, and a dashed curve joins a merge
 * to the branch it brought in. Hover or focus a dot for its note, date and what changed, and click it to open that version.
 */
export function VersionTimeline({ timeline, current, published, onSelect, comparing = false, onCompare, controlsSlot = null, deckId, onBranchClick, menuBranchId = null, artUrl = null }: Props) {
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
  // What the tooltip showed last, kept while it fades out, so it does not go blank on its way off.
  const lastHover = useRef<Hover | null>(null);
  if (hover) lastHover.current = hover;
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The strands hold still while a tooltip opens, so nothing else is drawing while the card changes shape.
  const [tipBusy, setTipBusy] = useState(false);
  const busyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hiddenAt = useRef(0);
  // Opening another version remounts the builder, so these are kept for the tab and read back, not lost on every click.
  const memory = `eregion-timeline:${deckId}`;
  const remembered = useMemo(() => {
    try {
      return JSON.parse(sessionStorage.getItem(memory) ?? "{}") as { allBranches?: boolean; zoom?: number };
    } catch {
      return {};
    }
  }, [memory]);
  const [zoom, setZoom] = useState(typeof remembered.zoom === "number" ? Math.min(Math.max(remembered.zoom, ZOOM_MIN), ZOOM_MAX) : ZOOM_DEFAULT);
  const [showAll, setShowAll] = useState(false);
  const [allBranches, setAllBranches] = useState(remembered.allBranches === true);
  useEffect(() => {
    try {
      sessionStorage.setItem(memory, JSON.stringify({ allBranches, zoom }));
    } catch {
      // Not remembered.
    }
  }, [memory, allBranches, zoom]);
  // Whether there is more of the diagram above or below, so the edge can fade instead of just stopping.
  const [more, setMore] = useState({ top: false, bottom: false });
  const measureMore = () => {
    const element = scroller.current;
    if (!element) return;
    const next = { top: element.scrollTop > 4, bottom: element.scrollTop + element.clientHeight < element.scrollHeight - 4 };
    setMore((previous) => (previous.top === next.top && previous.bottom === next.bottom ? previous : next));
  };
  const dots = useRef(new Map<number, HTMLButtonElement>());

  // The colour of the strands: picked by the person, or by default taken from the commander's art.
  const dark = useDarkTheme();
  const [glOk, setGlOk] = useState(true);
  const useGl = glOk;
  const [choice, setChoice] = useState<string>("auto");
  const [autoHue, setAutoHue] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STRAND_KEY);
      if (saved && (saved === "auto" || STRAND_CHOICES.some(([hex]) => hex === saved))) setChoice(saved);
    } catch {
      // Keep the default.
    }
  }, []);
  useEffect(() => {
    let cancelled = false;
    void artHue(artUrl).then((hue) => !cancelled && setAutoHue(hue));
    return () => {
      cancelled = true;
    };
  }, [artUrl]);
  const strandColor = choice !== "auto" ? choice : autoHue !== null ? strandColorOf(autoHue) : DEFAULT_STRAND;
  function pick(next: string) {
    setChoice(next);
    setPickerOpen(false);
    try {
      localStorage.setItem(STRAND_KEY, next);
    } catch {
      // Not remembered.
    }
  }
  const pickerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!pickerOpen) return;
    const away = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as globalThis.Node)) setPickerOpen(false);
    };
    const escape = (event: KeyboardEvent) => event.key === "Escape" && setPickerOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [pickerOpen]);
  // The dot grid keeps clear of the branch names: where each name's pill is, in the canvas's own pixels. Read on every frame, so it follows scrolling, a longer name, and lanes that glide.
  const clearAroundNames = (canvas: HTMLCanvasElement) => {
    const origin = canvas.getBoundingClientRect();
    const out: number[] = [];
    canvas.parentElement?.querySelectorAll<HTMLElement>("[data-flip-id^='b-']").forEach((pill) => {
      const box = pill.getBoundingClientRect();
      out.push(box.left - origin.left, box.top - origin.top, box.width, box.height);
    });
    return out;
  };
  const root = useRef<HTMLDivElement>(null);
  // Strands and dots slide under the branch names while a long history scrolls, so they fade out just before the widest name. With the history at its start nothing fades.
  const updateFade = () => {
    const box = scroller.current;
    if (!box || !root.current) return;
    const origin = box.getBoundingClientRect().left;
    let edge = 0;
    box.querySelectorAll<HTMLElement>("[data-flip-id^='b-']").forEach((pill) => {
      edge = Math.max(edge, pill.getBoundingClientRect().right - origin);
    });
    const sx = box.scrollLeft;
    const start = sx + edge + 2 - (1 - Math.min(sx / 60, 1)) * 520;
    root.current.style.setProperty("--fade-a", `${start}px`);
    root.current.style.setProperty("--fade-b", `${start + 30}px`);
  };
  // The names can change width with the branches drawn, so it is measured again after every render.
  useEffect(() => updateFade());
  // What the diagram looked like just before the branches were shown or hidden, for Flip to animate from.
  const before = useRef<{ state: Flip.FlipState; height: number; lanes: string } | null>(null);
  const { contextSafe } = useGSAP({ scope: root });

  const currentHome = timeline.branches.find((branch) => branch.versions.some((v) => v.versionNumber === current))?.id;
  const [pinned, setPinned] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    if (currentHome) setPinned((previous) => (previous.has(currentHome) ? previous : new Set(previous).add(currentHome)));
  }, [currentHome]);

  const { nodes, edges, stubs, width, height, lanes, laneKey, total, shown, hiddenBranches, collapsible } = useMemo(() => {
    // With many branches, draw only the ones holding the newest versions plus the open and public ones. A branch whose parent is not drawn gets a short labeled stub instead.
    const collapsible = timeline.branches.length > COLLAPSE_ABOVE;
    const wanted = branchesToDraw(timeline, current, published, allBranches, pinned);
    // Every version of the deck, drawn or not. Versions are numbered in the order they were made, so one shared column per
    // number keeps parallel branches readable as a single timeline, and a version keeps its column whatever branches are drawn.
    const everything: Node[] = [];
    timeline.branches.forEach((branch, lane) => {
      branch.versions.forEach((version, index) => {
        everything.push({ version, lane, branchId: branch.id, branchName: branch.name, head: index === branch.versions.length - 1, x: 0, y: 0 });
      });
    });
    everything.sort((a, b) => a.version.versionNumber - b.version.versionNumber);

    // A long history draws only its latest versions, plus the one that is open and the public one.
    const windowed =
      showAll || everything.length <= WINDOW
        ? everything
        : everything.filter((node, index) => index >= everything.length - WINDOW || node.version.versionNumber === current || node.version.versionNumber === published);
    const placed = windowed.filter((node) => wanted.has(node.branchId));
    const column = new Map(windowed.map((node, index) => [node.version.versionNumber, index]));

    // Branches with nothing in view give up their lane.
    const visibleLanes = [...new Set(placed.map((node) => node.lane))].sort((a, b) => a - b);
    placed.forEach((node) => {
      node.lane = visibleLanes.indexOf(node.lane);
      node.y = PAD_TOP + node.lane * LANE;
      node.x = GUTTER + LEAD + (column.get(node.version.versionNumber) ?? 0) * zoom;
    });
    const lastColumn = placed.reduce((most, node) => Math.max(most, column.get(node.version.versionNumber) ?? 0), 0);

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
      width: GUTTER + LEAD + PAD_RIGHT + lastColumn * zoom,
      height: PAD_TOP + Math.max(visibleLanes.length - 1, 0) * LANE + 44,
      lanes: visibleLanes.map((lane) => timeline.branches[lane]),
      laneKey: visibleLanes.map((lane) => timeline.branches[lane].id).join("|"),
      total: everything.length,
      shown: windowed.length,
      hiddenBranches: timeline.branches.length - wanted.size,
      collapsible,
    };
  }, [timeline, zoom, showAll, allBranches, current, published, pinned]);

  const currentNode = nodes.find((node) => node.version.versionNumber === current) ?? null;
  const strands = useMemo<Strand[]>(() => edges.map((edge) => ({ d: edge.d, merge: edge.merge, live: currentNode !== null && edge.lane === currentNode.lane })), [edges, currentNode]);

  // Bring the open version into view when the history is wider than the screen. The first time it is centered. After that
  // the diagram only moves when the version you open is out of sight, so clicking a dot never throws the diagram around.
  const placedOnce = useRef(false);
  useEffect(() => {
    const element = scroller.current;
    if (!element || !currentNode) return;
    const wantLeft = Math.max(0, currentNode.x - element.clientWidth / 2);
    // Only scroll down as far as needed, so the lanes above stay visible.
    const wantTop = Math.max(0, currentNode.y + 40 - element.clientHeight);
    if (!placedOnce.current) {
      placedOnce.current = true;
      element.scrollLeft = wantLeft;
      element.scrollTop = wantTop;
      return;
    }
    const seenX = currentNode.x > element.scrollLeft + GUTTER && currentNode.x < element.scrollLeft + element.clientWidth - 32;
    const seenY = currentNode.y > element.scrollTop + 8 && currentNode.y < element.scrollTop + element.clientHeight - 36;
    if (seenX && seenY) return;
    element.scrollTo({ left: seenX ? element.scrollLeft : wantLeft, top: seenY ? element.scrollTop : wantTop, behavior: window.matchMedia(REDUCED).matches ? "auto" : "smooth" });
  }, [currentNode]);
  useEffect(measureMore);

  /**
   * Showing or hiding branches. Hiding first fades out the lanes that leave, then the rest glide together.
   * Showing lets the new lanes fade in while the others slide down to make room. Reduced motion just switches.
   */
  /** What the diagram looks like right now, for Flip to animate from when lanes move. */
  const capture = () => ({ state: Flip.getState("[data-flip-id]"), height: scroller.current?.getBoundingClientRect().height ?? 0, lanes: laneKey });

  const toggleBranches = contextSafe(() => {
    const next = !allBranches;
    const container = root.current;
    const animate = !window.matchMedia(REDUCED).matches && container !== null;
    if (!animate) {
      setAllBranches(next);
      return;
    }
    // A second click in the middle of a move starts from where things are now.
    Flip.killFlipsOf("[data-flip-id]");
    gsap.killTweensOf("[data-flip-id], .tl-edges");
    const commit = () => {
      before.current = capture();
      // Collapsing again forgets the branches opened along the way, apart from the one that is open.
      if (!next) setPinned(new Set(currentHome ? [currentHome] : []));
      setAllBranches(next);
    };
    if (next) {
      commit();
      return;
    }
    const staying = branchesToDraw(timeline, current, published, false, new Set(currentHome ? [currentHome] : []));
    const leaving = Array.from(container.querySelectorAll<HTMLElement>("[data-branch-id]")).filter((element) => !staying.has(element.dataset.branchId ?? ""));
    gsap.to(".tl-edges", { autoAlpha: 0, duration: 0.15 });
    // The stagger is spread over a fixed total, so a long history does not make the wait longer.
    gsap.to(leaving, { autoAlpha: 0, y: -6, duration: 0.18, ease: MOTION.ease, stagger: { amount: 0.12 }, onComplete: commit });
  });

  useGSAP(
    () => {
      const saved = before.current;
      if (!saved) return;
      before.current = null;
      // Nothing moved lanes, so there is nothing to animate.
      if (saved.lanes === laneKey) return;
      whenMotionAllowed(() => {
        const frame = scroller.current;
        const tl = gsap.timeline();
        gsap.set(".tl-edges", { autoAlpha: 0 });
        tl.add(
          Flip.from(saved.state, {
            targets: "[data-flip-id]",
            duration: 0.42,
            ease: "power2.inOut",
            onEnter: (entering) => gsap.fromTo(entering, { autoAlpha: 0, y: -10 }, { autoAlpha: 1, y: 0, duration: 0.3, ease: MOTION.ease, stagger: { amount: 0.15 } }),
          }),
          0,
        );
        // The panel grows or shrinks with its lanes, so the board below moves smoothly instead of jumping.
        const after = frame?.getBoundingClientRect().height ?? 0;
        if (frame && Math.abs(after - saved.height) > 1) tl.fromTo(frame, { height: saved.height }, { height: after, duration: 0.42, ease: "power2.inOut", clearProps: "height" }, 0);
        // Lines come back last, once the lanes have settled.
        tl.to(".tl-edges", { autoAlpha: 1, duration: 0.25, ease: MOTION.ease }, 0.28);
      });
    },
    { dependencies: [allBranches, current], scope: root },
  );

  if (nodes.length === 0) {
    return <p className="py-6 text-muted">No versions yet. Save the first one to start the timeline.</p>;
  }

  /**
   * The tooltip waits a moment before it opens, so sweeping the pointer across the dots does not flash one for each. Once one is
   * open, or one has just closed, moving to the next dot shows its tooltip at once. A keyboard focus shows it without waiting.
   */
  function show(node: Node, element: HTMLElement, wait = true) {
    const box = element.getBoundingClientRect();
    const next = { node, left: Math.min(Math.max(box.left + box.width / 2, 150), window.innerWidth - 150), top: box.bottom + 14 };
    if (showTimer.current) clearTimeout(showTimer.current);
    const warm = hover !== null || performance.now() - hiddenAt.current < 260;
    if (!wait || warm) {
      if (hover === null) {
        setTipBusy(true);
        if (busyTimer.current) clearTimeout(busyTimer.current);
        busyTimer.current = setTimeout(() => setTipBusy(false), 1000);
      }
      setHover(next);
    }
    else {
      showTimer.current = setTimeout(() => {
        setTipBusy(true);
        if (busyTimer.current) clearTimeout(busyTimer.current);
        busyTimer.current = setTimeout(() => setTipBusy(false), 1000);
        setHover(next);
      }, 320);
    }
  }
  function hide() {
    if (showTimer.current) clearTimeout(showTimer.current);
    showTimer.current = null;
    if (hover) hiddenAt.current = performance.now();
    setHover(null);
  }

  const last = hover ?? lastHover.current;
  const tipVersion = last?.node.version;

  const hidden = total - shown;

  return (
    <div ref={root} style={{ ["--strand" as string]: useGl ? strandColor : "var(--accent-text)" }}>
      {controlsSlot && createPortal(
      <div className="flex flex-wrap items-center justify-end gap-x-5 gap-y-1 text-sm text-muted">
        <p className="flex flex-wrap items-center gap-x-5 gap-y-1">
          {total > WINDOW && (showAll ? `Showing all ${total} versions.` : `Showing the latest ${shown} of ${total} versions.`)}
          {total > WINDOW && (
            <button type="button" onClick={() => setShowAll((all) => !all)} className="ml-2 text-accent-text underline underline-offset-4">
              {showAll ? "Show only the latest" : `Show the ${hidden} earlier`}
            </button>
          )}
        </p>
        <div className="flex items-center gap-3">
        {(
          <div ref={pickerRef} className="relative">
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={pickerOpen}
              aria-label="Strand colour"
              title="Strand colour"
              onClick={() => setPickerOpen((value) => !value)}
              className="inline-flex size-9 items-center justify-center rounded-full border border-line transition-colors hover:border-ink [@media(pointer:coarse)]:size-11"
            >
              <span aria-hidden="true" className="size-4 rounded-full" style={{ background: strandColor, boxShadow: `0 0 10px ${strandColor}` }} />
            </button>
            {pickerOpen && (
              <div role="menu" className="absolute top-full right-0 z-40 mt-2 w-60 rounded-2xl border border-line bg-bg p-2 shadow-[0_18px_40px_rgba(0,0,0,0.45)]">
                <button type="button" role="menuitemradio" aria-checked={choice === "auto"} onClick={() => pick("auto")} className="flex min-h-9 [@media(pointer:coarse)]:min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm text-ink transition-colors hover:bg-surface">
                  <span aria-hidden="true" className="size-5 rounded-full" style={{ background: autoHue !== null ? strandColorOf(autoHue) : DEFAULT_STRAND }} />
                  <span className="flex-1">From the commander</span>
                  {choice === "auto" && <Check size={16} aria-hidden />}
                </button>
                <div className="mt-1 flex items-center justify-between gap-1 px-1 pb-1">
                  {STRAND_CHOICES.map(([hex, name]) => (
                    <button
                      key={hex}
                      type="button"
                      role="menuitemradio"
                      aria-checked={choice === hex}
                      aria-label={name}
                      title={name}
                      onClick={() => pick(hex)}
                      className="flex size-11 items-center justify-center rounded-full transition-transform hover:scale-110"
                    >
                      <span className="flex size-7 items-center justify-center rounded-full" style={{ background: hex, boxShadow: choice === hex ? `0 0 0 2px var(--bg), 0 0 0 4px ${hex}` : "none" }}>
                        {choice === hex && <Check size={14} weight="bold" aria-hidden className="text-black" />}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {collapsible && (
          <button
            type="button"
            aria-pressed={allBranches}
            onClick={toggleBranches}
            title={allBranches ? "Show fewer branches" : `Show all ${timeline.branches.length} branches`}
            aria-label={allBranches ? "Show fewer branches" : `Show all ${timeline.branches.length} branches, ${hiddenBranches} hidden`}
            className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors [@media(pointer:coarse)]:h-11 ${allBranches ? "border-accent-text text-accent-text" : "border-line text-muted hover:border-ink hover:text-ink"}`}
          >
            <GitBranch size={16} aria-hidden className={`transition-transform duration-300 motion-reduce:transition-none ${allBranches ? "rotate-90" : ""}`} />
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
            className="h-9 w-28 cursor-pointer accent-[var(--accent-text)]"
          />
        </label>
        )}
        </div>
      </div>,
        controlsSlot,
      )}
      <div className="relative">
      {/* Dot grid behind the diagram only, starting right of the branch names and fading at every edge. */}
      {!useGl && <div aria-hidden="true" className="dotted dotted-fade pointer-events-none absolute inset-0" />}
      <div ref={scroller} onScroll={() => {
          hide();
          measureMore();
          updateFade();
        }}
        className="relative overflow-auto pb-2"
        style={{
          maxHeight: MAX_HEIGHT,
          // A soft edge where the diagram continues above or below.
          maskImage: `linear-gradient(to bottom, ${more.top ? "transparent, #000 28px" : "#000, #000 0"}, ${more.bottom ? "#000 calc(100% - 28px), transparent" : "#000 100%, #000 100%"})`,
          WebkitMaskImage: `linear-gradient(to bottom, ${more.top ? "transparent, #000 28px" : "#000, #000 0"}, ${more.bottom ? "#000 calc(100% - 28px), transparent" : "#000 100%, #000 100%"})`,
        }}
        tabIndex={-1}
      >
        <div className="relative" style={{ width, height, minWidth: "100%" }}>
          <div className="tl-fade absolute inset-0">
          {useGl && <StrandLayer strands={strands} width={width} height={height} color={strandColor} light={!dark} getClear={clearAroundNames} paused={tipBusy} onUnsupported={() => setGlOk(false)} />}
          <svg width={width} height={height} className="absolute inset-0" aria-hidden="true">
            <g className="tl-edges">
            {!useGl && edges.map((edge) => {
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
              const color = active ? (useGl ? strandColor : "var(--accent-text)") : "var(--muted)";
              // The label sits at the start of the dashed line, and never under the branch names on the left.
              const start = Math.max(stub.x - STUB, GUTTER + 2);
              const chip = Math.max(0, Math.min(stub.x - start - 12, stub.label.length * 6.2 + 14));
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
            </g>
          </svg>
          </div>

          {/* Branch names live in a gutter that stays put while a long history scrolls. */}
          <div className="pointer-events-none sticky left-0 z-10 h-full w-[148px]">
            {/* A soft blur, not a flat fill, so lines passing under the names blur out without leaving a visible box. */}
            {!useGl && <div aria-hidden="true" className="pointer-events-none absolute inset-0 backdrop-blur-[5px] [mask-image:linear-gradient(to_right,#000_70%,transparent)]" />}
            {lanes.map((branch, lane) => {
              const active = currentNode !== null && currentNode.lane === lane;
              return (
                <button
                  type="button"
                  key={branch.id}
                  data-flip-id={`b-${branch.id}`}
                  data-branch-id={branch.id}
                  title={`${branch.name}: open its menu`}
                  aria-haspopup="menu"
                  aria-expanded={menuBranchId === branch.id}
                  onClick={(event) => onBranchClick?.(branch.id, event.currentTarget)}
                  className={`absolute left-0 max-w-[124px] -translate-y-1/2 truncate pointer-events-auto cursor-pointer rounded-full border px-3 py-1 text-xs transition-colors [@media(pointer:coarse)]:min-h-11 hover:border-ink hover:text-ink ${
                    active ? "border-[var(--strand)] text-ink" : "border-line text-muted"
                  }`}
                  style={{ top: PAD_TOP + lane * LANE }}
                >
                  {branch.main && branch.name !== "main" ? `${branch.name} (main)` : branch.name}
                </button>
              );
            })}
          </div>

          <div className="tl-fade pointer-events-none absolute inset-0 [&>*]:pointer-events-auto">
          {nodes.map((node) => {
            const number = node.version.versionNumber;
            const selected = number === current;
            const isPublished = number === published;
            const inCurrentBranch = currentNode !== null && node.lane === currentNode.lane;
            return (
              <button
                key={number}
                type="button"
                data-flip-id={`v-${number}`}
                data-branch-id={node.branchId}
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
                onClick={() => {
                  if (comparing) {
                    if (onCompare && current !== null && number !== current) onCompare(number);
                    return;
                  }
                  // Remember where everything is, so lanes that move because another version opens glide instead of jumping.
                  before.current = capture();
                  onSelect(number);
                }}
                onMouseEnter={(event) => show(node, event.currentTarget)}
                onMouseLeave={hide}
                onFocus={(event) => show(node, event.currentTarget, false)}
                onBlur={hide}
                aria-label={`Version ${number} on ${node.branchName}${node.version.note ? `, ${node.version.note}` : ""}${isPublished ? ", public" : ""}${node.version.mergeParent !== null ? `, merged v${node.version.mergeParent}` : ""}`}
                aria-current={selected ? "true" : undefined}
                className="group absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center"
                style={{ left: node.x, top: node.y, width: HIT, height: HIT }}
              >
                <span
                  data-current-dot={selected ? "" : undefined}
                  className={`block rounded-full border-2 transition-all duration-200 group-hover:scale-125 ${
                    selected ? "h-[22px] w-[22px] border-[var(--strand)] bg-[var(--strand)]" : "h-4 w-4 border-ink bg-bg"
                  } ${inCurrentBranch && !selected ? "border-[var(--strand)]" : ""} ${node.version.mergeParent !== null && !selected ? "ring-2 ring-[var(--strand)] ring-offset-2 ring-offset-surface" : ""}`}
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
      </div>

      <NodeTip show={hover !== null} left={last?.left} top={last?.top} contentKey={tipVersion?.versionNumber}>
        {last && tipVersion && (
          <>
          <p data-tip-line className="font-medium">
            v{tipVersion.versionNumber} on {last.node.branchName}
            {last.node.head ? <span className="ml-2 font-mono text-xs font-normal text-muted">latest</span> : null}
          </p>
          <p data-tip-line className={`mt-1 ${tipVersion.note ? "" : "text-muted"}`}>{tipVersion.note || "No note"}</p>
          <p data-tip-line className="mt-2 font-mono text-xs text-muted">
            {when(tipVersion.createdAt)}, {tipVersion.cardCount} cards, MV {tipVersion.averageManaValue.toFixed(2)}
          </p>
          {tipVersion.parentVersion !== null && (
            <p data-tip-line className="mt-1 font-mono text-xs text-muted">
              <span className="text-accent-text">+{tipVersion.added}</span> <span>-{tipVersion.removed}</span> vs v{tipVersion.parentVersion}
            </p>
          )}
          {tipVersion.mergeParent !== null && <p data-tip-line className="mt-1 text-xs text-accent-text">Merged in v{tipVersion.mergeParent}</p>}
          {comparing && current !== null && tipVersion.versionNumber !== current && (
            <p data-tip-line className="mt-2 text-xs text-accent-text">Click to compare with v{current}</p>
          )}
          </>
        )}
      </NodeTip>
    </div>
  );
}
