"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import type { DeckLore, ProxyChatTurn, ProxyGeneration, ProxyMode, ProxyTreatment } from "./types";

/** The proxy treatments and lore of one deck, with the calls that change them. */
export function useProxies(deckId: string) {
  const [treatments, setTreatments] = useState<ProxyTreatment[]>([]);
  const [lore, setLore] = useState<DeckLore>({ lore: null, mjParams: null });
  /** True when the last load succeeded. Until then the lists may be stale or empty, so callers should not act on them. */
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [list, text] = await Promise.all([
        api<ProxyTreatment[]>(`/api/decks/${deckId}/proxies`),
        api<DeckLore>(`/api/decks/${deckId}/lore`),
      ]);
      setTreatments(list);
      setLore(text);
      setLoaded(true);
      setLoadError(null);
    } catch (err) {
      setLoaded(false);
      setLoadError(err instanceof Error && err.message ? err.message : "Could not load the proxies.");
    }
  }, [deckId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const put = useCallback((next: ProxyTreatment) => {
    setTreatments((previous) => (previous.some((t) => t.cardId === next.cardId) ? previous.map((t) => (t.cardId === next.cardId ? next : t)) : [...previous, next]));
  }, []);

  const generate = useCallback(
    async (
      cardId: string,
      mode: ProxyMode,
      instruction?: string,
      ignoreType?: boolean,
      ignoreRulesText?: boolean,
      loreOnly?: boolean,
      tier?: string,
      ignoreLore?: boolean,
    ) => {
      const next = await api<ProxyTreatment>(`/api/decks/${deckId}/proxies/${cardId}/generate`, {
        method: "POST",
        body: {
          mode,
          instruction: instruction || null,
          ignoreType: ignoreType ?? false,
          ignoreRulesText: ignoreRulesText ?? false,
          loreOnly: loreOnly ?? false,
          tier: tier || null,
          ignoreLore: ignoreLore ?? false,
        },
      });
      put(next);
      return next;
    },
    [deckId, put],
  );

  const history = useCallback((cardId: string) => api<ProxyGeneration[]>(`/api/decks/${deckId}/proxies/${cardId}/history`), [deckId]);

  /** A non-committing, free-form reply: discuss a direction before spending a generation on it. */
  const chat = useCallback(
    async (
      cardId: string,
      mode: ProxyMode,
      ignoreType: boolean,
      ignoreRulesText: boolean,
      messages: ProxyChatTurn[],
      loreOnly?: boolean,
      ignoreLore?: boolean,
    ) => {
      const { reply } = await api<{ reply: string }>(`/api/decks/${deckId}/proxies/${cardId}/chat`, {
        method: "POST",
        body: { mode, ignoreType, ignoreRulesText, loreOnly: loreOnly ?? false, messages, ignoreLore: ignoreLore ?? false },
      });
      return reply;
    },
    [deckId],
  );

  const choose = useCallback(
    async (cardId: string, generationId: string) => {
      const next = await api<ProxyTreatment>(`/api/decks/${deckId}/proxies/${cardId}/current`, { method: "PUT", body: { generationId } });
      put(next);
      return next;
    },
    [deckId, put],
  );

  const saveParams = useCallback(
    async (mjParams: string) => {
      const saved = await api<DeckLore>(`/api/decks/${deckId}/mj-params`, { method: "PUT", body: { mjParams } });
      setLore(saved);
    },
    [deckId],
  );

  return { treatments, lore, loaded, loadError, retry: reload, generate, history, chat, choose, saveParams };
}
