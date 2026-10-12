"use client";

import { useCallback, useRef, useState } from "react";
import { api, ApiError } from "./api";
import type { Card } from "./types";

export interface AdvancedOptions {
  /** Scryfall syntax, as built from the form or edited by hand. */
  q: string;
  legal: boolean;
  role: string;
  order: string;
  dir: "asc" | "desc";
}

interface Page {
  cards: Card[];
  total: number;
  hasMore: boolean;
  query: string;
}

/**
 * Advanced search over all of Scryfall. A new search replaces the results, and "more" adds the next page. An answer to a search that
 * has since been replaced by a newer one is ignored.
 */
export function useAdvancedSearch() {
  const [cards, setCards] = useState<Card[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const latest = useRef(0);
  const last = useRef<{ options: AdvancedOptions; page: number } | null>(null);

  const fetchPage = useCallback(async (options: AdvancedOptions, page: number): Promise<Page> => {
    const params = new URLSearchParams({ q: options.q, legal: String(options.legal), order: options.order, dir: options.dir, page: String(page) });
    if (options.role) params.set("role", options.role);
    return api<Page>(`/api/cards/advanced?${params}`);
  }, []);

  const run = useCallback(
    async (options: AdvancedOptions, page: number) => {
      const id = ++latest.current;
      setLoading(true);
      setError(null);
      try {
        const found = await fetchPage(options, page);
        if (id !== latest.current) return;
        last.current = { options, page };
        setCards((previous) => {
          if (page === 1) return found.cards;
          const seen = new Set(previous.map((card) => card.id));
          return [...previous, ...found.cards.filter((card) => !seen.has(card.id))];
        });
        setTotal(found.total);
        setHasMore(found.hasMore);
        setQuery(found.query);
        setSearched(true);
      } catch (err) {
        if (id !== latest.current) return;
        setError(err instanceof ApiError ? err.message : "Search failed.");
        if (page === 1) setCards([]);
      } finally {
        if (id === latest.current) setLoading(false);
      }
    },
    [fetchPage],
  );

  return {
    cards,
    total,
    hasMore,
    query,
    loading,
    error,
    searched,
    search: (options: AdvancedOptions) => run(options, 1),
    more: () => {
      if (last.current && hasMore && !loading) void run(last.current.options, last.current.page + 1);
    },
  };
}
