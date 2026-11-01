"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { btn, field } from "@/lib/ui";
import { useFrameSettings } from "@/lib/useFrameSettings";
import type { FrameSettings } from "@/lib/types";

interface Props {
  deckId: string;
}

const LABEL = "text-sm text-muted";

const FRAME_FAMILIES: Array<[string, string]> = [
  ["m15", "Modern (M15)"],
  ["classic", "Classic"],
];

type Draft = Pick<FrameSettings, "artistName" | "collectionCode" | "frameFamily">;

const toDraft = (settings: FrameSettings): Draft => ({
  artistName: settings.artistName ?? "",
  collectionCode: settings.collectionCode ?? "",
  frameFamily: settings.frameFamily,
});

/** The artist name, collection code and frame family used when compositing this deck's proxies. */
export function FramePanel({ deckId }: Props) {
  const frame = useFrameSettings(deckId);
  const [draft, setDraft] = useState<Draft>(() => toDraft(frame.settings));
  const touched = useRef(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (frame.loaded && !touched.current) setDraft(toDraft(frame.settings));
  }, [frame.loaded, frame.settings]);

  const update = (fn: (d: Draft) => Draft) => {
    touched.current = true;
    setMessage(null);
    setDraft(fn);
  };

  const saved = toDraft(frame.settings);
  const dirty = frame.loaded && (draft.artistName !== saved.artistName || draft.collectionCode !== saved.collectionCode || draft.frameFamily !== saved.frameFamily);

  async function save() {
    setSaving(true);
    try {
      await frame.save({
        artistName: draft.artistName?.trim() || null,
        collectionCode: draft.collectionCode?.trim() || null,
        frameFamily: draft.frameFamily,
      });
      touched.current = false;
      setMessage("Saved");
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not save the frame settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-label="Frame" className="mt-16 flex flex-col gap-8">
      <h2 className="font-display text-[44px] leading-none">Frame</h2>

      {frame.loadError && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border border-danger-line bg-danger/10 px-4 py-3 text-sm text-ink">
          <span className="min-w-0 flex-1">{frame.loadError}</span>
          <button type="button" className={btn.secondary} onClick={() => void frame.retry()}>
            Retry
          </button>
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-card border border-line bg-surface/60 p-5">
        <div>
          <h3 className="font-display text-xl">Frame settings</h3>
          <p className={LABEL}>Used when compositing this deck&apos;s proxies: the artist credit, the collection code, and the frame style.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className={LABEL}>Artist name</span>
            <input
              className={field.md}
              value={draft.artistName ?? ""}
              placeholder="Credited on the card, optional"
              onChange={(e) => update((d) => ({ ...d, artistName: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={LABEL}>Collection code</span>
            <input
              className={field.md}
              value={draft.collectionCode ?? ""}
              placeholder="e.g. ERG, optional"
              onChange={(e) => update((d) => ({ ...d, collectionCode: e.target.value }))}
            />
          </label>
        </div>
        <label className="flex flex-col gap-1.5 sm:max-w-xs">
          <span className={LABEL}>Frame family</span>
          <select className={field.md} value={draft.frameFamily} onChange={(e) => update((d) => ({ ...d, frameFamily: e.target.value }))}>
            {FRAME_FAMILIES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex items-center gap-2.5">
        <button type="button" className={btn.primary} disabled={!frame.loaded || !dirty || saving} onClick={() => void save()} title="Re-renders the whole deck's proxies">
          {saving ? "Saving…" : "Save frame settings"}
        </button>
        {message && !dirty && <span className="text-sm text-muted">{message}</span>}
      </div>
    </section>
  );
}
