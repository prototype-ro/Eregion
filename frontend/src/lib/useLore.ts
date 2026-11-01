"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { emptyLoreDoc } from "./lore";
import type { LoreDoc, LoreTurnMessage, LoreTurnReply, LoreVerdict } from "./types";

/** The structured lore of one deck, with the calls that load, save, draft and check it. */
export function useLore(deckId: string) {
  const [doc, setDoc] = useState<LoreDoc>(emptyLoreDoc());
  /** True when the last load succeeded. Until then the editor may be empty, so callers should not act on it. */
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const next = await api<LoreDoc>(`/api/decks/${deckId}/lore-doc`);
      setDoc(next ?? emptyLoreDoc());
      setLoaded(true);
      setLoadError(null);
    } catch (err) {
      setLoaded(false);
      setLoadError(err instanceof Error && err.message ? err.message : "Could not load the lore.");
    }
  }, [deckId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const save = useCallback(
    async (next: LoreDoc) => {
      const saved = await api<LoreDoc>(`/api/decks/${deckId}/lore-doc`, { method: "PUT", body: next });
      const value = saved ?? next;
      setDoc(value);
      return value;
    },
    [deckId],
  );

  const draft = useCallback((instruction: string) => api<LoreDoc>(`/api/decks/${deckId}/lore-doc/draft`, { method: "POST", body: { instruction } }), [deckId]);

  const refine = useCallback(
    (doc: LoreDoc, target: string, instruction: string) =>
      api<LoreDoc>(`/api/decks/${deckId}/lore-doc/refine`, { method: "POST", body: { doc, target, instruction } }),
    [deckId],
  );

  const check = useCallback((cardId: string) => api<LoreVerdict>(`/api/decks/${deckId}/lore-doc/check`, { method: "POST", body: { cardId } }), [deckId]);

  const turn = useCallback(
    (doc: LoreDoc, history: LoreTurnMessage[], message: string) =>
      api<LoreTurnReply>(`/api/decks/${deckId}/lore-doc/turn`, { method: "POST", body: { doc, history, message } }),
    [deckId],
  );

  return { doc, loaded, loadError, retry: reload, save, draft, refine, check, turn };
}
