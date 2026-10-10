"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ImportDialog, type ImportedCard } from "@/components/builder/ImportDialog";
import { CollectionSearch } from "@/components/collection/CollectionSearch";
import { CustomArtImportDialog } from "@/components/CustomArtImportDialog";
import { CustomArtSection } from "@/components/CustomArtSection";
import { Dialog } from "@/components/Dialog";
import { Nav } from "@/components/Nav";
import { api, ApiError } from "@/lib/api";
import { loginUrl } from "@/lib/auth";
import { customArtUrl, formatPrice } from "@/lib/links";
import type { Card, CustomPrinting } from "@/lib/types";

interface Entry {
  card: Card;
  quantity: number;
}

type Sort = "name" | "price" | "mv" | "quantity";
type View = "list" | "gallery";

const MAX = 999;

const SORTS: Array<[Sort, string]> = [
  ["name", "Name"],
  ["price", "Price, high to low"],
  ["mv", "Mana value"],
  ["quantity", "Copies owned"],
];

const stepper =
  "flex h-11 w-11 items-center justify-center rounded-full border border-line text-lg leading-none hover:border-ink disabled:opacity-40";

export default function CollectionPage() {
  const router = useRouter();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<Sort>("name");
  const [view, setView] = useState<View>("list");
  const [importOpen, setImportOpen] = useState(false);
  const [artImportOpen, setArtImportOpen] = useState(false);
  const [arts, setArts] = useState<CustomPrinting[]>([]);
  const [artFor, setArtFor] = useState<Card | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const loadArts = useCallback(async () => {
    try {
      setArts(await api<CustomPrinting[]>("/api/custom-printings"));
    } catch {
      // Custom art is an extra: the collection still works without it.
    }
  }, []);

  const load = useCallback(async () => {
    void loadArts();
    try {
      setEntries(await api<Entry[]>("/api/collection"));
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace(loginUrl());
        return;
      }
      setError(err instanceof ApiError ? err.message : "Could not load your collection.");
    }
  }, [router, loadArts]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(timer);
  }, [toast]);

  const artsByCard = useMemo(() => {
    const map = new Map<string, CustomPrinting[]>();
    arts.forEach((art) => map.set(art.cardId, [...(map.get(art.cardId) ?? []), art]));
    return map;
  }, [arts]);
  const ownedIds = useMemo(() => new Set((entries ?? []).map((entry) => entry.card.id)), [entries]);

  const quantities = useMemo(() => new Map((entries ?? []).map((entry) => [entry.card.id, entry.quantity])), [entries]);

  const totals = useMemo(() => {
    const list = entries ?? [];
    return {
      unique: list.length,
      copies: list.reduce((sum, entry) => sum + entry.quantity, 0),
      value: list.reduce((sum, entry) => sum + (entry.card.priceUsd ?? 0) * entry.quantity, 0),
    };
  }, [entries]);

  const shown = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const list = (entries ?? []).filter((entry) => !needle || entry.card.name.toLowerCase().includes(needle));
    const by: Record<Sort, (a: Entry, b: Entry) => number> = {
      name: (a, b) => a.card.name.localeCompare(b.card.name),
      price: (a, b) => (b.card.priceUsd ?? -1) - (a.card.priceUsd ?? -1) || a.card.name.localeCompare(b.card.name),
      mv: (a, b) => a.card.manaValue - b.card.manaValue || a.card.name.localeCompare(b.card.name),
      quantity: (a, b) => b.quantity - a.quantity || a.card.name.localeCompare(b.card.name),
    };
    return [...list].sort(by[sort]);
  }, [entries, filter, sort]);

  /** Change a quantity right away on screen, then tell the server. If that fails, put the real data back. */
  async function setQuantity(card: Card, quantity: number) {
    const next = Math.max(0, Math.min(MAX, quantity));
    setEntries((previous) => {
      const list = previous ?? [];
      if (next === 0) return list.filter((entry) => entry.card.id !== card.id);
      return list.some((entry) => entry.card.id === card.id)
        ? list.map((entry) => (entry.card.id === card.id ? { ...entry, quantity: next } : entry))
        : [...list, { card, quantity: next }];
    });
    try {
      await api(`/api/collection/${card.id}`, { method: "PUT", body: { quantity: next } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save that change.");
      await load();
    }
  }

  async function importCards(cards: ImportedCard[], replace: boolean) {
    try {
      const result = await api<{ updated: number }>("/api/collection/bulk", {
        method: "POST",
        body: {
          mode: replace ? "replace" : "add",
          entries: cards.map((item) => ({ cardId: item.card.id, quantity: item.quantity })),
        },
      });
      setToast(`${replace ? "Replaced with" : "Added"} ${result.updated} different cards`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "The import failed.");
    }
  }

  function download() {
    const text = (entries ?? [])
      .slice()
      .sort((a, b) => a.card.name.localeCompare(b.card.name))
      .map((entry) => `${entry.quantity} ${entry.card.name}`)
      .join("\n");
    const url = URL.createObjectURL(new Blob([text + "\n"], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "eregion-collection.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="shell">
      <Nav active="collection" />

      <main className="pb-24">
        <h1 className="pt-14 pb-8 font-display text-[clamp(72px,12vw,190px)] leading-[0.9]">Your collection</h1>

        {error && (
          <p role="alert" className="mb-8 max-w-[640px] rounded-2xl border border-danger-line bg-danger/10 px-4 py-3 text-sm text-ink">
            {error}
          </p>
        )}

        <dl className="mb-10 grid gap-x-12 gap-y-6 border-y border-line py-8 sm:grid-cols-3">
          <div>
            <dt className="text-[15px] text-muted">Different cards</dt>
            <dd className="mt-2 text-[clamp(40px,4.4vw,72px)] leading-none font-medium tracking-[-0.045em]">{totals.unique}</dd>
          </div>
          <div>
            <dt className="text-[15px] text-muted">Total copies</dt>
            <dd className="mt-2 text-[clamp(40px,4.4vw,72px)] leading-none font-medium tracking-[-0.045em]">{totals.copies}</dd>
          </div>
          <div>
            <dt className="text-[15px] text-muted">Estimated value</dt>
            <dd className="mt-2 text-[clamp(40px,4.4vw,72px)] leading-none font-medium tracking-[-0.045em] whitespace-nowrap">
              {formatPrice(Math.round(totals.value * 100) / 100)}
            </dd>
          </div>
        </dl>

        <div className="flex flex-wrap items-end gap-3 pb-8">
          <div className="min-w-[260px] flex-1">
            <CollectionSearch quantities={quantities} onAdd={(card) => void setQuantity(card, (quantities.get(card.id) ?? 0) + 1)} />
          </div>
          <button type="button" onClick={() => setImportOpen(true)} className="pill min-h-14 rounded-full border border-ink px-6 text-[15px] font-medium">
            Import list
          </button>
          <button type="button" onClick={() => setArtImportOpen(true)} className="pill min-h-14 rounded-full border border-ink px-6 text-[15px] font-medium">
            Import custom art
          </button>
          <button
            type="button"
            onClick={download}
            disabled={totals.unique === 0}
            className="pill min-h-14 rounded-full border border-ink px-6 text-[15px] font-medium disabled:opacity-40"
          >
            Download list
          </button>
        </div>

        {entries === null && !error && <p className="text-muted">Loading your collection.</p>}

        {entries !== null && entries.length === 0 && (
          <div className="max-w-[560px] py-6">
            <p className="text-lg leading-normal text-muted">
              Nothing here yet. Search for a card above, or use Import list to paste what you own. Once it has cards, switch on
              Check collection in a deck to see which of its cards you still need.
            </p>
            <Link href="/decks" className="mt-2 inline-flex min-h-11 items-center text-accent-text underline underline-offset-4">
              Back to your decks
            </Link>
          </div>
        )}

        {entries !== null && entries.length > 0 && (
          <>
            <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4 border-b border-line pb-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="collection-filter" className="text-sm text-muted">
                  Filter your cards
                </label>
                <input
                  id="collection-filter"
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                  placeholder="Part of a name"
                  className="min-h-11 w-64 rounded-full border border-line bg-surface px-5 text-[15px] text-ink placeholder:text-muted focus:border-ink focus:outline-none"
                />
              </div>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                <div className="flex items-center gap-3">
                  <label htmlFor="collection-sort" className="text-sm text-muted">
                    Sort by
                  </label>
                  <select
                    id="collection-sort"
                    value={sort}
                    onChange={(event) => setSort(event.target.value as Sort)}
                    className="min-h-11 rounded-full border border-line bg-surface px-4 text-sm text-ink focus:border-ink focus:outline-none"
                  >
                    {SORTS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-1 rounded-full border border-line p-1">
                  {(["list", "gallery"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      aria-pressed={view === mode}
                      onClick={() => setView(mode)}
                      className={`min-h-9 [@media(pointer:coarse)]:min-h-11 rounded-full px-4 text-sm capitalize ${view === mode ? "bg-ink text-bg" : ""}`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {shown.length === 0 && <p className="py-8 text-muted">No card in your collection matches that.</p>}

            {view === "list" ? (
              <ul>
                {shown.map(({ card, quantity }) => (
                  <li key={card.id} className="grid grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-x-5 gap-y-1 border-b border-line py-3 sm:grid-cols-[56px_minmax(0,1fr)_120px_auto_auto]">
                    <div className="relative h-10 w-14 overflow-hidden rounded-lg bg-surface">
                      {card.imageArtCrop && <Image src={card.imageArtCrop} alt="" fill sizes="56px" className="object-cover grayscale" />}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[17px]">{card.name}</p>
                      <p className="truncate font-mono text-xs text-muted">{card.typeLine}</p>
                    </div>
                    <p className="hidden text-right text-[15px] sm:block">{formatPrice(card.priceUsd)}</p>
                    <p className="hidden font-mono text-xs text-muted sm:block">{card.setCode.toUpperCase()}</p>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setArtFor(card)} aria-label={`Custom art for ${card.name}`} className="pill mr-2 hidden min-h-11 items-center rounded-full border border-line px-4 text-sm sm:inline-flex">
                        Custom art{artsByCard.get(card.id) ? ` (${artsByCard.get(card.id)?.length})` : ""}
                      </button>
                      <button type="button" aria-label={`Remove one ${card.name}`} className={stepper} onClick={() => void setQuantity(card, quantity - 1)}>
                        -
                      </button>
                      <span className="w-9 text-center font-mono text-[15px]" aria-label={`${quantity} copies of ${card.name}`}>
                        {quantity}
                      </span>
                      <button type="button" aria-label={`Add one ${card.name}`} className={stepper} disabled={quantity >= MAX} onClick={() => void setQuantity(card, quantity + 1)}>
                        +
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-x-5 gap-y-8 pt-8">
                {shown.map(({ card, quantity }) => (
                  <li key={card.id} className="flex flex-col gap-2.5">
                    <div className="relative aspect-[488/680] overflow-hidden rounded-[14px] bg-surface">
                      {(artsByCard.get(card.id)?.[0] || card.imageNormal) && (
                        <Image
                          src={artsByCard.get(card.id)?.[0] ? customArtUrl(artsByCard.get(card.id)![0].id) : card.imageNormal}
                          alt={card.name}
                          fill
                          sizes="260px"
                          className="object-cover"
                        />
                      )}
                      {quantity > 1 && (
                        <span className="absolute top-2 right-2 rounded-full bg-bg px-2 py-0.5 font-mono text-xs">{quantity}x</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2 px-1">
                      <p className="min-w-0 truncate text-sm">{card.name}</p>
                      <div className="flex shrink-0 items-center gap-1">
                        <button type="button" onClick={() => setArtFor(card)} aria-label={`Custom art for ${card.name}`} className="pill min-h-11 rounded-full border border-line px-3 text-xs">
                          Art{artsByCard.get(card.id) ? ` (${artsByCard.get(card.id)?.length})` : ""}
                        </button>
                        <button type="button" aria-label={`Remove one ${card.name}`} className={stepper} onClick={() => void setQuantity(card, quantity - 1)}>
                          -
                        </button>
                        <button type="button" aria-label={`Add one ${card.name}`} className={stepper} disabled={quantity >= MAX} onClick={() => void setQuantity(card, quantity + 1)}>
                          +
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </main>

      <CustomArtImportDialog open={artImportOpen} onClose={() => setArtImportOpen(false)} owned={ownedIds} onDone={() => void load()} />
      <Dialog open={artFor !== null} onClose={() => setArtFor(null)} label="Custom art" size="md">
        {artFor && (
          <div className="flex flex-col gap-6">
            <h2 className="font-display text-[44px] leading-none">{artFor.name}</h2>
            <CustomArtSection cardId={artFor.id} onChanged={() => void loadArts()} />
            <div>
              <button type="button" onClick={() => setArtFor(null)} className="pill min-h-12 rounded-full border border-ink px-7 text-sm font-medium">
                Done
              </button>
            </div>
          </div>
        )}
      </Dialog>
      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={(cards, replace) => void importCards(cards, replace)}
        title="Import your cards"
        addLabel="Add to my collection"
        replaceLabel="Replace my whole collection"
      />

      {toast && (
        <p role="status" className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full border border-line bg-bg px-5 py-3 text-sm shadow-2xl">
          {toast}
        </p>
      )}
    </div>
  );
}
