"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Nav } from "@/components/Nav";
import { api, ApiError } from "@/lib/api";
import { clearToken, getToken } from "@/lib/auth";
import type { Card, GenerateResult, Playstyle } from "@/lib/types";
import { useCardSearch } from "@/lib/useCardSearch";

const COLOR_NAMES: Record<string, string> = { W: "White", U: "Blue", B: "Black", R: "Red", G: "Green" };
const MAX_STYLES = 2;
const NOTES_KEY = "eregion-generate-notes";

const inputClass =
  "min-h-12 rounded-full border border-line bg-surface px-5 text-[15px] text-ink placeholder:text-muted focus:border-ink focus:outline-none";

function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`step-${number}`} className="grid gap-x-10 gap-y-5 border-t border-line py-10 lg:grid-cols-[minmax(220px,300px)_minmax(0,1fr)]">
      <div>
        <p className="font-mono text-sm text-muted">Step {number}</p>
        <h2 id={`step-${number}`} className="mt-1.5 text-[28px] leading-tight font-medium tracking-[-0.02em]">
          {title}
        </h2>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

export default function NewDeckPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [styles, setStyles] = useState<Playstyle[]>([]);
  const [collectionSize, setCollectionSize] = useState<number | null>(null);

  const [query, setQuery] = useState("");
  const [commander, setCommander] = useState<Card | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [ownedOnly, setOwnedOnly] = useState(false);
  const [maxPrice, setMaxPrice] = useState("");

  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stored = getToken();
    if (!stored) {
      router.replace("/login");
      return;
    }
    setToken(stored);
    Promise.all([
      api<Playstyle[]>("/api/playstyles", { token: stored }),
      api<unknown[]>("/api/collection", { token: stored }),
    ])
      .then(([list, collection]) => {
        setStyles(list);
        setCollectionSize(collection.length);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          clearToken();
          router.replace("/login");
          return;
        }
        setError(err instanceof ApiError ? err.message : "Could not load the creator.");
      });
  }, [router]);

  const { results, loading, error: searchError, searchable } = useCardSearch(commander ? "" : query, token ?? "", 6, true);

  const identity = useMemo(() => (commander ? commander.colorIdentity.split("").map((c) => COLOR_NAMES[c] ?? c) : []), [commander]);

  function toggle(id: string) {
    setPicked((current) => {
      if (current.includes(id)) return current.filter((existing) => existing !== id);
      return current.length >= MAX_STYLES ? [...current.slice(1), id] : [...current, id];
    });
  }

  const priceNumber = maxPrice.trim() === "" ? null : Number(maxPrice);
  const priceInvalid = priceNumber !== null && (!Number.isInteger(priceNumber) || priceNumber < 1 || priceNumber > 1000);

  async function build() {
    if (!commander || !token) return;
    setBuilding(true);
    setError(null);
    try {
      const result = await api<GenerateResult>("/api/decks/generate", {
        method: "POST",
        token,
        body: {
          commanderId: commander.id,
          playstyles: picked,
          ownedOnly,
          maxPriceUsd: priceNumber ?? undefined,
          name: name.trim() || undefined,
        },
      });
      try {
        sessionStorage.setItem(`${NOTES_KEY}:${result.deck.id}`, JSON.stringify(result.notes));
      } catch {
        // Notes are a courtesy: the deck is saved either way.
      }
      router.push(`/decks/${result.deck.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong while building the deck.");
      setBuilding(false);
    }
  }

  return (
    <div className="shell">
      <Nav active="decks" />

      <main className="pb-24">
        <div className="pt-14 pb-10">
          <Link href="/decks" className="text-sm text-muted">
            Back to your decks
          </Link>
          <h1 className="mt-3 font-display text-[clamp(64px,10vw,160px)] leading-[0.92]">Build a deck</h1>
          <p className="mt-5 max-w-[560px] text-lg leading-normal text-muted">
            Pick a commander and a style of play. You get a full first draft of 100 cards, tagged by what each card does, ready to edit.
          </p>
        </div>

        <Step number={1} title="Choose your commander">
          {commander ? (
            <div className="flex flex-wrap items-start gap-6">
              <div className="relative aspect-[488/680] w-[200px] overflow-hidden rounded-[14px] bg-surface">
                {commander.imageNormal && <Image src={commander.imageNormal} alt={`${commander.name} card image`} fill sizes="200px" className="object-cover" />}
              </div>
              <div className="min-w-0">
                <p className="font-display text-[44px] leading-none">{commander.name}</p>
                <p className="mt-3 font-mono text-[13px] text-muted">{commander.typeLine}</p>
                <p className="mt-4 text-[15px]">
                  {identity.length > 0 ? `Colors: ${identity.join(", ")}` : "Colorless"}
                </p>
                <button type="button" onClick={() => { setCommander(null); setQuery(""); }} className="pill mt-5 min-h-11 rounded-full border border-ink px-5 text-sm font-medium">
                  Choose another
                </button>
              </div>
            </div>
          ) : (
            <div className="relative max-w-[640px]">
              <label htmlFor="commander-search" className="mb-2 block text-sm text-muted">
                Search legendary creatures
              </label>
              <input
                id="commander-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                autoComplete="off"
                placeholder="Atraxa, Edgar Markov, Korvold"
                className={`${inputClass} min-h-14 w-full text-[17px]`}
              />
              {searchable && (
                <div className="mt-3 rounded-3xl border border-line bg-bg p-2">
                  {searchError && <p role="alert" className="px-4 py-3 text-sm text-add-text">{searchError}</p>}
                  {loading && results.length === 0 && !searchError && <p className="px-4 py-4 text-muted">Searching.</p>}
                  {!loading && !searchError && results.length === 0 && <p className="px-4 py-4 text-muted">No commander matches that name.</p>}
                  <ul>
                    {results.map((card) => (
                      <li key={card.id} className="grid grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-4 rounded-2xl px-3 py-2.5">
                        <div className="relative h-[52px] w-[72px] overflow-hidden rounded-xl bg-surface-2">
                          {card.imageArtCrop && <Image src={card.imageArtCrop} alt="" fill sizes="72px" className="object-cover grayscale" />}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-[17px] font-medium">{card.name}</p>
                          <p className="truncate font-mono text-xs text-muted">{card.typeLine}</p>
                        </div>
                        <button type="button" onClick={() => setCommander(card)} className="press min-h-11 rounded-full bg-accent px-5 text-sm font-bold text-on-accent">
                          Choose
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </Step>

        <Step number={2} title="How do you want to win?">
          <p className="mb-5 text-[15px] text-muted">Pick up to {MAX_STYLES}. With none picked you get the best cards in your colors.</p>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
            {styles.map((style) => {
              const on = picked.includes(style.id);
              return (
                <li key={style.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(style.id)}
                    className={`flex h-full min-h-[96px] w-full flex-col items-start gap-1.5 rounded-[22px] border p-5 text-left transition-colors ${
                      on ? "border-accent-text bg-add-bg" : "border-line hover:border-ink"
                    }`}
                  >
                    <span className="text-lg font-medium">{style.label}</span>
                    <span className="text-sm leading-snug text-muted">{style.description}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Step>

        <Step number={3} title="Options">
          <div className="flex max-w-[640px] flex-col gap-7">
            <div className="flex flex-col gap-2">
              <label htmlFor="deck-name" className="text-sm text-muted">
                Deck name
              </label>
              <input id="deck-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder={commander ? `${commander.name} (guided)` : "Named after your commander"} className={inputClass} />
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="max-price" className="text-sm text-muted">
                Most you want to pay for one card, in dollars (optional)
              </label>
              <input id="max-price" inputMode="numeric" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} placeholder="No limit" className={`${inputClass} w-48`} aria-invalid={priceInvalid} />
              {priceInvalid && <p className="text-sm text-add-text">Use a whole number from 1 to 1000.</p>}
            </div>

            <label className={`flex items-start gap-3.5 ${collectionSize === 0 ? "opacity-60" : ""}`}>
              <input type="checkbox" checked={ownedOnly} disabled={collectionSize === 0} onChange={(event) => setOwnedOnly(event.target.checked)} className="mt-1 h-5 w-5 accent-[var(--accent-text)]" />
              <span>
                <span className="block text-[15px]">Only use cards I own</span>
                <span className="mt-1 block text-sm text-muted">
                  {collectionSize === 0 ? (
                    <>
                      Your collection is empty.{" "}
                      <Link href="/collection" className="text-accent-text underline underline-offset-4">
                        Add the cards you own
                      </Link>{" "}
                      first.
                    </>
                  ) : (
                    "Basic lands are always free. If you own too few good cards, the draft will come out short and say so."
                  )}
                </span>
              </span>
            </label>
          </div>
        </Step>

        <div className="border-t border-line pt-10">
          {error && (
            <p role="alert" className="mb-6 max-w-[640px] rounded-2xl border border-add-line bg-add-bg px-4 py-3 text-sm text-add-text">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-5">
            <button
              type="button"
              onClick={() => void build()}
              disabled={!commander || building || priceInvalid}
              className="press min-h-14 rounded-full bg-accent px-9 text-base font-bold text-on-accent disabled:opacity-50"
            >
              {building ? "Building your deck" : "Build my deck"}
            </button>
            {building && (
              <p role="status" className="text-[15px] text-muted">
                Searching Scryfall for the best cards. This takes about ten to twenty seconds.
              </p>
            )}
            {!commander && !building && <p className="text-[15px] text-muted">Choose a commander to continue.</p>}
          </div>
        </div>
      </main>
    </div>
  );
}
