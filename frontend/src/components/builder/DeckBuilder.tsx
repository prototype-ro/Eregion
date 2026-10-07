"use client";

import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { groupLines, lineKey, type GroupMode } from "@/lib/groups";
import { computeStats } from "@/lib/stats";
import type { Board, Card, DeckCardLine, Timeline, VersionDetail } from "@/lib/types";
import { CardList } from "./CardList";
import { CardGallery, CardStacks } from "./CardViews";
import { CardPreview } from "./CardPreview";
import { CardSearch } from "./CardSearch";
import { StatsSection } from "./StatsSection";
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

function lineFromCard(card: Card, board: Board): DeckCardLine {
  return {
    cardId: card.id,
    name: card.name,
    manaCost: card.manaCost,
    manaValue: card.manaValue,
    primaryType: card.primaryType,
    typeLine: card.typeLine,
    colors: card.colors,
    imageSmall: card.imageSmall,
    imageNormal: card.imageNormal,
    imageArtCrop: card.imageArtCrop,
    board,
    quantity: 1,
    owned: 0,
  };
}

/** Order-independent fingerprint of a card list, used to tell whether the draft changed. */
const signature = (lines: DeckCardLine[]) =>
  lines
    .map((line) => `${lineKey(line)}:${line.quantity}`)
    .sort()
    .join(",");

const field =
  "min-h-11 rounded-full border border-line bg-surface px-4 text-sm text-ink placeholder:text-muted focus:border-ink focus:outline-none";

interface Props {
  deck: { id: string; name: string; format: string };
  /** The version opened in the builder. Null for a deck with no saved version yet. */
  version: VersionDetail | null;
  timeline: Timeline;
  token: string;
  /** How many copies of each card the user owns, by card id. */
  owned: Map<string, number>;
  /** Called with the new version number after a successful save. */
  onSaved: (versionNumber: number) => void;
  onSelectVersion: (versionNumber: number) => void;
}

export function DeckBuilder({ deck, version, timeline, token, owned, onSaved, onSelectVersion }: Props) {
  const baseLines = useMemo(() => version?.cards ?? [], [version]);

  const [lines, setLines] = useState<DeckCardLine[]>(baseLines);
  const [tab, setTab] = useState<Tab>("main");
  const [group, setGroup] = useState<GroupMode>("type");
  const [view, setView] = useState<ViewMode>("list");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [branching, setBranching] = useState(false);
  const [branchName, setBranchName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Remember the chosen view between visits.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(VIEW_KEY);
      if (stored === "list" || stored === "stacks" || stored === "gallery") setView(stored);
    } catch {
      // Storage blocked: the view just resets next time.
    }
  }, []);

  function chooseView(next: ViewMode) {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Not persisted, that is fine.
    }
  }

  const withOwned = useMemo(() => lines.map((line) => ({ ...line, owned: owned.get(line.cardId) ?? 0 })), [lines, owned]);
  const baseWithOwned = useMemo(
    () => baseLines.map((line) => ({ ...line, owned: owned.get(line.cardId) ?? 0 })),
    [baseLines, owned],
  );

  const stats = useMemo(() => computeStats(withOwned), [withOwned]);
  const savedStats = useMemo(() => (version ? computeStats(baseWithOwned) : null), [version, baseWithOwned]);

  const baseKeys = useMemo(() => new Set(baseLines.map(lineKey)), [baseLines]);
  const currentKeys = useMemo(() => new Set(lines.map(lineKey)), [lines]);
  const newKeys = useMemo(() => new Set(lines.filter((line) => !baseKeys.has(lineKey(line))).map(lineKey)), [lines, baseKeys]);
  const removed = useMemo(() => baseWithOwned.filter((line) => !currentKeys.has(lineKey(line))), [baseWithOwned, currentKeys]);

  const dirty = signature(lines) !== signature(baseLines);
  const hasCommander = lines.some((line) => line.board === "commander");

  // Saving from anything but the newest version of a line has to start a new branch.
  const viewingOlder = version !== null && !version.head;
  const needsBranch = viewingOlder || branching;
  const canSave = lines.length > 0 && !saving && (needsBranch ? branchName.trim() !== "" : dirty);

  const visible = withOwned.filter((line) => (tab === "main" ? line.board === "main" || line.board === "commander" : line.board === tab));
  const groups = tab === "main" ? groupLines(visible, group) : groupLines(visible, "type");
  const selected = withOwned.find((line) => lineKey(line) === selectedKey) ?? withOwned.find((line) => line.board === "commander") ?? null;

  const tabCount = (target: Tab) =>
    withOwned
      .filter((line) => (target === "main" ? line.board === "main" || line.board === "commander" : line.board === target))
      .reduce((sum, line) => sum + line.quantity, 0);

  const versionSummary = timeline.branches.flatMap((branch) => branch.versions).find((v) => v.versionNumber === version?.versionNumber);

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

  function changeQuantity(target: DeckCardLine, delta: number) {
    setLines((previous) =>
      previous.flatMap((line) => {
        if (lineKey(line) !== lineKey(target)) return [line];
        const quantity = Math.min(MAX_QUANTITY, line.quantity + delta);
        return quantity <= 0 ? [] : [{ ...line, quantity }];
      }),
    );
  }

  function removeLine(target: DeckCardLine) {
    setLines((previous) => previous.filter((line) => lineKey(line) !== lineKey(target)));
  }

  function moveLine(target: DeckCardLine, board: Board) {
    setLines((previous) => {
      const rest = previous.filter((line) => lineKey(line) !== lineKey(target));
      const index = rest.findIndex((line) => line.cardId === target.cardId && line.board === board);
      if (index === -1) return [...rest, { ...target, board }];
      return rest.map((line, i) =>
        i === index ? { ...line, quantity: Math.min(MAX_QUANTITY, line.quantity + target.quantity) } : line,
      );
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const saved = await api<VersionDetail>(`/api/decks/${deck.id}/versions`, {
        method: "POST",
        token,
        body: {
          note: note.trim(),
          cards: lines.map((line) => ({ cardId: line.cardId, quantity: line.quantity, board: line.board })),
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
  const viewProps = {
    groups,
    selectedKey,
    newKeys,
    onSelect: (line: DeckCardLine) => setSelectedKey(lineKey(line)),
    onQuantity: changeQuantity,
    onRemove: removeLine,
    onMove: moveLine,
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
      {error && (
        <p role="alert" className="mb-6 rounded-2xl border border-add-line bg-add-bg px-5 py-3.5 text-sm text-add-text">
          {error}
        </p>
      )}

      {/* Version timeline */}
      <section aria-labelledby="timeline-heading" className="mb-10 rounded-card border border-line bg-surface px-6 pt-5 pb-6">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="timeline-heading" className="text-lg font-medium">
            Versions
          </h2>
          {version && (
            <p className="text-sm text-muted">
              v{version.versionNumber} on {version.branchName}
              {versionSummary ? `, ${versionSummary.cardCount} cards` : ""}
              {version.note ? `, "${version.note}"` : ""}
            </p>
          )}
        </div>
        <VersionTimeline timeline={timeline} current={version?.versionNumber ?? null} onSelect={onSelectVersion} />
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
              <span className="text-sm text-muted">Group by</span>
              <div className="flex gap-1 rounded-full border border-line p-1">
                {(["type", "mv"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={group === mode}
                    onClick={() => setGroup(mode)}
                    className={`min-h-9 rounded-full px-4 text-sm ${group === mode ? "bg-ink text-bg" : ""}`}
                  >
                    {mode === "type" ? "Type" : "Mana value"}
                  </button>
                ))}
              </div>
            </div>
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

      <div className="py-7">
        <CardSearch token={token} inDeck={inDeck} owned={owned} onAdd={addCard} onSetCommander={setCommander} />
      </div>

      {/* Cards */}
      <div className="grid items-start gap-x-10 gap-y-8 lg:grid-cols-[clamp(260px,18vw,380px)_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-6">
          <CardPreview line={selected} />
        </div>
        <div>
          {view === "list" && <CardList {...viewProps} />}
          {view === "stacks" && <CardStacks {...viewProps} />}
          {view === "gallery" && <CardGallery {...viewProps} />}
        </div>
      </div>

      <div className="mt-16">
        <StatsSection deckId={deck.id} stats={stats} saved={savedStats} savedVersion={version?.versionNumber ?? 0} removed={removed} />
      </div>
    </div>
  );
}
