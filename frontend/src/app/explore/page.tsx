"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { CardArt } from "@/components/CardArt";
import { Nav } from "@/components/Nav";
import { api, ApiError } from "@/lib/api";
import { formatPrice, sortColors } from "@/lib/links";
import type { Card, PublicDeck } from "@/lib/types";

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
  const router = useRouter();
  const params = useSearchParams();
  const commanderId = params.get("commander");

  const [commander, setCommander] = useState<Card | null>(null);
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [decks, setDecks] = useState<PublicDeck[] | null>(null);
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);

  useEffect(() => {
  }, [router]);

  // Wait a moment after typing before asking the server.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(text.trim()), 300);
    return () => clearTimeout(timer);
  }, [text]);

  const fail = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) {
        router.replace("/login");
        return;
      }
      setError(err instanceof ApiError ? err.message : "Could not load decks.");
    },
    [router],
  );

  const url = useCallback(
    (offset: number) => {
      const search = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
      if (commanderId) search.set("commander", commanderId);
      if (query) search.set("q", query);
      return `/api/explore?${search}`;
    },
    [commanderId, query],
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
      <main className="pb-24">
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
              className="min-h-12 w-full rounded-full border border-line bg-surface px-5 text-[15px] text-ink placeholder:text-muted focus:border-ink focus:outline-none"
            />
          </div>
          {commanderId && (
            <p className="flex min-h-12 items-center gap-3 rounded-full border border-accent-text pr-2 pl-5 text-[15px]">
              <span>
                Commander: <span className="font-medium">{commander?.name ?? "this card"}</span>
              </span>
              <Link href="/explore" className="pill inline-flex min-h-9 items-center rounded-full border border-ink px-4 text-sm font-medium">
                Clear
              </Link>
            </p>
          )}
        </div>

        {error && (
          <p role="alert" className="mb-8 max-w-[560px] rounded-2xl border border-add-line bg-add-bg px-4 py-3 text-sm text-add-text">
            {error}
          </p>
        )}
        {decks === null && !error && <p className="text-muted">Loading decks.</p>}
        {decks !== null && decks.length === 0 && (
          <p className="max-w-[460px] text-lg leading-normal text-muted">
            {commanderId || query ? "No public decks match. Try clearing the search." : "Nothing here yet. Make one of your decks public from its page to be the first."}
          </p>
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
                  <p className="mt-1.5 text-sm text-muted">{deck.commanderName ?? "No commander"}</p>
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
          <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="pill mt-12 min-h-12 rounded-full border border-ink px-7 text-sm font-medium disabled:opacity-50">
            {loadingMore ? "Loading" : "Show more"}
          </button>
        )}
      </main>
    </div>
  );
}
