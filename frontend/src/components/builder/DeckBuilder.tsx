"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { allTags, GROUP_MODES, groupLines, lineKey, type GroupMode } from "@/lib/groups";
import { checkLegality } from "@/lib/legality";
import { customArtUrl } from "@/lib/links";
import { computeStats } from "@/lib/stats";
import type { Board, Card, DeckCardLine, CustomPrinting, Printing, Timeline, VersionDetail, Visibility } from "@/lib/types";
import { CardList } from "./CardList";
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
  "min-h-11 rounded-full border border-line bg-surface px-4 text-sm text-ink placeholder:text-muted focus:border-ink focus:outline-none";

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
  deck: { id: string; name: string; format: string; visibility: Visibility; publishedVersion: number | null };
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
}

export function DeckBuilder({ deck, version, timeline, owned, onSaved, onSelectVersion, onReload }: Props) {
  const baseLines = useMemo(() => version?.cards ?? [], [version]);

  const [lines, setLines] = useState<DeckCardLine[]>(baseLines);
  const [tab, setTab] = useState<Tab>("main");
  const [group, setGroup] = useState<GroupMode>("type");
  const [view, setView] = useState<ViewMode>("list");
  const [cardSize, setCardSize] = useState(SIZE_DEFAULT);
  const [timelineOpen, setTimelineOpen] = useState(true);
  const [visibility, setVisibility] = useState<Visibility>(deck.visibility);
  const [publishedVersion, setPublishedVersion] = useState<number | null>(deck.publishedVersion);
  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const [branchesOpen, setBranchesOpen] = useState(false);
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
  const [toast, setToast] = useState<string | null>(null);

  // Remember the chosen view and whether the timeline is open.
  useEffect(() => {
    try {
      const storedView = localStorage.getItem(VIEW_KEY);
      if (storedView === "list" || storedView === "stacks" || storedView === "gallery") setView(storedView);
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
  const hasCommander = lines.some((line) => line.board === "commander");

  // Saving from anything but the newest version of a line has to start a new branch.
  const viewingOlder = version !== null && !version.head;
  const needsBranch = viewingOlder || branching;
  const canSave = lines.length > 0 && !saving && (needsBranch ? branchName.trim() !== "" : dirty);

  const visible = withOwned.filter((line) => (tab === "main" ? line.board === "main" || line.board === "commander" : line.board === tab));
  const groups = groupLines(visible, tab === "main" ? group : "type");
  const lineByKey = (key: string | null) => withOwned.find((line) => lineKey(line) === key) ?? null;
  const selected = lineByKey(selectedKey) ?? withOwned.find((line) => line.board === "commander") ?? null;

  const tabCount = (target: Tab) =>
    withOwned
      .filter((line) => (target === "main" ? line.board === "main" || line.board === "commander" : line.board === target))
      .reduce((sum, line) => sum + line.quantity, 0);

  const versionSummary = timeline.branches.flatMap((branch) => branch.versions).find((v) => v.versionNumber === version?.versionNumber);

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

  function toggleTimeline() {
    setTimelineOpen((open) => {
      remember(TIMELINE_KEY, open ? "closed" : "open");
      return !open;
    });
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
    const incoming = cards.map(({ card, quantity, board }) => lineFromCard(card, board, quantity));
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
    setToast(`Imported ${incoming.reduce((sum, line) => sum + line.quantity, 0)} cards`);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const saved = await api<VersionDetail>(`/api/decks/${deck.id}/versions`, {
        method: "POST",
        body: {
          note: note.trim(),
          cards: lines.map((line) => ({
            cardId: line.cardId,
            quantity: line.quantity,
            board: line.board,
            printingId: line.customPrintingId ? null : line.printingId,
        customPrintingId: line.customPrintingId,
            tags: line.tags,
          })),
          fromVersion: version?.versionNumber,
          branchName: needsBranch ? branchName.trim() : undefined,
        },
      });
      onSaved(saved.versionNumber);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the version.");
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
    onSelect: (line: DeckCardLine) => setSelectedKey(lineKey(line)),
    onMenu: (line: DeckCardLine, x: number, y: number) => setMenu({ line, x, y }),
    checkCollection,
    cardSize,
  };

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-6 pt-10 pb-8">
        <div className="min-w-0">
          <div className="mb-3.5 flex flex-wrap gap-2 text-sm">
            <span className="rounded-full border border-line px-3.5 py-1.5 capitalize">{deck.format}</span>
            {version && <span className="rounded-full border border-line px-3.5 py-1.5">{version.branchName}</span>}
            {dirty ? (
              <span className="rounded-full border border-add-line bg-add-bg px-3.5 py-1.5 text-add-text">Unsaved changes</span>
            ) : (
              <span className="rounded-full border border-line px-3.5 py-1.5">
                {version ? `Version ${version.versionNumber}` : "No cards yet"}
              </span>
            )}
            <button
              type="button"
              onClick={() => setVisibilityOpen(true)}
              aria-label={visibility === "public" ? `Public, showing version ${publishedVersion}. Change visibility` : "Private. Change visibility"}
              className={`pill rounded-full border px-3.5 py-1.5 ${visibility === "public" ? "border-accent-text text-accent-text" : "border-line"}`}
            >
              {visibility === "public" ? `Public, v${publishedVersion}` : "Private"}
            </button>
            {!hasCommander && lines.length > 0 && (
              <span className="rounded-full border border-line px-3.5 py-1.5 text-muted">No commander chosen</span>
            )}
          </div>
          <h1 className="font-display text-[clamp(56px,8vw,128px)] leading-[0.92]">{deck.name}</h1>
        </div>

        <div className="flex flex-col items-end gap-3.5">
          <p className="text-base text-muted">
            <span className="text-4xl font-medium tracking-[-0.03em] text-ink">{stats.totalCards}</span> of 100 cards
          </p>
          <details className="group/legal relative text-right">
            <summary
              className={`inline-flex min-h-9 cursor-pointer list-none items-center rounded-full border px-4 text-sm font-medium ${
                legality.legal ? "border-accent-text text-accent-text" : "border-add-line text-add-text"
              }`}
            >
              {legality.legal ? "Legal in Commander" : `${legality.issues.length} ${legality.issues.length === 1 ? "issue" : "issues"} for Commander`}
            </summary>
            <div className="absolute right-0 z-30 mt-2 w-[min(360px,90vw)] rounded-2xl border border-line bg-bg p-4 text-left text-sm shadow-[0_18px_40px_rgba(0,0,0,0.45)]">
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
          <div className="flex flex-wrap items-center justify-end gap-2.5">
            <label className="sr-only" htmlFor="version-note">
              Version note
            </label>
            <input
              id="version-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={200}
              placeholder="What changed? (optional)"
              className={`${field} w-56`}
            />
            {needsBranch && (
              <>
                <label className="sr-only" htmlFor="branch-name">
                  New branch name
                </label>
                <input
                  id="branch-name"
                  value={branchName}
                  onChange={(event) => setBranchName(event.target.value)}
                  maxLength={40}
                  placeholder="Name the new branch"
                  className={`${field} w-52 border-accent-text`}
                />
              </>
            )}
            {!viewingOlder && (
              <button
                type="button"
                aria-pressed={branching}
                onClick={() => setBranching((value) => !value)}
                className="pill min-h-11 rounded-full border border-ink px-5 text-[15px] font-medium"
              >
                {branching ? "Keep on this branch" : "Branch off"}
              </button>
            )}
            <button
              type="button"
              disabled={!dirty || saving}
              onClick={() => setLines(baseLines)}
              className="pill min-h-11 rounded-full border border-ink px-5 text-[15px] font-medium disabled:opacity-40"
            >
              Discard changes
            </button>
            <button
              type="button"
              disabled={!canSave}
              onClick={save}
              className="press min-h-11 rounded-full bg-accent px-6 text-[15px] font-bold text-on-accent disabled:opacity-40"
            >
              {saving ? "Saving" : needsBranch ? "Save as new branch" : "Save version"}
            </button>
          </div>
        </div>
      </div>

      {viewingOlder && (
        <p className="mb-6 rounded-2xl border border-line bg-surface px-5 py-3.5 text-[15px] text-muted">
          You are looking at version {version.versionNumber} on {version.branchName}, which is not its latest. Saving from here
          starts a new branch, so nothing you already saved is changed.
        </p>
      )}
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
        <p role="alert" className="mb-6 rounded-2xl border border-add-line bg-add-bg px-5 py-3.5 text-sm text-add-text">
          {error}
        </p>
      )}

      {/* Version timeline, collapsible */}
      <section aria-labelledby="timeline-heading" className="mb-10 rounded-card border border-line bg-surface px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="timeline-heading" className="text-lg font-medium">
            Versions
          </h2>
          <div className="flex items-center gap-4">
            {version && (
              <p className="text-sm text-muted">
                v{version.versionNumber} on {version.branchName}
                {versionSummary ? `, ${versionSummary.cardCount} cards` : ""}
                {version.note ? `, "${version.note}"` : ""}
              </p>
            )}
            <button
              type="button"
              onClick={() => setBranchesOpen(true)}
              className="pill min-h-11 rounded-full border border-ink px-5 text-sm font-medium"
            >
              Branches
            </button>
            <button
              type="button"
              aria-expanded={timelineOpen}
              aria-controls="timeline-body"
              onClick={toggleTimeline}
              className="pill min-h-11 rounded-full border border-ink px-5 text-sm font-medium"
            >
              {timelineOpen ? "Hide timeline" : "Show timeline"}
            </button>
          </div>
        </div>
        {timelineOpen && (
          <div id="timeline-body" className="pt-2 pb-2">
            <VersionTimeline timeline={timeline} current={version?.versionNumber ?? null} onSelect={onSelectVersion} />
          </div>
        )}
      </section>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4 border-b border-line">
        <div className="flex flex-wrap gap-7" role="tablist" aria-label="Boards">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`min-h-12 border-b-2 py-2.5 text-base ${tab === key ? "border-accent-text" : "border-transparent text-muted"}`}
            >
              {label} <span className="text-sm text-muted">{tabCount(key)}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pb-2">
          {tab === "main" && (
            <div className="flex items-center gap-3">
              <label htmlFor="group-by" className="text-sm text-muted">
                Group by
              </label>
              <select
                id="group-by"
                value={group}
                onChange={(event) => setGroup(event.target.value as GroupMode)}
                className="min-h-11 rounded-full border border-line bg-surface px-4 text-sm text-ink focus:border-ink focus:outline-none"
              >
                {GROUP_MODES.map(([mode, label]) => (
                  <option key={mode} value={mode}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button
            type="button"
            role="switch"
            aria-checked={checkCollection}
            onClick={toggleCollectionCheck}
            className="flex min-h-11 items-center gap-3 text-sm"
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
            <label className="flex min-h-11 items-center gap-3 text-sm text-muted">
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
                  className={`min-h-9 rounded-full px-4 text-sm ${view === mode ? "bg-ink text-bg" : ""}`}
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
          className="pill min-h-14 rounded-full border border-ink px-6 text-[15px] font-medium"
        >
          Import list
        </button>
      </div>

      {/* Cards */}
      <div className="grid items-start gap-x-10 gap-y-8 lg:grid-cols-[clamp(260px,18vw,380px)_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-6">
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
      <BranchesDialog
        open={branchesOpen}
        onClose={() => setBranchesOpen(false)}
        deckId={deck.id}
       
        timeline={timeline}
        currentBranchId={version?.branchId ?? null}
        onChanged={(next, deletedId) => {
          if (deletedId !== null && deletedId === version?.branchId) {
            // The open version went with its branch: move to the end of the first line.
            setBranchesOpen(false);
            const first = next.branches.find((branch) => branch.forkedFromVersion === null) ?? next.branches[0];
            const tip = first?.versions[first.versions.length - 1];
            if (tip) onSelectVersion(tip.versionNumber);
          } else {
            onReload();
          }
          setToast(deletedId !== null ? "Branch deleted" : "Branch renamed");
        }}
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

      {toast && (
        <p role="status" className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full border border-line bg-bg px-5 py-3 text-sm shadow-2xl">
          {toast}
        </p>
      )}
    </div>
  );
}
