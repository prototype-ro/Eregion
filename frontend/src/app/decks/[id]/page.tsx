"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { DeckBuilder } from "@/components/builder/DeckBuilder";
import { Nav } from "@/components/Nav";
import { api, ApiError } from "@/lib/api";
import { loginUrl } from "@/lib/auth";
import type { DeckDetail, Timeline, VersionDetail } from "@/lib/types";

interface CollectionEntry {
  card: { id: string };
  quantity: number;
}

interface Loaded {
  deck: DeckDetail;
  version: VersionDetail | null;
  timeline: Timeline;
  owned: Map<string, number>;
}

export default function DeckPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const search = useSearchParams();
  const requested = search.get("v");

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [undoDelete, setUndoDelete] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const [deck, timeline, collection] = await Promise.all([
        api<DeckDetail>(`/api/decks/${id}`),
        api<Timeline>(`/api/decks/${id}/timeline`),
        api<CollectionEntry[]>("/api/collection"),
      ]);

      // The URL picks the version. Without one, open the most recently saved.
      const wanted = requested === null ? null : Number(requested);
      let version: VersionDetail | null = deck.latest;
      if (wanted !== null && Number.isInteger(wanted) && wanted !== deck.latest?.versionNumber) {
        version = await api<VersionDetail>(`/api/decks/${id}/versions/${wanted}`);
      }

      setLoaded({ deck, version, timeline, owned: new Map(collection.map((entry) => [entry.card.id, entry.quantity])) });
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace(loginUrl());
        return;
      }
      setError(err instanceof ApiError ? err.message : "Could not load the deck.");
    }
  }, [id, requested, router]);

  useEffect(() => {
    void load();
  }, [load]);

  const openVersion = useCallback(
    (versionNumber: number) => router.push(`/decks/${id}?v=${versionNumber}`, { scroll: false }),
    [id, router],
  );

  return (
    <div className="shell">
      <Nav active="decks" />
      <main>
      {error && (
        <div className="py-16">
          <p role="alert" className="max-w-[560px] rounded-2xl border border-danger-line bg-danger/10 px-4 py-3 text-sm text-ink">
            {error}
          </p>
          <Link href="/decks" className="mt-6 inline-block text-accent-text underline underline-offset-4">
            Back to your decks
          </Link>
        </div>
      )}
      {!error && !loaded && <p className="py-16 text-muted">Loading the deck.</p>}
      {loaded && (
        // Stays mounted as versions change, so the view, the timeline and what is on screen do not reset. The builder starts a fresh draft itself.
        <DeckBuilder
          key={loaded.deck.id}
          deck={loaded.deck}
          version={loaded.version}
          timeline={loaded.timeline}
         
          owned={loaded.owned}
          onSaved={openVersion}
          onSelectVersion={openVersion}
          onReload={() => void load()}
          undoDelete={undoDelete}
          onUndoDeleteChange={setUndoDelete}
        />
      )}
      </main>
    </div>
  );
}
