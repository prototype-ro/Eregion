"use client";

import { useRef, useState } from "react";
import { Dialog } from "@/components/Dialog";
import { artProblem, ART_TYPES, uploadArt } from "@/components/CustomArtSection";
import { api, ApiError } from "@/lib/api";
import type { Card } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Ids of the cards already in the collection. */
  owned: Set<string>;
  /** Called after art was imported, so the page can reload. */
  onDone: () => void;
}

interface Summary {
  imported: number;
  added: number;
  problems: string[];
}

interface Parsed {
  file: File;
  name: string;
  label: string;
}

/** "Sol Ring - foil proxy.png" is the card "Sol Ring" with the label "foil proxy". */
export function parseArtName(fileName: string): { name: string; label: string } {
  const stem = fileName.replace(/\.[^.]+$/, "").trim();
  const [name, ...rest] = stem.split(" - ");
  return { name: name.trim(), label: rest.join(" - ").trim().slice(0, 60) || "Custom" };
}

/** Import many images at once. Each file is named after its card. */
export function CustomArtImportDialog(props: Props) {
  return (
    <Dialog open={props.open} onClose={props.onClose} label="Import custom art" size="md">
      <Body {...props} />
    </Dialog>
  );
}

function Body({ onClose, owned, onDone }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [addToCollection, setAddToCollection] = useState(true);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function run() {
    setBusy(true);
    setError(null);
    const problems: string[] = [];
    try {
      const usable: Parsed[] = [];
      for (const file of files) {
        const problem = artProblem(file);
        const parsed = parseArtName(file.name);
        if (problem) problems.push(problem);
        else if (!parsed.name) problems.push(`${file.name} has no card name.`);
        else usable.push({ file, ...parsed });
      }

      const names = [...new Set(usable.map((item) => item.name))];
      const found = new Map<string, Card>();
      if (names.length > 0) {
        const resolved = await api<{ matches: Array<{ requested: string; card: Card }>; notFound: string[] }>("/api/cards/resolve", {
          method: "POST",
          body: { names },
        });
        resolved.matches.forEach((match) => found.set(match.requested.toLowerCase(), match.card));
      }

      let imported = 0;
      const touched = new Map<string, Card>();
      for (const item of usable) {
        const card = found.get(item.name.toLowerCase());
        if (!card) {
          problems.push(`No card named "${item.name}" (${item.file.name}).`);
          continue;
        }
        try {
          await uploadArt(card.id, item.file, item.label);
          imported += 1;
          touched.set(card.id, card);
        } catch (err) {
          problems.push(`${item.file.name}: ${err instanceof ApiError ? err.message : "upload failed"}`);
        }
      }

      let added = 0;
      if (addToCollection) {
        const missing = [...touched.values()].filter((card) => !owned.has(card.id));
        if (missing.length > 0) {
          await api("/api/collection/bulk", { method: "POST", body: { mode: "add", entries: missing.map((card) => ({ cardId: card.id, quantity: 1 })) } });
          added = missing.length;
        }
      }
      setSummary({ imported, added, problems });
      if (imported > 0) onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "The import stopped early. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (summary) {
    return (
      <div className="flex flex-col gap-6">
        <h2 className="font-display text-[44px] leading-none">Import done</h2>
        <p role="status" className="text-lg">
          {summary.imported} {summary.imported === 1 ? "art" : "arts"} imported
          {summary.added > 0 ? `, and ${summary.added} ${summary.added === 1 ? "card" : "cards"} added to your collection` : ""}.
        </p>
        {summary.problems.length > 0 && (
          <div>
            <p className="text-sm text-muted">Skipped</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-add-text">
              {summary.problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </div>
        )}
        <div>
          <button type="button" onClick={onClose} className="press min-h-12 rounded-full bg-accent px-7 text-sm font-bold text-on-accent">
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 className="font-display text-[44px] leading-none">Import custom art</h2>
      <p className="text-[15px] leading-snug text-muted">
        Name each image after its card, such as <span className="font-mono text-ink">Sol Ring.png</span>. To keep several arts for one card, add a label after a dash:{" "}
        <span className="font-mono text-ink">Sol Ring - foil proxy.png</span>. PNG, JPEG or WebP, up to 4 MB each. The art is private to you.
      </p>

      <div>
        <label className="pill inline-flex min-h-12 cursor-pointer items-center rounded-full border border-ink px-6 text-sm font-medium focus-within:outline-2 focus-within:outline-accent-text">
          Choose images
          <input ref={input} type="file" accept={ART_TYPES.join(",")} multiple className="sr-only" onChange={(event) => setFiles(Array.from(event.target.files ?? []))} aria-label="Choose images" />
        </label>
        {files.length > 0 && <p className="mt-3 text-sm text-muted">{files.length} {files.length === 1 ? "image" : "images"} chosen</p>}
      </div>

      {files.length > 0 && (
        <ul className="max-h-48 overflow-auto rounded-2xl border border-line">
          {files.map((file) => {
            const parsed = parseArtName(file.name);
            return (
              <li key={file.name + file.size} className="flex items-baseline justify-between gap-3 border-b border-line px-4 py-2.5 text-sm last:border-b-0">
                <span className="truncate">{parsed.name || file.name}</span>
                <span className="shrink-0 font-mono text-xs text-muted">{parsed.label}</span>
              </li>
            );
          })}
        </ul>
      )}

      <label className="flex items-start gap-3.5">
        <input type="checkbox" checked={addToCollection} onChange={(event) => setAddToCollection(event.target.checked)} className="mt-1 h-5 w-5 accent-[var(--accent-text)]" />
        <span>
          <span className="block text-[15px]">Also add these cards to my collection</span>
          <span className="mt-1 block text-sm text-muted">One copy of each card you do not have yet.</span>
        </span>
      </label>

      {error && (
        <p role="alert" className="rounded-2xl border border-add-line bg-add-bg px-4 py-3 text-sm text-add-text">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2.5">
        <button type="button" onClick={() => void run()} disabled={busy || files.length === 0} className="press min-h-12 rounded-full bg-accent px-7 text-sm font-bold text-on-accent disabled:opacity-50">
          {busy ? "Importing" : "Import"}
        </button>
        <button type="button" onClick={onClose} className="pill min-h-12 rounded-full border border-ink px-7 text-sm font-medium">
          Cancel
        </button>
      </div>
    </div>
  );
}
