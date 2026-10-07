"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DiffView } from "@/components/DiffView";
import { Nav } from "@/components/Nav";
import { api, ApiError } from "@/lib/api";
import { clearToken, getToken } from "@/lib/auth";
import type { DeckDetail, DeckDiff, VersionSummary } from "@/lib/types";

const select =
  "min-h-11 rounded-full border border-line bg-surface px-4 text-[15px] text-ink focus:border-ink focus:outline-none";

export default function DiffPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [deckName, setDeckName] = useState<string>("");
  const [versions, setVersions] = useState<VersionSummary[] | null>(null);
  const [from, setFrom] = useState<number | null>(null);
  const [to, setTo] = useState<number | null>(null);
  const [diff, setDiff] = useState<DeckDiff | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load the version list once and default to "previous to latest".
  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    (async () => {
      try {
        const [deck, list] = await Promise.all([
          api<DeckDetail>(`/api/decks/${id}`, { token }),
          api<VersionSummary[]>(`/api/decks/${id}/versions`, { token }),
        ]);
        setDeckName(deck.name);
        setVersions(list);
        if (list.length >= 2) {
          // Compare the newest version with the one it was made from, which on a branch
          // is not necessarily the previous number.
          const newest = list[0];
          setTo(newest.versionNumber);
          setFrom(newest.parentVersion ?? list[1].versionNumber);
        }
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          clearToken();
          router.replace("/login");
          return;
        }
        setError(err instanceof ApiError ? err.message : "Could not load the history.");
      }
    })();
  }, [id, router]);

  // Recompute the diff whenever the picked versions change.
  useEffect(() => {
    const token = getToken();
    if (from === null || to === null || !token) return;
    let cancelled = false;
    api<DeckDiff>(`/api/decks/${id}/diff?from=${from}&to=${to}`, { token })
      .then((result) => {
        if (!cancelled) {
          setDiff(result);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Could not compute the diff.");
      });
    return () => {
      cancelled = true;
    };
  }, [id, from, to]);

  return (
    <div className="shell">
      <Nav active="decks" />

      <main className="pb-24">
        <div className="flex flex-wrap items-end justify-between gap-6 pt-10 pb-10">
          <div>
            <Link href={`/decks/${id}`} className="text-sm text-muted">
              Back to {deckName || "the deck"}
            </Link>
            <h1 className="mt-3 font-display text-[clamp(56px,9vw,128px)] leading-[0.92]">
              {from !== null && to !== null ? `v${from} to v${to}` : "History"}
            </h1>
          </div>

          {versions && versions.length >= 2 && (
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="from" className="text-sm text-muted">
                  From
                </label>
                <select id="from" className={select} value={from ?? ""} onChange={(event) => setFrom(Number(event.target.value))}>
                  {versions.map((version) => (
                    <option key={version.versionNumber} value={version.versionNumber}>
                      v{version.versionNumber}
                      {version.note ? `, ${version.note}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="to" className="text-sm text-muted">
                  To
                </label>
                <select id="to" className={select} value={to ?? ""} onChange={(event) => setTo(Number(event.target.value))}>
                  {versions.map((version) => (
                    <option key={version.versionNumber} value={version.versionNumber}>
                      v{version.versionNumber}
                      {version.note ? `, ${version.note}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        {error && (
          <p role="alert" className="mb-8 max-w-[560px] rounded-2xl border border-add-line bg-add-bg px-4 py-3 text-sm text-add-text">
            {error}
          </p>
        )}

        {versions === null && !error && <p className="text-muted">Loading the history.</p>}

        {versions !== null && versions.length < 2 && (
          <p className="max-w-[460px] text-lg leading-normal text-muted">
            {versions.length === 0
              ? "This deck has no saved versions yet."
              : "There is only one version so far. Save another version to see what changed."}
          </p>
        )}

        {diff && from !== null && to !== null && <DiffView diff={diff} />}
      </main>
    </div>
  );
}
