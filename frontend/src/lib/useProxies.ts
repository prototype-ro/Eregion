"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import type { DeckLore, ProxyGeneration, ProxyMode, ProxyTreatment } from "./types";

/** The proxy treatments and lore of one deck, with the calls that change them. */
export function useProxies(deckId: string) {
  const [treatments, setTreatments] = useState<ProxyTreatment[]>([]);
  const [lore, setLore] = useState<DeckLore>({ lore: null, mjParams: null });
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    const [list, text] = await Promise.all([
      api<ProxyTreatment[]>(`/api/decks/${deckId}/proxies`),
      api<DeckLore>(`/api/decks/${deckId}/lore`),
    ]);
    setTreatments(list);
    setLore(text);
    setLoaded(true);
  }, [deckId]);

  useEffect(() => {
    reload().catch(() => setLoaded(true));
  }, [reload]);

  const put = useCallback((next: ProxyTreatment) => {
    setTreatments((previous) => (previous.some((t) => t.cardId === next.cardId) ? previous.map((t) => (t.cardId === next.cardId ? next : t)) : [...previous, next]));
  }, []);

  const generate = useCallback(
    async (cardId: string, mode: ProxyMode, instruction?: string) => {
      const next = await api<ProxyTreatment>(`/api/decks/${deckId}/proxies/${cardId}/generate`, { method: "POST", body: { mode, instruction: instruction || null } });
      put(next);
      return next;
    },
    [deckId, put],
  );

  const history = useCallback((cardId: string) => api<ProxyGeneration[]>(`/api/decks/${deckId}/proxies/${cardId}/history`), [deckId]);

  const choose = useCallback(
    async (cardId: string, generationId: string) => {
      const next = await api<ProxyTreatment>(`/api/decks/${deckId}/proxies/${cardId}/current`, { method: "PUT", body: { generationId } });
      put(next);
      return next;
    },
    [deckId, put],
  );

  const saveLore = useCallback(
    async (text: string, mjParams: string) => {
      const saved = await api<DeckLore>(`/api/decks/${deckId}/lore`, { method: "PUT", body: { lore: text, mjParams } });
      setLore(saved);
    },
    [deckId],
  );

  return { treatments, lore, loaded, generate, history, choose, saveLore };
}
