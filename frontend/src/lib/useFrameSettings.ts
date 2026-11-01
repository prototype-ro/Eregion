"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import type { FrameSettings } from "./types";

const DEFAULT_FRAME_FAMILY = "m15";

const empty = (deckId: string): FrameSettings => ({ deckId, artistName: null, collectionCode: null, frameFamily: DEFAULT_FRAME_FAMILY });

/** The frame compositing settings (artist, collection code, frame family) of one deck. */
export function useFrameSettings(deckId: string) {
  const [settings, setSettings] = useState<FrameSettings>(() => empty(deckId));
  /** True when the last load succeeded. Until then the fields may be stale or empty, so callers should not act on them. */
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const next = await api<FrameSettings>(`/api/decks/${deckId}/frame-settings`);
      setSettings(next ?? empty(deckId));
      setLoaded(true);
      setLoadError(null);
    } catch (err) {
      setLoaded(false);
      setLoadError(err instanceof Error && err.message ? err.message : "Could not load the frame settings.");
    }
  }, [deckId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const save = useCallback(
    async (next: Pick<FrameSettings, "artistName" | "collectionCode" | "frameFamily">) => {
      const saved = await api<FrameSettings>(`/api/decks/${deckId}/frame-settings`, { method: "PUT", body: next });
      const value = saved ?? { ...next, deckId };
      setSettings(value);
      return value;
    },
    [deckId],
  );

  return { settings, loaded, loadError, retry: reload, save };
}
