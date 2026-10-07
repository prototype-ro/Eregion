"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { DeckBuilder } from "@/components/builder/DeckBuilder";
import { Nav } from "@/components/Nav";
import { api, ApiError } from "@/lib/api";
import { clearToken, getToken } from "@/lib/auth";
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

  const [token, setToken] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[] | null>(null);

  const load = useCallback(async () => {
    const stored = getToken();
    if (!stored) {
      router.replace("/login");
      return;
    }
    setToken(stored);
    try {
      const [deck, timeline, collection] = await Promise.all([
        api<DeckDetail>(`/api/decks/${id}`, { token: stored }),
        api<Timeline>(`/api/decks/${id}/timeline`, { token: stored }),
        api<CollectionEntry[]>("/api/collection", { token: stored }),
      ]);

      // The URL picks the version. Without one, open the most recently saved.
      const wanted = requested === null ? null : Number(requested);
      let version: VersionDetail | null = deck.latest;
      if (wanted !== null && Number.isInteger(wanted) && wanted !== deck.latest?.versionNumber) {
        version = await api<VersionDetail>(`/api/decks/${id}/versions/${wanted}`, { token: stored });
      }

      setLoaded({ deck, version, timeline, owned: new Map(collection.map((entry) => [entry.card.id, entry.quantity])) });
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearToken();
        router.replace("/login");
        return;
      }
      setError(err instanceof ApiError ? err.message : "Could not load the deck.");
    }
  }, [id, requested, router]);

  useEffect(() => {
    void load();
  }, [load]);

  // A deck just made by the guided creator comes with notes about what it could not fill.
  useEffect(() => {
    try {
      const key = `eregion-generate-notes:${id}`;
      const stored = sessionStorage.getItem(key);
      if (stored) {
        setNotes(JSON.parse(stored) as string[]);
        sessionStorage.removeItem(key);
      }
    } catch {
      // No notes to show.
    }
  }, [id]);

  const openVersion = useCallback(
    (versionNumber: number) => router.push(`/decks/${id}?v=${versionNumber}`, { scroll: false }),
    [id, router],
  );

  return (
    <div className="shell">
      <Nav active="decks" />
      {error && (
        <div className="py-16">
          <p role="alert" className="max-w-[560px] rounded-2xl border border-add-line bg-add-bg px-4 py-3 text-sm text-add-text">
            {error}
          </p>
          <Link href="/decks" className="mt-6 inline-block text-accent-text underline underline-offset-4">
            Back to your decks
          </Link>
        </div>
      )}
      {notes !== null && (
        <div role="status" className="mt-8 rounded-2xl border border-line bg-surface px-5 py-4 text-[15px]">
          <p className="font-medium">Your first draft is ready.</p>
          <p className="mt-1 text-muted">
            Cards are tagged by what they do. Use Group by, then Custom tag, to see them that way, then change anything and save a new version.
          </p>
          {notes.length > 0 && (
            <ul className="mt-3 list-disc pl-5 text-muted">
              {notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          )}
          <button type="button" onClick={() => setNotes(null)} className="pill mt-4 min-h-11 rounded-full border border-ink px-5 text-sm font-medium">
            Dismiss
          </button>
        </div>
      )}
      {!error && !loaded && <p className="py-16 text-muted">Loading the deck.</p>}
      {loaded && token && (
        // Remounting per version resets the draft to that version's snapshot.
        <DeckBuilder
          key={loaded.version?.versionNumber ?? 0}
          deck={loaded.deck}
          version={loaded.version}
          timeline={loaded.timeline}
          token={token}
          owned={loaded.owned}
          onSaved={openVersion}
          onSelectVersion={openVersion}
        />
      )}
    </div>
  );
}
