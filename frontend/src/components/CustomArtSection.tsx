"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { customArtUrl } from "@/lib/links";
import type { CustomPrinting } from "@/lib/types";

export const MAX_ART_BYTES = 10 * 1024 * 1024;
export const ART_TYPES = ["image/png", "image/jpeg", "image/webp"];

/** Why a file cannot be used as card art, or null when it can. Checked here to save an upload, and again by the server. */
export function artProblem(file: File): string | null {
  if (!ART_TYPES.includes(file.type)) return `${file.name} is not a PNG, JPEG or WebP image.`;
  if (file.size > MAX_ART_BYTES) return `${file.name} is over 10 MB.`;
  return null;
}

/** Uploads one image as custom art for a card. */
export async function uploadArt(cardId: string, file: File, label: string): Promise<CustomPrinting> {
  const form = new FormData();
  form.append("file", file);
  form.append("label", label);
  return api<CustomPrinting>(`/api/cards/${cardId}/custom-printings`, { method: "POST", body: form });
}

interface Props {
  cardId: string;
  /** The art pinned on the deck line being edited, if any. */
  currentId?: string | null;
  /** When given, each art can be picked. Without it the section only manages the art. */
  onChoose?: (art: CustomPrinting) => void;
  /** Called after art is added or deleted. */
  onChanged?: () => void;
}

/** The player's own art for one card: see it, add more, delete it, and optionally pick it. */
export function CustomArtSection({ cardId, currentId = null, onChoose, onChanged }: Props) {
  const [arts, setArts] = useState<CustomPrinting[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setArts(await api<CustomPrinting[]>(`/api/cards/${cardId}/custom-printings`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load your custom art.");
    }
  }, [cardId]);

  useEffect(() => {
    setArts(null);
    setError(null);
    void load();
  }, [load]);

  async function add(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const problem = artProblem(file);
        if (problem) {
          setError(problem);
          continue;
        }
        const label = file.name.replace(/\.[^.]+$/, "").slice(0, 60);
        await uploadArt(cardId, file, label);
      }
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not upload that image.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove(art: CustomPrinting) {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/custom-printings/${art.id}`, { method: "DELETE" });
      setDeleting(null);
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete that art.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby={`custom-${cardId}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 id={`custom-${cardId}`} className="text-[22px] font-medium tracking-[-0.02em]">
          Custom
        </h3>
        <p className="text-sm text-muted">{arts ? `${arts.length} ${arts.length === 1 ? "art" : "arts"}, only you can use them` : "Loading"}</p>
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-2xl border border-add-line bg-add-bg px-4 py-3 text-sm text-add-text">
          {error}
        </p>
      )}

      <ul className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-5 gap-y-7">
        {arts?.map((art) => {
          const current = art.id === currentId;
          const picture = (
            <div className="relative aspect-[488/680] overflow-hidden rounded-[10px] bg-surface">
              <Image src={customArtUrl(art.id)} alt={`${art.label}, custom art`} fill sizes="170px" className="object-cover" />
            </div>
          );
          return (
            <li key={art.id}>
              {onChoose ? (
                <button
                  type="button"
                  onClick={() => onChoose(art)}
                  aria-pressed={current}
                  className={`block w-full rounded-[12px] text-left ${current ? "outline-2 outline-offset-4 outline-accent-text" : ""}`}
                >
                  {picture}
                  <span className="mt-2.5 block truncate text-sm font-medium">{art.label}</span>
                  <span className="mt-1 block text-sm">{current ? <span className="text-accent-text">Current</span> : <span className="text-muted">Custom</span>}</span>
                </button>
              ) : (
                <div>
                  {picture}
                  <p className="mt-2.5 truncate text-sm font-medium">{art.label}</p>
                </div>
              )}
              {deleting === art.id ? (
                <div className="mt-2 flex flex-col gap-2 text-xs text-add-text">
                  <p>
                    {art.usedIn > 0
                      ? `Used in ${art.usedIn} saved ${art.usedIn === 1 ? "version" : "versions"}. They will show the regular art instead.`
                      : "Delete this art for good?"}
                  </p>
                  <div className="flex gap-2">
                    <button type="button" disabled={busy} onClick={() => void remove(art)} className="min-h-9 rounded-full bg-add-text px-4 text-xs font-bold text-bg disabled:opacity-50">
                      Delete
                    </button>
                    <button type="button" onClick={() => setDeleting(null)} className="pill min-h-9 rounded-full border border-ink px-4 text-xs font-medium text-ink">
                      Keep
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setDeleting(art.id)} aria-label={`Delete ${art.label}`} className="mt-1 min-h-9 text-xs text-muted underline underline-offset-4 hover:text-add-text">
                  Delete
                </button>
              )}
            </li>
          );
        })}
        <li>
          <label
            className={`flex aspect-[488/680] cursor-pointer flex-col items-center justify-center gap-2 rounded-[10px] border border-dashed border-line p-3 text-center text-sm text-muted hover:border-ink hover:text-ink focus-within:border-ink ${busy ? "opacity-50" : ""}`}
          >
            <span className="text-2xl leading-none" aria-hidden="true">
              +
            </span>
            <span>{busy ? "Uploading" : "Add art"}</span>
            <span className="text-xs">PNG, JPEG or WebP, up to 10 MB</span>
            <input ref={input} type="file" accept={ART_TYPES.join(",")} multiple disabled={busy} onChange={(event) => void add(event.target.files)} className="sr-only" aria-label="Add custom art" />
          </label>
        </li>
      </ul>
    </section>
  );
}
