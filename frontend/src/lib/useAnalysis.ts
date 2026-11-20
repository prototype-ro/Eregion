"use client";

import { useEffect, useMemo, useState } from "react";
import { analysisKey, analysisRequest } from "./analysis";
import { api, ApiError } from "./api";
import type { DeckAnalysis, DeckCardLine } from "./types";

/** The server is asked after a pause in editing, not on every card, since combos come from another service. */
const PAUSE_MS = 1200;
const KEEP = 12;

export interface AnalysisFailure {
  status: number;
  message: string;
}

/**
 * The analysis of a deck as it is now, saved or not. Answers are kept by deck shape, so editing a deck back to an earlier shape shows
 * its analysis at once. While a newer answer is on its way the last one stays on screen, marked as updating.
 */
export function useAnalysis(lines: DeckCardLine[], enabled = true, source?: string) {
  const request = useMemo(() => analysisRequest(lines), [lines]);
  const key = useMemo(() => analysisKey(request), [request]);
  const empty = request.cards.length === 0;

  const [results, setResults] = useState<Record<string, DeckAnalysis>>({});
  const [latest, setLatest] = useState<DeckAnalysis | null>(null);
  const [failure, setFailure] = useState<(AnalysisFailure & { key: string }) | null>(null);
  const [attempt, setAttempt] = useState(0);
  const have = key in results;

  useEffect(() => {
    if (!enabled || empty || have) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      // A public deck's analysis comes ready from its own address, open to visitors who are not signed in.
      (source ? api<DeckAnalysis>(source) : api<DeckAnalysis>("/api/analysis", { method: "POST", body: request }))
        .then((data) => {
          if (cancelled) return;
          setResults((previous) => {
            const next = { ...previous, [key]: data };
            const keys = Object.keys(next);
            for (const old of keys.slice(0, Math.max(0, keys.length - KEEP))) delete next[old];
            return next;
          });
          setLatest(data);
          setFailure(null);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          const status = err instanceof ApiError ? err.status : 0;
          setFailure({ key, status, message: err instanceof ApiError ? err.message : "Could not analyse this deck." });
        });
    }, PAUSE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled, empty, have, key, request, attempt, source]);

  const current = results[key] ?? null;
  const failed = failure && failure.key === key ? failure : null;
  return {
    analysis: current ?? latest,
    /** True while the shown analysis is of an earlier shape of the deck, or none has arrived yet. */
    updating: enabled && !empty && !current && !failed,
    failure: failed,
    empty,
    retry: () => {
      setFailure(null);
      setAttempt((value) => value + 1);
    },
  };
}
