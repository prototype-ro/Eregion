"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { DiffView } from "@/components/DiffView";
import { Nav } from "@/components/Nav";
import { api, ApiError } from "@/lib/api";
import { loginUrl } from "@/lib/auth";
import type { DeckDetail, DeckDiff, Timeline, VersionSummary } from "@/lib/types";
import { field } from "@/lib/ui";

const select = field.md;

export default function DiffPage() {
  // useSearchParams needs a Suspense boundary in the App Router.
  return (
    <Suspense fallback={<p className="py-16 text-muted">Loading the history.</p>}>
      <Diff />
    </Suspense>
  );
}

function Diff() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const params = useSearchParams();
  const wantedFrom = Number(params.get("from"));
  const wantedTo = Number(params.get("to"));
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [deckName, setDeckName] = useState<string>("");
  const [versions, setVersions] = useState<VersionSummary[] | null>(null);
  const [from, setFrom] = useState<number | null>(null);
  const [to, setTo] = useState<number | null>(null);
  const [diff, setDiff] = useState<DeckDiff | null>(null);
  const [error, setError] = useState<string | null>(null);

  const branchOf = (versionNumber: number) =>
    timeline?.branches.find((branch) => branch.versions.some((version) => version.versionNumber === versionNumber))?.name;
  const label = (version: VersionSummary) =>
    `v${version.versionNumber}${timeline && timeline.branches.length > 1 ? ` on ${branchOf(version.versionNumber) ?? "?"}` : ""}${version.note ? `, ${version.note}` : ""}`;

  /** Compares the newest version of one branch with the newest of another. */
  const compareHeads = (side: "from" | "to", branchId: string) => {
    const tip = timeline?.branches.find((branch) => branch.id === branchId)?.versions.at(-1);
    if (!tip) return;
    if (side === "from") setFrom(tip.versionNumber);
    else setTo(tip.versionNumber);
  };
  const branchIdOf = (versionNumber: number | null) =>
    versionNumber === null ? "" : (timeline?.branches.find((branch) => branch.versions.some((version) => version.versionNumber === versionNumber))?.id ?? "");

  // Load the version list once and default to "previous to latest".
  useEffect(() => {
    (async () => {
      try {
        const [deck, list, tl] = await Promise.all([
          api<DeckDetail>(`/api/decks/${id}`),
          api<VersionSummary[]>(`/api/decks/${id}/versions`),
          api<Timeline>(`/api/decks/${id}/timeline`),
        ]);
        setDeckName(deck.name);
        setVersions(list);
        setTimeline(tl);
        const exists = (n: number) => list.some((version) => version.versionNumber === n);
        if (exists(wantedFrom) && exists(wantedTo)) {
          // A link from the branches list names the two versions to compare.
          setFrom(wantedFrom);
          setTo(wantedTo);
        } else if (list.length >= 2) {
          // Compare the newest version with the one it was made from, which on a branch
          // is not necessarily the previous number.
          const newest = list[0];
          setTo(newest.versionNumber);
          setFrom(newest.parentVersion ?? list[1].versionNumber);
        }
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          router.replace(loginUrl());
          return;
        }
        setError(err instanceof ApiError ? err.message : "Could not load the history.");
      }
    })();
  }, [id, router, wantedFrom, wantedTo]);

  // Recompute the diff whenever the picked versions change.
  useEffect(() => {
    if (from === null || to === null) return;
    let cancelled = false;
    api<DeckDiff>(`/api/decks/${id}/diff?from=${from}&to=${to}`)
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
                      {label(version)}
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
                      {label(version)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        {timeline && timeline.branches.length > 1 && versions && versions.length >= 2 && (
          <div className="mb-10 flex flex-wrap items-end gap-3 border-y border-line py-5">
            <p className="w-full text-sm text-muted">Or compare the newest versions of two branches</p>
            {(["from", "to"] as const).map((side) => (
              <div key={side} className="flex flex-col gap-1.5">
                <label htmlFor={`branch-${side}`} className="text-sm text-muted">
                  {side === "from" ? "Branch to start from" : "Branch to compare against"}
                </label>
                <select id={`branch-${side}`} className={select} value={branchIdOf(side === "from" ? from : to)} onChange={(event) => compareHeads(side, event.target.value)}>
                  {timeline.branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}

        {error && (
          <p role="alert" className="mb-8 max-w-[560px] rounded-2xl border border-danger-line bg-danger/10 px-4 py-3 text-sm text-ink">
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
