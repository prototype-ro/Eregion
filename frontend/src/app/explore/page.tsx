"use client";

import Link from "next/link";
import { BracketPill } from "@/components/BracketPill";
import { ManaCost } from "@/components/Mana";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { CardArt } from "@/components/CardArt";
import { Nav } from "@/components/Nav";
import { api, ApiError } from "@/lib/api";
import { formatPrice, sortColors } from "@/lib/links";
import type { Card, PublicDeck } from "@/lib/types";
import { btn, field } from "@/lib/ui";

const filterSelect =
  "min-h-9 rounded-full border border-line bg-surface px-4 text-sm text-ink focus:border-ink focus:outline-none [@media(pointer:coarse)]:min-h-11";
const COLOR_NAMES = { W: "White", U: "Blue", B: "Black", R: "Red", G: "Green" } as const;

/** Adds or takes away one colour, keeping the WUBRG order. */
function toggleColor(current: string, color: string): string {
  const on = current.includes(color);
  return "WUBRG".split("").filter((c) => (c === color ? !on : current.includes(c))).join("");
}

const PAGE = 24;

export default function ExplorePage() {
  // useSearchParams needs a Suspense boundary in the App Router.
  return (
    <Suspense fallback={<p className="py-16 text-muted">Loading.</p>}>
      <Explore />
    </Suspense>
  );
}

function Explore() {
  const params = useSearchParams();
  const commanderId = params.get("commander");

  const [commander, setCommander] = useState<Card | null>(null);
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [decks, setDecks] = useState<PublicDeck[] | null>(null);
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [colors, setColors] = useState<string>("");
  const [bracket, setBracket] = useState<string>("");
  const [maxPrice, setMaxPrice] = useState<string>("");
  const [sort, setSort] = useState<string>("newest");
  const filtered = Boolean(colors || bracket || maxPrice);
  const latest = useRef(0);

  // Wait a moment after typing before asking the server.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(text.trim()), 300);
    return () => clearTimeout(timer);
  }, [text]);

  const fail = useCallback(
    (err: unknown) => {
      setError(err instanceof ApiError ? err.message : "Could not load decks.");
    },
    [],
  );

  const url = useCallback(
    (offset: number) => {
      const search = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
      if (commanderId) search.set("commander", commanderId);
      if (query) search.set("q", query);
      if (colors) search.set("colors", colors);
      if (bracket) search.set("bracket", bracket);
      if (maxPrice) search.set("maxPrice", maxPrice);
      if (sort !== "newest") search.set("sort", sort);
      return `/api/explore?${search}`;
    },
    [commanderId, query, colors, bracket, maxPrice, sort],
  );

  useEffect(() => {
    const request = ++latest.current;
    setError(null);
    api<PublicDeck[]>(url(0))
      .then((list) => {
        if (request !== latest.current) return;
        setDecks(list);
        setMore(list.length === PAGE);
      })
      .catch(fail);
  }, [url, fail]);

  useEffect(() => {
    if (!commanderId) {
      setCommander(null);
      return;
    }
    api<Card>(`/api/cards/${commanderId}`).then(setCommander).catch(() => setCommander(null));
  }, [commanderId]);

  async function loadMore() {
    if (!decks) return;
    setLoadingMore(true);
    try {
      const next = await api<PublicDeck[]>(url(decks.length));
      setDecks([...decks, ...next]);
      setMore(next.length === PAGE);
    } catch (err) {
      fail(err);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="shell">
      <Nav active="explore" />
      <main id="main" tabIndex={-1} className="pb-24">
        <h1 className="pt-16 pb-4 font-display text-[clamp(72px,13vw,200px)] leading-[0.9]">Explore</h1>
        <p className="max-w-[560px] pb-8 text-lg leading-normal text-muted">Decks other players chose to share. Each one shows the version its owner picked.</p>

        <div className="flex flex-wrap items-center gap-3 border-t border-line py-6">
          <div className="min-w-[260px] max-w-[560px] flex-1">
            <label htmlFor="explore-search" className="sr-only">
              Search public decks
            </label>
            <input
              id="explore-search"
              value={text}
              onChange={(event) => setText(event.target.value)}
              maxLength={80}
              placeholder="Search by deck, commander or author"
              className={field.lg}
            />
          </div>
          <fieldset className="flex items-center gap-1.5">
            <legend className="sr-only">Colours the deck stays within</legend>
            {(["W", "U", "B", "R", "G"] as const).map((color) => {
              const on = colors.includes(color);
              return (
                <button
                  key={color}
                  type="button"
                  aria-pressed={on}
                  aria-label={COLOR_NAMES[color]}
                  title="Show decks whose colours stay within the ones picked"
                  onClick={() => setColors((current) => toggleColor(current, color))}
                  className={`flex size-9 items-center justify-center rounded-full border text-[18px] [@media(pointer:coarse)]:size-11 ${on ? "border-accent-text" : "border-line opacity-50"}`}
                >
                  <ManaCost cost={`{${color}}`} />
                </button>
              );
            })}
          </fieldset>
          <label className="sr-only" htmlFor="explore-bracket">
            Bracket
          </label>
          <select id="explore-bracket" value={bracket} onChange={(event) => setBracket(event.target.value)} className={filterSelect}>
            <option value="">Any bracket</option>
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>{`Bracket ${n}`}</option>
            ))}
            <option value="5">cEDH</option>
          </select>
          <label className="sr-only" htmlFor="explore-price">
            Price
          </label>
          <select id="explore-price" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} className={filterSelect}>
            <option value="">Any price</option>
            {[50, 100, 250, 500, 1000].map((n) => (
              <option key={n} value={n}>{`Up to $${n}`}</option>
            ))}
          </select>
          <label className="sr-only" htmlFor="explore-sort">
            Order
          </label>
          <select id="explore-sort" value={sort} onChange={(event) => setSort(event.target.value)} className={filterSelect}>
            <option value="newest">Newest first</option>
            <option value="price-low">Cheapest first</option>
            <option value="price-high">Priciest first</option>
          </select>
          {filtered && (
            <button
              type="button"
              onClick={() => {
                setColors("");
                setBracket("");
                setMaxPrice("");
              }}
              className="pill inline-flex min-h-9 items-center rounded-full border border-ink px-4 text-sm font-medium [@media(pointer:coarse)]:min-h-11"
            >
              Clear filters
            </button>
          )}
          {commanderId && (
            <p className="flex min-h-11 items-center gap-3 rounded-full border border-accent-text pr-2 pl-5 text-[15px]">
              <span>
                Commander: <span className="font-medium">{commander?.name ?? "this card"}</span>
              </span>
              <Link href="/explore" className="pill inline-flex min-h-9 [@media(pointer:coarse)]:min-h-11 items-center rounded-full border border-ink px-4 text-sm font-medium">
                Clear
              </Link>
            </p>
          )}
        </div>

        {error && (
          <p role="alert" className="mb-8 max-w-[560px] rounded-2xl border border-danger-line bg-danger/10 px-4 py-3 text-sm text-ink">
            {error}
          </p>
        )}
        {decks === null && !error && <p className="text-muted">Loading decks.</p>}
        <p role="status" className="sr-only">
          {decks === null ? "" : decks.length === 0 ? "No decks match." : `${decks.length}${more ? " or more" : ""} decks shown.`}
        </p>
        {decks !== null && decks.length === 0 && (commanderId || query || filtered) && (
          <p className="max-w-[460px] text-lg leading-normal text-muted">No public decks match. Try clearing the search or the filters.</p>
        )}
        {decks !== null && decks.length === 0 && !commanderId && !query && !filtered && (
          <div className="max-w-[620px] border-t border-line pt-8">
            <p className="text-xl leading-normal">No shared decks yet.</p>
            <p className="mt-3 text-[17px] leading-relaxed text-muted">
              A deck shared here shows its cards, its bracket and analysis, and how it got there: every version it grew from,
              with its owner&rsquo;s notes and what each change did. Anyone can open it, no account needed.
            </p>
            <p className="mt-3 text-[17px] leading-relaxed text-muted">
              Build or import a deck, save a version or two, then choose Public on the deck&rsquo;s page.
            </p>
            <Link href="/decks" className="press mt-6 inline-flex min-h-11 items-center rounded-full bg-accent px-7 font-bold text-on-accent">
              Start a deck
            </Link>
          </div>
        )}

        {decks !== null && decks.length > 0 && (
          <ul className="grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-6">
            {decks.map((deck) => (
              <li key={deck.id} className="group relative">
                {deck.artUrl ? (
                  <CardArt src={deck.artUrl} alt={`${deck.commanderName ?? deck.name} card art`} sizes="(min-width: 1024px) 25vw, 50vw" className="aspect-[4/5] rounded-card" />
                ) : (
                  <div className="aspect-[4/5] rounded-card border border-line bg-surface" aria-hidden="true" />
                )}
                <div className="px-1 pt-4">
                  <h2 className="text-xl font-medium tracking-[-0.02em]">
                    <Link href={`/explore/${deck.id}`} className="after:absolute after:inset-0">
                      {deck.name}
                    </Link>
                  </h2>
                  <p className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted">
                    {deck.commanderName ?? "No commander"}
                    <BracketPill bracket={deck.bracket} name={deck.bracketName} />
                  </p>
                  <p className="mt-1 font-mono text-[13px] text-muted">
                    by {deck.mine ? "you" : deck.ownerName}, v{deck.versionNumber}, {deck.cardCount} cards, {formatPrice(deck.priceUsd)}
                    {deck.colorIdentity ? `, ${sortColors(deck.colorIdentity)}` : ""}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}

        {more && (
          <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className={`${btn.large.secondary} mt-12`}>
            {loadingMore ? "Loading" : "Show more"}
          </button>
        )}
      </main>
    </div>
  );
}
