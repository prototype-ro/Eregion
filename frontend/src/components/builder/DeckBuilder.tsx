"use client";

import { CaretUp, GlobeSimple, LockSimple, PencilSimpleLine, SlidersHorizontal } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Presence } from "@/components/motion/Presence";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dialog } from "@/components/Dialog";
import { ExportDialog } from "@/components/ExportDialog";
import { api, ApiError } from "@/lib/api";
import { allTags, GROUP_MODES, groupLines, lineKey, SORT_MODES, type GroupMode, type SortDirection, type SortMode } from "@/lib/groups";
import { checkLegality } from "@/lib/legality";
import { customArtUrl } from "@/lib/links";
import { computeStats } from "@/lib/stats";
import { loginUrl } from "@/lib/auth";
import { clearDraft, loadDraft, saveDraft } from "@/lib/draft";
import { inheritArt } from "@/lib/importArt";
import { canApplyInPlace } from "@/lib/versions";
import { btn, tag } from "@/lib/ui";
import type { Board, Card, DeckCardLine, DeckDetail, Branch, CustomPrinting, Printing, Timeline, VersionDetail, Visibility } from "@/lib/types";
import { CardList } from "./CardList";
import { DescriptionDialog } from "./DescriptionDialog";
import { VisibilityDialog } from "./VisibilityDialog";
import { CardMenu, type MenuTarget } from "./CardMenu";
import { CardPeek } from "./CardPeek";
import { CardPreview } from "./CardPreview";
import { CardSearch } from "./CardSearch";
import { CardGallery, CardStacks } from "./CardViews";
import { ImportDialog, type ImportedCard } from "./ImportDialog";
import { PrintingPicker } from "./PrintingPicker";
import { StatsSection } from "./StatsSection";
import { TagEditor } from "./TagEditor";
import { BranchesDialog } from "./BranchesDialog";
import { BranchMenu } from "./BranchMenu";
import { CardHistoryDialog } from "./CardHistoryDialog";
import { MergeDialog } from "./MergeDialog";
import { SortDirectionButton } from "./SortDirectionButton";
import { VersionActions } from "./VersionActions";
import { VersionTimeline } from "./VersionTimeline";

type Tab = "main" | "maybe" | "considering";
type ViewMode = "list" | "stacks" | "gallery";

const TABS: Array<[Tab, string]> = [
  ["main", "Mainboard"],
  ["maybe", "Maybeboard"],
  ["considering", "Considering"],
];

const VIEWS: Array<[ViewMode, string]> = [
  ["list", "List"],
  ["stacks", "Stacks"],
  ["gallery", "Gallery"],
];

const MAX_QUANTITY = 99;
const VIEW_KEY = "eregion-deck-view";
const SIZE_KEY = "eregion-card-size";
const GROUP_KEY = "eregion-deck-group";
const SORT_KEY = "eregion-deck-sort";
const SORT_DIR_KEY = "eregion-deck-sort-direction";
const SIZE_MIN = 120;
const SIZE_MAX = 360;
const SIZE_DEFAULT = 210;
const TIMELINE_KEY = "eregion-timeline-open";
const COLLECTION_KEY = "eregion-collection-check";

function lineFromCard(card: Card, board: Board, quantity = 1): DeckCardLine {
  return {
    cardId: card.id,
    name: card.name,
    manaCost: card.manaCost,
    manaValue: card.manaValue,
    primaryType: card.primaryType,
    typeLine: card.typeLine,
    colors: card.colors,
    colorIdentity: card.colorIdentity,
    oracleText: card.oracleText,
    commanderLegality: card.commanderLegality,
    rarity: card.rarity,
    artist: card.artist,
    imageSmall: card.imageSmall,
    imageNormal: card.imageNormal,
    imageArtCrop: card.imageArtCrop,
    printingId: card.scryfallId,
    customPrintingId: null,
    setCode: card.setCode,
    setName: card.setName,
    collectorNumber: card.collectorNumber,
    priceUsd: card.priceUsd,
    board,
    quantity,
    owned: 0,
    tags: [],
  };
}

/** Order-independent fingerprint of a card list, used to tell whether the draft changed. */
const signature = (lines: DeckCardLine[]) =>
  lines
    .map((line) => `${lineKey(line)}:${line.quantity}:${line.printingId}:${line.customPrintingId ?? ""}:${[...line.tags].sort().join("|")}`)
    .sort()
    .join(",");

const field =
  "min-h-9 [@media(pointer:coarse)]:min-h-11 rounded-full border border-line bg-surface px-4 text-sm text-ink placeholder:text-muted focus:border-ink focus:outline-none";

/** Removes one copy of a line, dropping the line when that was the last copy. */
function takeOne(lines: DeckCardLine[], target: DeckCardLine): DeckCardLine[] {
  return lines.flatMap((line) => {
    if (lineKey(line) !== lineKey(target)) return [line];
    return line.quantity > 1 ? [{ ...line, quantity: line.quantity - 1 }] : [];
  });
}

/** Joins lines that ended up with the same card on the same board. */
function mergeAll(lines: DeckCardLine[]): DeckCardLine[] {
  const merged = new Map<string, DeckCardLine>();
  for (const line of lines) {
    const seen = merged.get(lineKey(line));
    merged.set(lineKey(line), seen ? { ...seen, quantity: Math.min(MAX_QUANTITY, seen.quantity + line.quantity) } : line);
  }
  return [...merged.values()];
}

function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the choice just is not remembered.
  }
}

interface Props {
  deck: { id: string; name: string; format: string; visibility: Visibility; publishedVersion: number | null; description: string };
  /** The version opened in the builder. Null for a deck with no saved version yet. */
  version: VersionDetail | null;
  timeline: Timeline;
  /** How many copies of each card the user owns, by card id. */
  owned: Map<string, number>;
  /** Called with the new version number after a successful save. */
  onSaved: (versionNumber: number) => void;
  onSelectVersion: (versionNumber: number) => void;
  /** Reloads the deck, its timeline and the open version after branches changed. */
  onReload: () => void;
  /**
   * The version that was just deleted and can still be undone. It lives in the page, because deleting a version opens
   * another one, which remounts the builder and would otherwise throw the Undo pill away.
   */
  undoDelete: number | null;
  onUndoDeleteChange: (versionNumber: number | null) => void;
}

export function DeckBuilder({ deck, version, timeline, owned, onSaved, onSelectVersion, onReload, undoDelete, onUndoDeleteChange: setUndoDelete }: Props) {
  const baseLines = useMemo(() => version?.cards ?? [], [version]);

  const [lines, setLines] = useState<DeckCardLine[]>(baseLines);
  const versionNumber = version?.versionNumber ?? 0;
  // Edits kept from an earlier visit that ended before they were saved. Offered once, then restored or dropped.
  const recoveredFor = (number: number, base: DeckCardLine[]) => {
    const kept = loadDraft(deck.id, number, signature(base));
    return kept && signature(kept.lines) !== signature(base) ? kept : null;
  };
  const [recovered, setRecovered] = useState(() => recoveredFor(versionNumber, baseLines));
  const [sessionEnded, setSessionEnded] = useState(false);
  const [tab, setTab] = useState<Tab>("main");
  const [group, setGroup] = useState<GroupMode>("type");
  const [sort, setSort] = useState<SortMode>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [view, setView] = useState<ViewMode>("list");
  const [cardSize, setCardSize] = useState(SIZE_DEFAULT);
  const [timelineOpen, setTimelineOpen] = useState(true);
  // Phones fold the group, sort and collection controls away; the board itself comes first.
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [visibility, setVisibility] = useState<Visibility>(deck.visibility);
  const [publishedVersion, setPublishedVersion] = useState<number | null>(deck.publishedVersion);
  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const [branchesOpen, setBranchesOpen] = useState(false);
  // The small menu opened from a branch name on the timeline. What it showed last is kept while it animates away.
  const [branchMenu, setBranchMenu] = useState<{ branchId: string; anchor: HTMLElement } | null>(null);
  const lastBranchMenu = useRef<{ branchId: string; anchor: HTMLElement } | null>(null);
  if (branchMenu) lastBranchMenu.current = branchMenu;
  const [mergeBranch, setMergeBranch] = useState<Branch | null>(null);
  const [mergeInto, setMergeInto] = useState<Branch | null>(null);
  const [historyKey, setHistoryKey] = useState<string | null>(null);
  const [confirmApply, setConfirmApply] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const [pendingVersion, setPendingVersion] = useState<number | null>(null);
  // Off by default: until the collection is filled in, flagging every card as missing is just noise.
  const [checkCollection, setCheckCollection] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [branching, setBranching] = useState(false);
  const [branchName, setBranchName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [menu, setMenu] = useState<MenuTarget | null>(null);
  const [peekKey, setPeekKey] = useState<string | null>(null);
  const [printingKey, setPrintingKey] = useState<string | null>(null);
  const [tagKey, setTagKey] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const router = useRouter();
  const [comparing, setComparing] = useState(false);
  // The timeline puts its branch and zoom controls in the panel's title row.
  const [controlsSlot, setControlsSlot] = useState<HTMLElement | null>(null);
  // Whether the save controls under the timeline are on screen. When they are not, a copy floats at the bottom.
  const footerRef = useRef<HTMLDivElement>(null);
  const [footerSeen, setFooterSeen] = useState(true);
  // Opening another version starts a fresh draft from it. The builder itself stays mounted, so the view, the timeline
  // and everything on screen carry on instead of resetting and flashing back to defaults.
  const [shownVersion, setShownVersion] = useState(versionNumber);
  if (shownVersion !== versionNumber) {
    setShownVersion(versionNumber);
    setLines(baseLines);
    setRecovered(recoveredFor(versionNumber, baseLines));
    setNote("");
    setBranching(false);
    setBranchName("");
    setConfirmApply(false);
    setPendingVersion(null);
    setSelectedKey(null);
    setMenu(null);
    setPeekKey(null);
    setPrintingKey(null);
    setTagKey(null);
    setHistoryKey(null);
    setComparing(false);
    setError(null);
    setSessionEnded(false);
    setVisibility(deck.visibility);
    setPublishedVersion(deck.publishedVersion);
  }
  useEffect(() => {
    const element = footerRef.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setFooterSeen(entry.isIntersecting), { threshold: 0.4 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const [toast, setToast] = useState<string | null>(null);
  // A deleted version can be brought back for a few seconds right here, and for 30 days on the server.
  // The version shown in the undo pill, kept while the pill animates away.
  const undoShown = useRef(0);
  if (undoDelete !== null) undoShown.current = undoDelete;

  // Remember the chosen view and whether the timeline is open.
  useEffect(() => {
    try {
      const storedView = localStorage.getItem(VIEW_KEY);
      if (storedView === "list" || storedView === "stacks" || storedView === "gallery") setView(storedView);
      const storedGroup = localStorage.getItem(GROUP_KEY);
      if (GROUP_MODES.some(([mode]) => mode === storedGroup)) setGroup(storedGroup as GroupMode);
      const storedSort = localStorage.getItem(SORT_KEY);
      if (SORT_MODES.some(([mode]) => mode === storedSort)) setSort(storedSort as SortMode);
      if (localStorage.getItem(SORT_DIR_KEY) === "desc") setSortDirection("desc");
      const storedSize = Number(localStorage.getItem(SIZE_KEY));
      if (Number.isFinite(storedSize) && storedSize >= SIZE_MIN && storedSize <= SIZE_MAX) setCardSize(storedSize);
      if (localStorage.getItem(TIMELINE_KEY) === "closed") setTimelineOpen(false);
      if (localStorage.getItem(COLLECTION_KEY) === "on") setCheckCollection(true);
    } catch {
      // Storage blocked: defaults apply.
    }
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (undoDelete === null) return;
    const timer = setTimeout(() => setUndoDelete(null), 12000);
    return () => clearTimeout(timer);
  }, [undoDelete]);

  async function undoDeleteVersion(number: number) {
    setUndoDelete(null);
    try {
      await api(`/api/decks/${deck.id}/versions/${number}/undo-delete`, { method: "POST" });
      setToast(`Brought back v${number}`);
      onSelectVersion(number);
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : "Could not bring that version back.");
    }
  }

  const withOwned = useMemo(() => lines.map((line) => ({ ...line, owned: owned.get(line.cardId) ?? 0 })), [lines, owned]);
  const baseWithOwned = useMemo(
    () => baseLines.map((line) => ({ ...line, owned: owned.get(line.cardId) ?? 0 })),
    [baseLines, owned],
  );

  const stats = useMemo(() => computeStats(withOwned), [withOwned]);
  const legality = useMemo(() => checkLegality(withOwned), [withOwned]);
  const savedStats = useMemo(() => (version ? computeStats(baseWithOwned) : null), [version, baseWithOwned]);

  const baseKeys = useMemo(() => new Set(baseLines.map(lineKey)), [baseLines]);
  const currentKeys = useMemo(() => new Set(lines.map(lineKey)), [lines]);
  const newKeys = useMemo(() => new Set(lines.filter((line) => !baseKeys.has(lineKey(line))).map(lineKey)), [lines, baseKeys]);
  const removed = useMemo(() => baseWithOwned.filter((line) => !currentKeys.has(lineKey(line))), [baseWithOwned, currentKeys]);
  const tagSuggestions = useMemo(() => allTags(lines), [lines]);

  const dirty = signature(lines) !== signature(baseLines);

  // Press P with the pointer over a card to change its printing. The pointer position is tracked so the
  // card under it is found when the key goes down, whichever view is showing.
  useEffect(() => {
    let x = -1;
    let y = -1;
    const track = (event: PointerEvent) => {
      x = event.clientX;
      y = event.clientY;
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "p" || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable=true]")) return;
      // Leave it alone while a dialog or the card menu is open.
      if (document.querySelector("dialog[open], [role=menu]")) return;
      if (x < 0) return;
      const card = document.elementsFromPoint(x, y).find((element) => element.closest("[data-line-key]"))?.closest<HTMLElement>("[data-line-key]");
      const key = card?.dataset.lineKey;
      if (!key) return;
      event.preventDefault();
      setPrintingKey(key);
    };
    window.addEventListener("pointermove", track, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", track);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  // Keep the edits on this device a moment after each change, so a refresh or an ended session loses nothing.
  // While a recovered draft is waiting for an answer it is left alone.
  useEffect(() => {
    if (recovered) return;
    if (!dirty) {
      clearDraft(deck.id, versionNumber);
      return;
    }
    const timer = setTimeout(() => saveDraft(deck.id, versionNumber, signature(baseLines), lines), 600);
    return () => clearTimeout(timer);
  }, [lines, dirty, recovered, deck.id, versionNumber, baseLines]);

  // Leaving the page with unsaved edits would lose them, so let the browser ask first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const hasCommander = lines.some((line) => line.board === "commander");

  // Saving from anything but the newest version of a line has to start a new branch.
  const viewingOlder = version !== null && !version.head;
  const needsBranch = viewingOlder || branching;
  // Only a real edit, or a branch asked for, shows the save controls. Just looking at an older version does not.
  const showDraft = dirty || branching;
  const canSave = lines.length > 0 && !saving && (needsBranch ? branchName.trim() !== "" : dirty);

  const visible = withOwned.filter((line) => (tab === "main" ? line.board === "main" || line.board === "commander" : line.board === tab));
  const groups = groupLines(visible, tab === "main" ? group : "type", sort, sortDirection);
  const lineByKey = (key: string | null) => withOwned.find((line) => lineKey(line) === key) ?? null;
  const selected = lineByKey(selectedKey) ?? withOwned.find((line) => line.board === "commander") ?? null;

  const tabCount = (target: Tab) =>
    withOwned
      .filter((line) => (target === "main" ? line.board === "main" || line.board === "commander" : line.board === target))
      .reduce((sum, line) => sum + line.quantity, 0);

  const versionSummary = timeline.branches.flatMap((branch) => branch.versions).find((v) => v.versionNumber === version?.versionNumber);

  function chooseGroup(next: GroupMode) {
    setGroup(next);
    remember(GROUP_KEY, next);
  }

  function chooseSort(next: SortMode) {
    setSort(next);
    remember(SORT_KEY, next);
  }

  function flipSortDirection() {
    const next: SortDirection = sortDirection === "asc" ? "desc" : "asc";
    setSortDirection(next);
    remember(SORT_DIR_KEY, next);
  }

  function chooseSize(next: number) {
    setCardSize(next);
    remember(SIZE_KEY, String(next));
  }

  function chooseView(next: ViewMode) {
    setView(next);
    remember(VIEW_KEY, next);
  }

  function toggleCollectionCheck() {
    setCheckCollection((on) => {
      remember(COLLECTION_KEY, on ? "off" : "on");
      return !on;
    });
  }

  /** Opens another version, asking first when that would throw away unsaved edits. */
  function selectVersion(versionNumber: number) {
    if (versionNumber === version?.versionNumber) return;
    if (dirty) setPendingVersion(versionNumber);
    else onSelectVersion(versionNumber);
  }

  async function publishVersion(versionNumber: number) {
    try {
      const changed = await api<DeckDetail>(`/api/decks/${deck.id}/visibility`, { method: "PUT", body: { visibility: "public", versionNumber } });
      setVisibility(changed.visibility);
      setPublishedVersion(changed.publishedVersion);
      setToast(`Version ${versionNumber} is public`);
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : "Could not publish that version.");
    }
  }

  function toggleTimeline() {
    setTimelineOpen((open) => {
      remember(TIMELINE_KEY, open ? "closed" : "open");
      return !open;
    });
  }

  /** After a branch was renamed or deleted from either menu. */
  function branchesChanged(next: Timeline, deletedId: string | null) {
    if (deletedId !== null && deletedId === version?.branchId) {
      // The open version went with its branch: move to the end of the first line.
      setBranchesOpen(false);
      const first = next.branches.find((branch) => branch.main) ?? next.branches[0];
      const tip = first?.versions[first.versions.length - 1];
      if (tip) onSelectVersion(tip.versionNumber);
    } else {
      onReload();
    }
    setToast(deletedId !== null ? "Branch deleted" : "Branch renamed");
  }

  function startMerge(branch: Branch, into?: Branch) {
    setBranchMenu(null);
    setMergeBranch(branch);
    setMergeInto(into ?? null);
  }

  // ---- editing ----

  function addCard(card: Card) {
    const target: Board = tab;
    setLines((previous) => {
      const index = previous.findIndex((line) => line.cardId === card.id && line.board === target);
      if (index === -1) return [...previous, lineFromCard(card, target)];
      return previous.map((line, i) => (i === index ? { ...line, quantity: Math.min(MAX_QUANTITY, line.quantity + 1) } : line));
    });
  }

  function setCommander(card: Card) {
    setLines((previous) => [
      ...previous.filter((line) => line.board !== "commander" && line.cardId !== card.id),
      lineFromCard(card, "commander"),
    ]);
    setTab("main");
  }

  const changeQuantity = useCallback((target: DeckCardLine, delta: number) => {
    setLines((previous) =>
      previous.flatMap((line) => {
        if (lineKey(line) !== lineKey(target)) return [line];
        const quantity = Math.min(MAX_QUANTITY, line.quantity + delta);
        return quantity <= 0 ? [] : [{ ...line, quantity }];
      }),
    );
  }, []);

  const removeLine = useCallback((target: DeckCardLine) => {
    setLines((previous) => previous.filter((line) => lineKey(line) !== lineKey(target)));
  }, []);

  const moveLine = useCallback((target: DeckCardLine, board: Board) => {
    setLines((previous) => {
      const rest = previous.filter((line) => lineKey(line) !== lineKey(target));
      const index = rest.findIndex((line) => line.cardId === target.cardId && line.board === board);
      if (index === -1) return [...rest, { ...target, board }];
      return rest.map((line, i) =>
        i === index ? { ...line, quantity: Math.min(MAX_QUANTITY, line.quantity + target.quantity) } : line,
      );
    });
  }, []);

  /** Puts one copy of the card on the commander board. A commander already there goes back to the main board. */
  const makeCommander = useCallback((target: DeckCardLine) => {
    setLines((previous) => {
      const rest = takeOne(previous, target).flatMap((line) => (line.board === "commander" ? [{ ...line, board: "main" as Board }] : [line]));
      return [...mergeAll(rest), { ...target, board: "commander", quantity: 1 }];
    });
  }, []);

  /** A partner is the commander's second slot too. A second partner already there goes back to the main board. */
  const makePartner = useCallback((target: DeckCardLine) => {
    setLines((previous) => {
      if (!previous.some((line) => line.board === "commander")) {
        setToast("Choose a commander first, then set the partner.");
        return previous;
      }
      let rest = takeOne(previous, target);
      const commanders = rest.filter((line) => line.board === "commander");
      if (commanders.length >= 2) {
        const demoted = lineKey(commanders[commanders.length - 1]);
        rest = rest.map((line) => (lineKey(line) === demoted ? { ...line, board: "main" as Board } : line));
      }
      return [...mergeAll(rest), { ...target, board: "commander", quantity: 1 }];
    });
  }, []);

  /** A background is the commander's second slot. It needs a commander to go with. */
  const makeBackground = useCallback((target: DeckCardLine) => {
    setLines((previous) => {
      if (!previous.some((line) => line.board === "commander")) {
        setToast("Choose a commander first, then set the background.");
        return previous;
      }
      const rest = takeOne(previous, target).flatMap((line) =>
        line.board === "commander" && line.typeLine.includes("Background") ? [{ ...line, board: "main" as Board }] : [line],
      );
      return [...mergeAll(rest), { ...target, board: "commander", quantity: 1 }];
    });
  }, []);

  function setTags(target: DeckCardLine, tags: string[]) {
    setLines((previous) => previous.map((line) => (lineKey(line) === lineKey(target) ? { ...line, tags } : line)));
  }

  /** Pins the player's own art. It shows on the card now, and the saved version remembers it. */
  function chooseCustom(target: DeckCardLine, art: CustomPrinting) {
    const url = customArtUrl(art.id);
    setLines((previous) =>
      previous.map((line) =>
        lineKey(line) === lineKey(target)
          ? { ...line, customPrintingId: art.id, setCode: "custom", setName: art.label, collectorNumber: "", artist: "Custom art", imageSmall: url, imageNormal: url, imageArtCrop: url }
          : line,
      ),
    );
    setPrintingKey(null);
  }

  function choosePrinting(target: DeckCardLine, printing: Printing) {
    setLines((previous) =>
      previous.map((line) =>
        lineKey(line) === lineKey(target)
          ? {
              ...line,
              printingId: printing.scryfallId,
              customPrintingId: null,
              setCode: printing.setCode,
              setName: printing.setName,
              collectorNumber: printing.collectorNumber,
              rarity: printing.rarity || line.rarity,
              artist: printing.artist || line.artist,
              imageSmall: printing.imageSmall || line.imageSmall,
              imageNormal: printing.imageNormal || line.imageNormal,
              imageArtCrop: printing.imageArtCrop || line.imageArtCrop,
              priceUsd: printing.priceUsd,
            }
          : line,
      ),
    );
    setPrintingKey(null);
  }

  function importCards(cards: ImportedCard[], replace: boolean) {
    // Cards that were already in the deck keep the art that was chosen for them, whichever way the list is added.
    const { lines: incoming, inherited } = inheritArt(
      lines,
      cards.map(({ card, quantity, board }) => lineFromCard(card, board, quantity)),
    );
    setLines((previous) => {
      const base = replace ? [] : previous;
      let next = base;
      for (const line of incoming) {
        if (line.board === "commander") {
          next = [...next.filter((existing) => existing.board !== "commander" && existing.cardId !== line.cardId), line];
          continue;
        }
        const index = next.findIndex((existing) => lineKey(existing) === lineKey(line));
        next =
          index === -1
            ? [...next, line]
            : next.map((existing, i) =>
                i === index ? { ...existing, quantity: Math.min(MAX_QUANTITY, existing.quantity + line.quantity) } : existing,
              );
      }
      return next;
    });
    setToast(`Imported ${incoming.reduce((sum, line) => sum + line.quantity, 0)} cards${inherited > 0 ? `, ${inherited} kept their chosen art` : ""}`);
  }

  /** The cards of the draft as the server wants them. */
  const cardsPayload = () =>
    lines.map((line) => ({
      cardId: line.cardId,
      quantity: line.quantity,
      board: line.board,
      printingId: line.customPrintingId ? null : line.printingId,
      customPrintingId: line.customPrintingId,
      tags: line.tags,
    }));

  // Saving over a version only works when nothing grew from it. The public version needs a second look.
  const applyCheck = version ? canApplyInPlace(timeline, version.versionNumber) : { ok: false, reason: null };
  const versionIsPublic = version !== null && visibility === "public" && publishedVersion === version.versionNumber;

  /** Shows why a save failed. When the session ended, the edits are kept here and signing in brings the person back to them. */
  function failed(err: unknown, fallback: string) {
    if (err instanceof ApiError && err.status === 401) {
      saveDraft(deck.id, versionNumber, signature(baseLines), lines);
      setSessionEnded(true);
      setError("Your session ended, so nothing was saved. Your changes are kept on this device.");
      return;
    }
    setSessionEnded(false);
    setError(err instanceof ApiError ? err.message : fallback);
  }

  /** Saves the draft over the open version. It keeps its number and place, and no new version appears. */
  async function applyChanges() {
    if (!version) return;
    setSaving(true);
    setError(null);
    setConfirmApply(false);
    try {
      await api<VersionDetail>(`/api/decks/${deck.id}/versions/${version.versionNumber}`, {
        method: "PUT",
        body: { cards: cardsPayload(), note: note.trim() || undefined },
      });
      setNote("");
      setToast(`Changes applied to v${version.versionNumber}`);
      onReload();
    } catch (err) {
      failed(err, "Could not apply the changes.");
    } finally {
      setSaving(false);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const saved = await api<VersionDetail>(`/api/decks/${deck.id}/versions`, {
        method: "POST",
        body: {
          note: note.trim(),
          cards: cardsPayload(),
          fromVersion: version?.versionNumber,
          branchName: needsBranch ? branchName.trim() : undefined,
        },
      });
      clearDraft(deck.id, versionNumber);
      onSaved(saved.versionNumber);
    } catch (err) {
      failed(err, "Could not save the version.");
    } finally {
      setSaving(false);
    }
  }

  const inDeck = useMemo(() => new Set(lines.map((line) => line.cardId)), [lines]);
  const closeMenu = useCallback(() => setMenu(null), []);
  const viewProps = {
    groups,
    selectedKey,
    newKeys,
    onSelect: (line: DeckCardLine, via?: "hover" | "click") => {
      setSelectedKey(lineKey(line));
      // Without the side preview (below lg), clicking a card opens it in the peek sheet instead.
      if (via === "click" && window.matchMedia("(max-width: 1023px)").matches) setPeekKey(lineKey(line));
    },
    onMenu: (line: DeckCardLine, x: number, y: number) => setMenu({ line, x, y }),
    checkCollection,
    cardSize,
  };

  // [ and ] step to the previous and next saved version, unless you are typing.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.key !== "[" && event.key !== "]") || event.metaKey || event.ctrlKey || event.altKey) return;
      if ((event.target as HTMLElement | null)?.closest("input, textarea, select, dialog, [contenteditable=true]")) return;
      const numbers = timeline.branches.flatMap((branch) => branch.versions.map((v) => v.versionNumber)).sort((a, b) => a - b);
      const at = numbers.indexOf(version?.versionNumber ?? -1);
      const next = at < 0 ? undefined : numbers[at + (event.key === "]" ? 1 : -1)];
      if (next === undefined) return;
      event.preventDefault();
      selectVersion(next);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /** The controls for saving a draft. They sit under the timeline, and float at the bottom of the screen when that spot is out of view. */
  /** The note, the new branch's name and Discard. They appear only while there is something to save. */
  function renderFields(where: "bar" | "float") {
    return (
      <div className="flex w-full flex-wrap items-center gap-2.5">
        <label className="sr-only" htmlFor={`version-note-${where}`}>
          Version note
        </label>
        <input
          id={`version-note-${where}`}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={200}
          placeholder="Note (optional)"
          className={`${field} w-full sm:w-64`}
        />
        {needsBranch && (
          <>
            <label className="sr-only" htmlFor={`branch-name-${where}`}>
              New branch name
            </label>
            <input
              id={`branch-name-${where}`}
              value={branchName}
              onChange={(event) => setBranchName(event.target.value)}
              maxLength={40}
              placeholder="Name the new branch"
              className={`${field} w-full border-accent-text sm:w-52`}
            />
          </>
        )}
        {dirty && (
          <button type="button" disabled={saving} onClick={() => setLines(baseLines)} className={btn.quiet}>
            Discard
          </button>
        )}
      </div>
    );
  }

  const canApply = version !== null && dirty && !saving && applyCheck.ok && lines.length > 0;
  const saveNewLabel = saving ? "Saving" : needsBranch ? "Save as new branch" : "Save new version";
  const applyHint = !version ? undefined : !dirty ? "Nothing changed yet" : applyCheck.ok ? `Save these changes over version ${version.versionNumber}, without adding a version` : (applyCheck.reason ?? undefined);
  const onApply = () => (versionIsPublic ? setConfirmApply(true) : void applyChanges());

  /** Save and Save new version, for the floating bar. The footer has the same two buttons among its others. */
  function renderSaveButtons() {
    return (
      <>
        <button type="button" disabled={!canApply} onClick={onApply} title={applyHint} className={btn.secondary}>
          Save
        </button>
        <button type="button" disabled={!canSave} onClick={save} className={btn.primary}>
          {saveNewLabel}
        </button>
      </>
    );
  }

  return (
    <div className="relative">
      <div className="relative">
        {/* Backdrop art. Placeholder until the art library exists. It keeps one size whatever the panel does, and is cut and faded where the header and panel end. */}
        <div aria-hidden="true" className="art-clip pointer-events-none absolute inset-0 z-0 hidden overflow-hidden md:block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/art/nobg-knight.png" alt="" className="absolute top-0 left-[18%] h-[720px] w-auto max-w-none select-none" />
        </div>
      {/* Header */}
      <div className="relative z-10 flex flex-wrap items-end justify-between gap-x-10 gap-y-6 pt-10 pb-3">
        <div className="min-w-0">
          <div className="mb-3.5 flex flex-wrap items-center gap-2">
            {dirty ? (
              <span className="inline-flex items-center rounded-full border border-add-line bg-add-bg px-3 py-1 text-[13px] text-add-text">Unsaved changes</span>
            ) : (
              <span className="glass inline-flex items-center rounded-full px-3.5 py-1.5 text-[13px] text-ink">{version ? `Version ${version.versionNumber}` : "No cards yet"}</span>
            )}
            {!hasCommander && lines.length > 0 && <span className={tag}>No commander chosen</span>}
            <span aria-hidden="true" className="mx-1 hidden h-5 w-px bg-line sm:block" />
            <button
              type="button"
              onClick={() => setVisibilityOpen(true)}
              aria-label={visibility === "public" ? `Public, showing version ${publishedVersion}. Change visibility` : "Private. Change visibility"}
              className={`glass inline-flex min-h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium [@media(pointer:coarse)]:min-h-11 ${visibility === "public" ? "text-accent-text" : ""}`}
            >
              {visibility === "public" ? <GlobeSimple size={15} aria-hidden /> : <LockSimple size={15} aria-hidden />}
              {visibility === "public" ? `Public, v${publishedVersion}` : "Private"}
            </button>
            <button
              type="button"
              onClick={() => setDescriptionOpen(true)}
              className="glass inline-flex min-h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium [@media(pointer:coarse)]:min-h-11"
            >
              <PencilSimpleLine size={15} aria-hidden />
              {deck.description ? "Edit description" : "Add description"}
            </button>
          </div>
          <h1 className="font-display text-[clamp(56px,8vw,128px)] leading-[0.92]">{deck.name}</h1>
          <div className="mt-2.5 space-y-1 text-[13px] leading-snug text-muted">
            <div className="flex flex-wrap items-center gap-x-2">
              <span className="capitalize">{deck.format}</span>
              <span aria-hidden="true">|</span>
              <details className="group/legal relative inline-block">
                <summary className={`cursor-pointer list-none underline-offset-4 hover:underline ${legality.legal ? "" : "text-add-text"}`}>
                  {legality.legal ? "Legal" : `${legality.issues.length} ${legality.issues.length === 1 ? "issue" : "issues"}`}
                </summary>
                <div className="absolute left-0 z-30 mt-2 w-[min(360px,90vw)] rounded-2xl border border-line bg-bg p-4 text-sm text-ink shadow-[0_18px_40px_rgba(0,0,0,0.45)]">
                  {legality.legal ? (
                    <p>100 cards, one commander, one copy of each card, all inside the commander&apos;s colors.</p>
                  ) : (
                    <ul className="list-disc space-y-1.5 pl-5">
                      {legality.issues.map((issue) => (
                        <li key={issue}>{issue}</li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-3 text-muted">The banned list is not checked.</p>
                </div>
              </details>
              {version && (
                <>
                  <span aria-hidden="true">|</span>
                  <span>{version.branchName}</span>
                </>
              )}
              {!hasCommander && lines.length > 0 && (
                <>
                  <span aria-hidden="true">|</span>
                  <span>No commander chosen</span>
                </>
              )}
            </div>
            <p>
              Size: {stats.totalCards} | Est. Cost: ${stats.totalPriceUsd.toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      {checkCollection && owned.size === 0 && (
        <p className="mb-6 rounded-2xl border border-line bg-surface px-5 py-3.5 text-[15px] text-muted">
          Your collection is empty, so every card counts as missing.{" "}
          <Link href="/collection" className="text-accent-text underline underline-offset-4">
            Add the cards you own
          </Link>
          .
        </p>
      )}
      {error && (
        <p role="alert" className="mb-6 rounded-2xl border border-danger-line bg-danger/10 px-5 py-3.5 text-sm text-ink">
          {error}
          {sessionEnded && (
            <>
              {" "}
              <Link href={loginUrl()} className="font-medium underline underline-offset-4">
                Sign in again
              </Link>
              , then pick up where you left off.
            </>
          )}
        </p>
      )}

      {recovered && (
        <div role="status" className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-accent-text px-5 py-3.5 text-sm">
          <p>
            You have unsaved changes from {new Date(recovered.savedAt).toLocaleString()}, {Math.abs(recovered.lines.length - baseLines.length) === 0 ? "same number of cards" : `${recovered.lines.length} cards against ${baseLines.length} saved`}.
          </p>
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={() => {
                setLines(recovered.lines);
                setRecovered(null);
              }}
              className="press min-h-9 [@media(pointer:coarse)]:min-h-11 rounded-full bg-accent px-5 text-sm font-bold text-on-accent"
            >
              Restore them
            </button>
            <button
              type="button"
              onClick={() => {
                clearDraft(deck.id, versionNumber);
                setRecovered(null);
              }}
              className="pill min-h-9 [@media(pointer:coarse)]:min-h-11 rounded-full border border-ink px-5 text-sm font-medium"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {/* Version timeline, collapsible */}
      <section aria-labelledby="timeline-heading" className="relative z-10 mb-10 rounded-card border border-line bg-surface/60 px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
          <h2 id="timeline-heading" title="Press [ and ] to step through versions" className="text-lg font-medium">
            Versions
          </h2>
          <div ref={setControlsSlot} className="ml-auto flex min-w-0 items-center" />
          <div className="-mr-3 flex items-center">
            <button
              type="button"
              aria-expanded={timelineOpen}
              aria-controls="timeline-body"
              onClick={toggleTimeline}
              className={`${btn.quiet} gap-1.5 text-sm`}
            >
              {timelineOpen ? "Hide" : "Show"}
              <CaretUp size={14} aria-hidden className={`transition-transform duration-300 motion-reduce:transition-none ${timelineOpen ? "" : "rotate-180"}`} />
            </button>
          </div>
        </div>
        <Presence show={timelineOpen} collapse id="timeline-body" className="pt-2">
          <VersionTimeline timeline={timeline} current={version?.versionNumber ?? null} published={visibility === "public" ? publishedVersion : null} onSelect={selectVersion} comparing={comparing} controlsSlot={controlsSlot} deckId={deck.id} menuBranchId={branchMenu?.branchId ?? null} artUrl={baseLines.find((line) => line.board === "commander")?.imageArtCrop ?? null} onBranchClick={(branchId, anchor) => setBranchMenu((open) => (open?.branchId === branchId ? null : { branchId, anchor }))} onCompare={(n) => router.push(`/decks/${deck.id}/diff?from=${Math.min(n, version?.versionNumber ?? n)}&to=${Math.max(n, version?.versionNumber ?? n)}`)} />
        </Presence>
        <div ref={footerRef}>
          <Presence show={showDraft} collapse appear className="mt-4 border-t border-line pt-4 pb-1">
            {renderFields("bar")}
          </Presence>
          <Presence show={timelineOpen && version !== null} collapse>
            {version && (
              <VersionActions
                deckId={deck.id}
                version={version}
                published={visibility === "public" ? publishedVersion : null}
                dirty={dirty}
                branchHead={timeline.branches.find((branch) => branch.id === version.branchId)?.versions.at(-1)?.versionNumber ?? null}
                onOpen={onSelectVersion}
                onReload={onReload}
                onPublish={(n) => void publishVersion(n)}
                onToast={setToast}
                comparing={comparing}
                onToggleCompare={() => setComparing((value) => !value)}
                versionCount={timeline.branches.reduce((sum, branch) => sum + branch.versions.length, 0)}
                onDeleted={setUndoDelete}
                canApply={canApply}
                applyHint={applyHint}
                onApply={onApply}
                canSaveNew={canSave}
                saveNewLabel={saveNewLabel}
                onSaveNew={save}
                branching={needsBranch}
                branchLocked={viewingOlder}
                onToggleBranch={() => setBranching((value) => !value)}
                onBranches={() => setBranchesOpen(true)}
              />
            )}
          </Presence>
        </div>
      </section>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4 border-b border-line">
        <div className="-mb-px flex w-full gap-5 overflow-x-auto sm:gap-7 [scrollbar-width:none] md:w-auto" role="tablist" aria-label="Boards">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`min-h-12 shrink-0 whitespace-nowrap border-b-2 py-2.5 text-[15px] sm:text-base ${tab === key ? "border-accent-text" : "border-transparent text-muted"}`}
            >
              {label} <span className="text-sm text-muted">{tabCount(key)}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-expanded={optionsOpen}
          aria-controls="board-options"
          onClick={() => setOptionsOpen((open) => !open)}
          className={`${btn.quiet} -ml-4 text-sm md:hidden`}
        >
          <SlidersHorizontal size={18} aria-hidden />
          {optionsOpen ? "Hide display options" : "Display options"}
        </button>
        <div id="board-options" className={`${optionsOpen ? "flex" : "hidden"} flex-wrap items-center gap-x-6 gap-y-3 pb-3 md:flex md:pb-2`}>
          {tab === "main" && (
            <div className="flex items-center gap-3">
              <label htmlFor="group-by" className="text-sm text-muted">
                Group by
              </label>
              <select
                id="group-by"
                value={group}
                onChange={(event) => chooseGroup(event.target.value as GroupMode)}
                className="min-h-9 [@media(pointer:coarse)]:min-h-11 rounded-full border border-line bg-surface px-4 text-sm text-ink focus:border-ink focus:outline-none"
              >
                {GROUP_MODES.map(([mode, label]) => (
                  <option key={mode} value={mode}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex items-center gap-3">
            <label htmlFor="sort-by" className="text-sm text-muted">
              Sort by
            </label>
            <select
              id="sort-by"
              value={sort}
              onChange={(event) => chooseSort(event.target.value as SortMode)}
              className="min-h-9 [@media(pointer:coarse)]:min-h-11 rounded-full border border-line bg-surface px-4 text-sm text-ink focus:border-ink focus:outline-none"
            >
              {SORT_MODES.map(([mode, label]) => (
                <option key={mode} value={mode}>
                  {label}
                </option>
              ))}
            </select>
            <SortDirectionButton direction={sortDirection} onFlip={flipSortDirection} />
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={checkCollection}
            onClick={toggleCollectionCheck}
            className="flex min-h-9 [@media(pointer:coarse)]:min-h-11 items-center gap-3 text-sm"
          >
            <span
              aria-hidden="true"
              className={`relative h-6 w-11 rounded-full border transition-colors ${checkCollection ? "border-accent-text bg-accent" : "border-line bg-surface"}`}
            >
              <span className={`absolute top-0.5 h-4.5 w-4.5 rounded-full bg-ink transition-all ${checkCollection ? "left-5.5" : "left-0.5"}`} />
            </span>
            Check collection
          </button>
          {view !== "list" && (
            <label className="flex min-h-9 [@media(pointer:coarse)]:min-h-11 items-center gap-3 text-sm text-muted">
              Size
              <input
                type="range"
                min={SIZE_MIN}
                max={SIZE_MAX}
                step={10}
                value={cardSize}
                onChange={(event) => chooseSize(Number(event.target.value))}
                aria-label="Card size"
                aria-valuetext={`${cardSize} pixels wide`}
                className="w-32 accent-[var(--accent-text)]"
              />
            </label>
          )}
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted">View</span>
            <div className="flex gap-1 rounded-full border border-line p-1">
              {VIEWS.map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={view === mode}
                  onClick={() => chooseView(mode)}
                  className={`min-h-9 [@media(pointer:coarse)]:min-h-11 rounded-full px-4 text-sm ${view === mode ? "bg-ink text-bg" : ""}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 py-7">
        <div className="min-w-[260px] flex-1">
          <CardSearch inDeck={inDeck} owned={owned} showCollection={checkCollection} onAdd={addCard} onSetCommander={setCommander} />
        </div>
        <button
          type="button"
          onClick={() => setImportOpen(true)}
          className={`${btn.secondary} min-h-14 px-6`}
        >
          Import list
        </button>
        <button
          type="button"
          onClick={() => setExportOpen(true)}
          disabled={lines.length === 0}
          className={`${btn.quiet} min-h-14`}
        >
          Export
        </button>
      </div>

      {/* Cards */}
      <div className="grid items-start gap-x-10 gap-y-8 lg:grid-cols-[clamp(260px,18vw,380px)_minmax(0,1fr)]">
        <div className="hidden lg:sticky lg:top-6 lg:block">
          <CardPreview line={selected} showCollection={checkCollection} />
        </div>
        <div>
          {view === "list" && <CardList {...viewProps} />}
          {view === "stacks" && <CardStacks {...viewProps} />}
          {view === "gallery" && <CardGallery {...viewProps} />}
        </div>
      </div>

      <div className="mt-16">
        <StatsSection
          deckId={deck.id}
          stats={stats}
          saved={savedStats}
          savedVersion={version?.versionNumber ?? 0}
          removed={removed}
          showCollection={checkCollection}
        />
      </div>

      {/* Overlays */}
      <DescriptionDialog open={descriptionOpen} onClose={() => setDescriptionOpen(false)} deckId={deck.id} description={deck.description} onSaved={onReload} />
      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} deckName={deck.name} lines={lines} />
      <Dialog open={confirmApply} onClose={() => setConfirmApply(false)} label="Update the public version" size="sm">
        <div className="flex flex-col gap-5">
          <h2 className="font-display text-[44px] leading-none">This version is public</h2>
          <p className="text-[15px] leading-snug text-muted">
            Version {version?.versionNumber} is the one everyone sees on Explore. Applying your changes updates it for them too. To keep the public version as it is, save a new version instead.
          </p>
          <div className="flex flex-wrap gap-2.5">
            <button type="button" onClick={() => void applyChanges()} className={btn.large.primary}>
              Apply and update the public version
            </button>
            <button type="button" onClick={() => setConfirmApply(false)} className={btn.large.secondary}>
              Cancel
            </button>
          </div>
        </div>
      </Dialog>
      <CardHistoryDialog
        line={lineByKey(historyKey)}
        deckId={deck.id}
        timeline={timeline}
        current={version?.versionNumber ?? null}
        onClose={() => setHistoryKey(null)}
        onOpenVersion={selectVersion}
      />
      <MergeDialog
        timeline={timeline}
        publishedVersion={visibility === "public" ? publishedVersion : null}
        open={mergeBranch !== null}
        onClose={() => setMergeBranch(null)}
        deckId={deck.id}
        branch={mergeBranch}
          into={mergeInto}
        onMerged={(merged, deleted) => {
          setMergeBranch(null);
          setBranchesOpen(false);
          setToast(deleted ? "Merged, and the branch was deleted" : `Merged into ${mergeInto?.name ?? "main"}`);
          onSelectVersion(merged.versionNumber);
        }}
      />
      <Dialog open={pendingVersion !== null} onClose={() => setPendingVersion(null)} label="Unsaved changes" size="sm">
        <div className="flex flex-col gap-5">
          <h2 className="font-display text-[44px] leading-none">Unsaved changes</h2>
          <p className="text-[15px] leading-snug text-muted">Opening version {pendingVersion} throws away the edits you have not saved.</p>
          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={() => {
                const target = pendingVersion;
                setPendingVersion(null);
                if (target !== null) onSelectVersion(target);
              }}
              className={btn.large.primary}
            >
              Discard and open v{pendingVersion}
            </button>
            <button type="button" onClick={() => setPendingVersion(null)} className={btn.large.secondary}>
              Keep editing
            </button>
          </div>
        </div>
      </Dialog>
      <BranchesDialog
        open={branchesOpen}
        onClose={() => setBranchesOpen(false)}
        deckId={deck.id}
        timeline={timeline}
        currentBranchId={version?.branchId ?? null}
        publishedVersion={visibility === "public" ? publishedVersion : null}
        locked={dirty}
        onMerge={(branch, into) => {
          setBranchesOpen(false);
          startMerge(branch, into);
        }}
        onChanged={branchesChanged}
      />
      <BranchMenu
        open={branchMenu !== null}
        anchor={(branchMenu ?? lastBranchMenu.current)?.anchor ?? null}
        branch={timeline.branches.find((branch) => branch.id === (branchMenu ?? lastBranchMenu.current)?.branchId)}
        deckId={deck.id}
        timeline={timeline}
        publishedVersion={visibility === "public" ? publishedVersion : null}
        locked={dirty}
        onMerge={startMerge}
        onChanged={branchesChanged}
        onClose={() => setBranchMenu(null)}
      />
      <VisibilityDialog
        open={visibilityOpen}
        onClose={() => setVisibilityOpen(false)}
        deckId={deck.id}
       
        timeline={timeline}
        visibility={visibility}
        publishedVersion={publishedVersion}
        currentVersion={version?.versionNumber ?? null}
        onChanged={(changed) => {
          setVisibility(changed.visibility);
          setPublishedVersion(changed.publishedVersion);
          setToast(changed.visibility === "public" ? `Version ${changed.publishedVersion} is public` : "Deck is private");
        }}
      />
      <CardMenu
        target={menu}
        onClose={closeMenu}
        onPeek={(line) => setPeekKey(lineKey(line))}
        onPrinting={(line) => setPrintingKey(lineKey(line))}
        onTags={(line) => setTagKey(lineKey(line))}
        onQuantity={changeQuantity}
        onMove={moveLine}
        onSetCommander={makeCommander}
        onSetBackground={makeBackground}
        onSetPartner={makePartner}
        onHistory={(line) => setHistoryKey(lineKey(line))}
        onRemove={removeLine}
        onNotify={setToast}
      />
      <CardPeek
        line={lineByKey(peekKey)}
        showCollection={checkCollection}
        onClose={() => setPeekKey(null)}
        onChangePrinting={(line) => {
          setPeekKey(null);
          setPrintingKey(lineKey(line));
        }}
      />
      <PrintingPicker line={lineByKey(printingKey)} onClose={() => setPrintingKey(null)} onChoose={choosePrinting} onChooseCustom={chooseCustom} />
      <TagEditor line={lineByKey(tagKey)} suggestions={tagSuggestions} onClose={() => setTagKey(null)} onChange={setTags} />
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} onImport={importCards} />

      <Presence
        show={showDraft && !footerSeen}
        y={18}
        className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-[980px] rounded-[28px] border border-line bg-bg/95 p-3 shadow-[0_18px_40px_rgba(0,0,0,0.5)] backdrop-blur"
      >
        {renderFields("float")}
        <div className="mt-3 flex flex-wrap items-center gap-2.5">{renderSaveButtons()}</div>
      </Presence>
      <Presence show={undoDelete !== null} y={14} className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
        <div role="status" className="flex items-center gap-2 rounded-full border border-line bg-bg py-1.5 pr-1.5 pl-5 text-sm shadow-2xl">
          Deleted v{undoShown.current}
          <button type="button" onClick={() => void undoDeleteVersion(undoShown.current)} className={`${btn.secondary} !min-h-9 px-4 text-sm`}>
            Undo
          </button>
        </div>
      </Presence>
      {toast && undoDelete === null && (
        <p role="status" className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full border border-line bg-bg px-5 py-3 text-sm shadow-2xl">
          {toast}
        </p>
      )}
    </div>
  );
}
