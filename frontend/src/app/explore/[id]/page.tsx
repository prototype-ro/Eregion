"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CardGallery, CardStacks } from "@/components/builder/CardViews";
import { CardList } from "@/components/builder/CardList";
import { ExportDialog } from "@/components/ExportDialog";
import { ReportDialog } from "@/components/ReportDialog";
import { SortDirectionButton } from "@/components/builder/SortDirectionButton";
import { CardPreview } from "@/components/builder/CardPreview";
import { StatsSection } from "@/components/builder/StatsSection";
import { Nav } from "@/components/Nav";
import { api, ApiError } from "@/lib/api";
import { loginUrl } from "@/lib/auth";
import { getMe } from "@/lib/me";
import { GROUP_MODES, groupLines, lineKey, SORT_MODES, type GroupMode, type SortDirection, type SortMode } from "@/lib/groups";
import { checkLegality } from "@/lib/legality";
import { exploreCommanderUrl, formatPrice, sortColors } from "@/lib/links";
import type { DeckDetail, PublicDeckDetail, User } from "@/lib/types";

type View = "list" | "stacks" | "gallery";
const VIEWS: Array<[View, string]> = [["list", "List"], ["stacks", "Stacks"], ["gallery", "Gallery"]];
const NO_KEYS = new Set<string>();
const noMenu = () => {};

export default function PublicDeckPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [detail, setDetail] = useState<PublicDeckDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("list");
  const [group, setGroup] = useState<GroupMode>("type");
  const [sort, setSort] = useState<SortMode>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [size, setSize] = useState(210);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [shared, setShared] = useState<string | null>(null);
  // undefined while checking, null for a visitor who is not signed in. Public decks can be read without an account.
  const [me, setMe] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    void getMe().then(setMe);
  }, []);

  useEffect(() => {
    api<PublicDeckDetail>(`/api/explore/${id}`)
      .then(setDetail)
      .catch((err) => {
        setError(err instanceof ApiError && err.status === 404 ? "This deck is not public, or it no longer exists." : "Could not load the deck.");
      });
  }, [id, router]);

  const counted = useMemo(() => (detail?.cards ?? []).filter((line) => line.board === "commander" || line.board === "main"), [detail]);
  const groups = useMemo(() => groupLines(counted, group, sort, sortDirection), [counted, group, sort, sortDirection]);
  const selected = counted.find((line) => lineKey(line) === selectedKey) ?? counted.find((line) => line.board === "commander") ?? null;
  const legality = useMemo(() => checkLegality(detail?.cards ?? []), [detail]);

  /** Starts a private deck of your own from this version. */
  async function copy() {
    if (!detail) return;
    if (!me) {
      router.push(loginUrl());
      return;
    }
    setCopying(true);
    try {
      const deck = await api<DeckDetail>("/api/decks", {
        method: "POST",
        body: {
          name: `${detail.deck.name} (copy)`.slice(0, 80),
          note: `Copied from ${detail.deck.ownerName}'s deck, version ${detail.deck.versionNumber}`,
          cards: detail.cards
            .filter((line) => line.board === "commander" || line.board === "main")
            .map((line) => ({ cardId: line.cardId, quantity: line.quantity, board: line.board, tags: line.tags })),
        },
      });
      router.push(`/decks/${deck.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not copy the deck.");
      setCopying(false);
    }
  }

  async function share() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setShared("Link copied");
    } catch {
      setShared("Copy the address from your browser");
    }
    setTimeout(() => setShared(null), 3000);
  }

  const commander = detail?.cards.find((line) => line.board === "commander");
  const viewProps = {
    groups,
    selectedKey: selected ? lineKey(selected) : null,
    newKeys: NO_KEYS,
    checkCollection: false,
    cardSize: size,
    readOnly: true,
    onSelect: (line: (typeof counted)[number]) => setSelectedKey(lineKey(line)),
    onMenu: noMenu,
  };

  return (
    <div className="shell">
      <Nav active="explore" />
      {error && (
        <div className="py-16">
          <p role="alert" className="max-w-[560px] rounded-2xl border border-danger-line bg-danger/10 px-4 py-3 text-sm text-ink">
            {error}
          </p>
          <Link href="/explore" className="mt-6 inline-block text-accent-text underline underline-offset-4">
            Back to Explore
          </Link>
        </div>
      )}
      {!error && !detail && <p className="py-16 text-muted">Loading the deck.</p>}
      {detail && (
        <main className="pb-24">
          <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-6 pt-10 pb-8">
            <div className="min-w-0">
              <Link href="/explore" className="text-sm text-muted">
                Back to Explore
              </Link>
              <div className="mt-4 mb-5 flex flex-wrap gap-2 text-sm text-muted">
                <span className="rounded-full border border-line px-3.5 py-1.5">by {detail.deck.mine ? "you" : detail.deck.ownerName}</span>
                <span className="rounded-full border border-line px-3.5 py-1.5">Version {detail.deck.versionNumber}</span>
                {detail.deck.colorIdentity && <span className="rounded-full border border-line px-3.5 py-1.5">{sortColors(detail.deck.colorIdentity)}</span>}
                <span className="rounded-full border border-line px-3.5 py-1.5">{formatPrice(detail.deck.priceUsd)}</span>
                <span className={`rounded-full border px-3.5 py-1.5 ${legality.legal ? "border-accent-text text-accent-text" : "border-line"}`}>
                  {legality.legal ? "Legal in Commander" : `${legality.issues.length} ${legality.issues.length === 1 ? "issue" : "issues"} for Commander`}
                </span>
              </div>
              <h1 className="font-display text-[clamp(56px,8vw,128px)] leading-[0.92]">{detail.deck.name}</h1>
              {detail.deck.description && <p className="mt-6 max-w-[68ch] whitespace-pre-line text-[17px] leading-relaxed text-muted">{detail.deck.description}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              {commander && (
                <Link href={exploreCommanderUrl(commander.cardId)} className="pill inline-flex min-h-12 items-center rounded-full border border-ink px-6 text-sm font-medium">
                  More decks with this commander
                </Link>
              )}
              <button type="button" onClick={() => void share()} className="pill min-h-12 rounded-full border border-ink px-6 text-sm font-medium">
                {shared ?? "Share link"}
              </button>
              <button type="button" onClick={() => setExportOpen(true)} className="pill min-h-12 rounded-full border border-ink px-6 text-sm font-medium">
                Export
              </button>
              <button type="button" onClick={() => void copy()} disabled={copying} className="press min-h-12 rounded-full bg-accent px-7 text-sm font-bold text-on-accent disabled:opacity-50">
                {copying ? "Copying" : me === null ? "Sign in to copy" : "Copy to my decks"}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-3 border-b border-line pb-4">
            <div className="flex items-center gap-3">
              <label htmlFor="pub-group" className="text-sm text-muted">
                Group by
              </label>
              <select id="pub-group" value={group} onChange={(event) => setGroup(event.target.value as GroupMode)} className="min-h-11 rounded-full border border-line bg-surface px-4 text-sm text-ink focus:border-ink focus:outline-none">
                {GROUP_MODES.map(([mode, label]) => (
                  <option key={mode} value={mode}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-3">
              <label htmlFor="pub-sort" className="text-sm text-muted">
                Sort by
              </label>
              <select id="pub-sort" value={sort} onChange={(event) => setSort(event.target.value as SortMode)} className="min-h-11 rounded-full border border-line bg-surface px-4 text-sm text-ink focus:border-ink focus:outline-none">
                {SORT_MODES.map(([mode, label]) => (
                  <option key={mode} value={mode}>
                    {label}
                  </option>
                ))}
              </select>
              <SortDirectionButton direction={sortDirection} onFlip={() => setSortDirection((d) => (d === "asc" ? "desc" : "asc"))} />
            </div>
            {view !== "list" && (
              <label className="flex min-h-11 items-center gap-3 text-sm text-muted">
                Size
                <input type="range" min={120} max={360} step={10} value={size} onChange={(event) => setSize(Number(event.target.value))} aria-label="Card size" className="w-32 accent-[var(--accent-text)]" />
              </label>
            )}
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted">View</span>
              <div className="flex gap-1 rounded-full border border-line p-1">
                {VIEWS.map(([mode, label]) => (
                  <button key={mode} type="button" aria-pressed={view === mode} onClick={() => setView(mode)} className={`min-h-9 [@media(pointer:coarse)]:min-h-11 rounded-full px-4 text-sm ${view === mode ? "bg-ink text-bg" : ""}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid items-start gap-x-10 gap-y-8 pt-8 lg:grid-cols-[clamp(260px,18vw,380px)_minmax(0,1fr)]">
            <div className="lg:sticky lg:top-6">
              <CardPreview line={selected} showCollection={false} />
            </div>
            <div>
              {view === "list" && <CardList {...viewProps} />}
              {view === "stacks" && <CardStacks {...viewProps} />}
              {view === "gallery" && <CardGallery {...viewProps} />}
            </div>
          </div>

          {me && !detail.deck.mine && (
            <p className="mt-16 text-sm text-muted">
              Something wrong with this deck?{" "}
              <button type="button" onClick={() => setReportOpen(true)} className="text-accent-text underline underline-offset-4">
                Report it
              </button>
            </p>
          )}

          <div className="mt-16">
            <StatsSection deckId={id} stats={detail.stats} saved={null} savedVersion={detail.deck.versionNumber} removed={[]} showCollection={false} readOnly />
          </div>
        </main>
      )}
      {detail && <ReportDialog open={reportOpen} onClose={() => setReportOpen(false)} deckId={id} />}
      {detail && <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} deckName={detail.deck.name} lines={counted} />}
    </div>
  );
}
