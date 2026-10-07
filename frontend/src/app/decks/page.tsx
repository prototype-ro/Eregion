"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CardArt } from "@/components/CardArt";
import { Nav } from "@/components/Nav";
import { api, ApiError } from "@/lib/api";
import type { DeckDetail, DeckSummary } from "@/lib/types";

export default function DecksPage() {
  const router = useRouter();
  const [decks, setDecks] = useState<DeckSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      setDecks(await api<DeckSummary[]>("/api/decks"));
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace("/login");
        return;
      }
      setError(err instanceof ApiError ? err.message : "Could not load your decks.");
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createDeck(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setCreating(true);
    try {
      await api<DeckDetail>("/api/decks", { method: "POST", body: { name: trimmed } });
      setName("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the deck.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="shell">
      <Nav active="decks" />

      <main className="pb-24">
        <h1 className="pt-16 pb-8 font-display text-[clamp(72px,13vw,200px)] leading-[0.9]">Your decks</h1>

        <form onSubmit={createDeck} className="mb-10 flex max-w-[560px] flex-col gap-2 border-t border-line pt-6">
          <label htmlFor="deckName" className="text-sm text-muted">
            New deck name
          </label>
          <div className="flex gap-2.5">
            <input
              id="deckName"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              className="min-h-12 flex-1 rounded-full border border-line bg-surface px-5 text-base text-ink focus:border-ink focus:outline-none"
            />
            <button
              type="submit"
              disabled={creating || name.trim() === ""}
              className="press min-h-12 rounded-full bg-accent px-6 text-sm font-bold text-on-accent disabled:opacity-50"
            >
              Create
            </button>
          </div>
        </form>

        {error && (
          <p role="alert" className="mb-8 max-w-[560px] rounded-2xl border border-add-line bg-add-bg px-4 py-3 text-sm text-add-text">
            {error}
          </p>
        )}

        {decks === null && !error && <p className="text-muted">Loading your decks.</p>}

        {decks !== null && decks.length === 0 && (
          <p className="max-w-[420px] text-lg leading-normal text-muted">
            No decks yet. Name one above, then add cards and save your first version.
          </p>
        )}

        {decks !== null && decks.length > 0 && (
          <ul className="grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-6">
            {decks.map((deck, index) => (
              <li key={deck.id} className={`group relative ${index === 0 ? "sm:col-span-2" : ""}`}>
                {deck.artUrl ? (
                  <CardArt
                    src={deck.artUrl}
                    alt={`${deck.commanderName ?? deck.name} card art`}
                    sizes="(min-width: 1024px) 25vw, 50vw"
                    className={`rounded-card ${index === 0 ? "aspect-[16/10]" : "aspect-[4/5]"}`}
                  />
                ) : (
                  <div
                    className={`rounded-card border border-line bg-surface ${index === 0 ? "aspect-[16/10]" : "aspect-[4/5]"}`}
                    aria-hidden="true"
                  />
                )}
                <div className="flex justify-between gap-4 px-1 pt-4">
                  <div>
                    <h2 className={`font-medium tracking-[-0.02em] ${index === 0 ? "text-[26px]" : "text-xl"}`}>
                      {/* The after pseudo-element stretches the link over the whole tile. */}
                      <Link href={`/decks/${deck.id}`} className="after:absolute after:inset-0">
                        {deck.name}
                      </Link>
                    </h2>
                    <p className="mt-1.5 text-sm text-muted">
                      {deck.commanderName ?? "No commander yet"}, {deck.cardCount} cards
                      {deck.visibility === "public" && <span className="ml-2 rounded-full border border-accent-text px-2 py-0.5 text-xs text-accent-text">Public</span>}
                    </p>
                  </div>
                  <p className="text-right font-mono text-[13px] whitespace-nowrap text-muted">
                    {deck.latestVersion > 0 ? `v${deck.latestVersion}` : "Draft"}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
