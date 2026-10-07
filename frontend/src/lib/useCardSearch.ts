"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "./api";
import type { Card } from "./types";

/**
 * Card search as you type. The backend looks in our catalog and falls back to Scryfall for names
 * it does not know yet. The request waits for a short pause in typing, and a newer query cancels
 * the answer to an older one.
 */
export function useCardSearch(query: string, limit = 8) {
  const [results, setResults] = useState<Card[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = query.trim();
  const searchable = trimmed.length >= 2;

  useEffect(() => {
    if (!searchable) {
      setResults([]);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const found = await api<Card[]>(`/api/cards/search?q=${encodeURIComponent(trimmed)}&limit=${limit}`);
        if (!cancelled) {
          setResults(found);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Search failed.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmed, searchable, limit]);

  return { results, loading, error, searchable };
}
