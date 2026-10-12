"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog } from "@/components/Dialog";
import { api, ApiError } from "@/lib/api";
import { parseDecklist, type ParsedEntry } from "@/lib/decklist";
import type { Board, Card, ResolveResult } from "@/lib/types";

/** Where a list came from when it was read from a link. */
export interface ImportSource {
  name: string;
  site: string;
}

const isLink = (text: string) => /^https?:\/\/\S+$/i.test(text.trim());

export interface ImportedCard {
  card: Card;
  quantity: number;
  board: Board;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Wording, so the same dialog can import into a deck or into the collection. */
  title?: string;
  addLabel?: string;
  /** Pass null to hide the choice, for places where there is nothing to replace. */
  replaceLabel?: string | null;
  /** Text to start with each time the dialog opens, for editing a list that already exists. */
  initialText?: string;
  /** Whether the list replaces the draft by default. A list that was opened for editing is the whole deck, so it does. */
  defaultReplace?: boolean;
  /** The line above the box, and the text of the button that reads the list. */
  intro?: string;
  submitLabel?: string;
  /** The text of the final button, given how many cards were found. */
  confirmLabel?: (count: number) => string;
  /** Called with the cards found. replace is true when the draft should be emptied first. */
  onImport: (cards: ImportedCard[], replace: boolean, source?: ImportSource) => void;
}

const CHUNK = 200;
const MAX_FILE_BYTES = 512 * 1024;

type Step = { kind: "edit" } | { kind: "working"; count: number } | { kind: "review"; found: ImportedCard[]; notFound: string[]; ignored: string[]; source?: ImportSource };

/** Import a decklist by pasting it or loading a text or CSV file. Names are matched on Scryfall. */
export function ImportDialog({
  open,
  onClose,
  onImport,
  title = "Import a list",
  addLabel = "Add to the current draft",
  replaceLabel = "Replace the current draft",
  initialText = "",
  defaultReplace = false,
  intro = "Paste a decklist, one card per line, or a link to a deck",
  submitLabel = "Import",
  confirmLabel = (count) => `Add ${count} cards`,
}: Props) {
  const [text, setText] = useState(initialText);
  const [replace, setReplace] = useState(defaultReplace);
  const [step, setStep] = useState<Step>({ kind: "edit" });
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Every time the dialog opens it starts from the given text, which for an edit is the deck as it is now.
  useEffect(() => {
    if (open) {
      setText(initialText);
      setReplace(defaultReplace);
      setStep({ kind: "edit" });
      setError(null);
    }
    // The text is read when the dialog opens, not while it is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function reset() {
    setText(initialText);
    setReplace(defaultReplace);
    setStep({ kind: "edit" });
    setError(null);
  }

  function close() {
    reset();
    onClose();
  }

  async function loadFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setError("That file is too large for a decklist. Keep it under 512 KB.");
      return;
    }
    setError(null);
    setText(await file.text());
    if (fileInput.current) fileInput.current.value = "";
  }

  async function run() {
    setError(null);
    let listText = text;
    let source: ImportSource | undefined;
    // A pasted link is read by the server, then goes through the same steps as a pasted list.
    if (isLink(text)) {
      setStep({ kind: "working", count: 0 });
      try {
        const fetched = await api<{ name: string; site: string; text: string }>("/api/import/url", { method: "POST", body: { url: text.trim() } });
        listText = fetched.text;
        source = { name: fetched.name, site: fetched.site };
        setText(fetched.text);
      } catch (err) {
        setStep({ kind: "edit" });
        setError(err instanceof ApiError ? err.message : "Could not read that link. Try again.");
        return;
      }
    }
    const parsed = parseDecklist(listText);
    if (parsed.entries.length === 0) {
      setError("No cards found. Paste one card per line, like \"1 Sol Ring\".");
      return;
    }

    const names = [...new Set(parsed.entries.map((entry) => entry.name))];
    setStep({ kind: "working", count: names.length });
    try {
      const matches = new Map<string, Card>();
      const notFound: string[] = [];
      for (let start = 0; start < names.length; start += CHUNK) {
        const result = await api<ResolveResult>("/api/cards/resolve", {
          method: "POST",
          body: { names: names.slice(start, start + CHUNK) },
        });
        result.matches.forEach((match) => matches.set(match.requested.toLowerCase(), match.card));
        notFound.push(...result.notFound);
      }

      // Merge repeated lines for the same card and board into one entry.
      const merged = new Map<string, ImportedCard>();
      for (const entry of parsed.entries as ParsedEntry[]) {
        const card = matches.get(entry.name.toLowerCase());
        if (!card) continue;
        const key = `${card.id}|${entry.board}`;
        const existing = merged.get(key);
        if (existing) existing.quantity = Math.min(99, existing.quantity + entry.quantity);
        else merged.set(key, { card, quantity: entry.board === "commander" ? 1 : entry.quantity, board: entry.board });
      }

      const found = [...merged.values()];
      if (notFound.length === 0 && parsed.ignored.length === 0) {
        onImport(found, replace, source);
        close();
      } else {
        setStep({ kind: "review", found, notFound, ignored: parsed.ignored, source });
      }
    } catch (err) {
      setStep({ kind: "edit" });
      setError(err instanceof ApiError ? err.message : "The import failed. Try again.");
    }
  }

  const cardCount = step.kind === "review" ? step.found.reduce((sum, item) => sum + item.quantity, 0) : 0;

  return (
    <Dialog open={open} onClose={close} label={title} size="md">
      <h2 className="font-display text-[44px] leading-none">{title}</h2>

      {step.kind === "edit" && (
        <div className="mt-6 flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label htmlFor="decklist" className="text-sm text-muted">
              {intro}
            </label>
            <textarea
              id="decklist"
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={12}
              spellCheck={false}
              placeholder={"1 Sol Ring\n1 Arcane Signet\n4 Island\n\nSideboard\n1 Mana Drain\n\nor https://archidekt.com/decks/..."}
              className="w-full resize-y rounded-3xl border border-line bg-surface px-5 py-4 font-mono text-sm leading-relaxed text-ink placeholder:text-muted focus:border-ink focus:outline-none"
            />
            <p className="text-sm text-muted">
              Works with lists copied from Moxfield, Archidekt, MTG Arena and MTGO. Set codes like (CMM) are ignored.
              Headings such as Commander and Sideboard are understood. A link to a deck on Archidekt, Scryfall, TappedOut or MTGGoldfish is read for you. Moxfield blocks that, so copy its export instead.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileInput}
              id="decklist-file"
              type="file"
              accept=".txt,.csv,.dec,.mwDeck,text/plain,text/csv"
              className="sr-only"
              onChange={(event) => void loadFile(event.target.files?.[0])}
            />
            <label htmlFor="decklist-file" className="pill inline-flex min-h-9 [@media(pointer:coarse)]:min-h-11 cursor-pointer items-center rounded-full border border-ink px-5 text-[13px] [@media(pointer:coarse)]:text-[15px] font-medium focus-within:outline-2">
              Choose a file
            </label>
            <span className="text-sm text-muted">.txt or .csv, up to 512 KB</span>
          </div>

          {replaceLabel !== null && (
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-sm text-muted">When importing</legend>
            <label className="flex min-h-9 [@media(pointer:coarse)]:min-h-11 items-center gap-3 text-[15px]">
              <input type="radio" name="mode" checked={!replace} onChange={() => setReplace(false)} className="h-4 w-4 accent-[var(--accent-text)]" />
              {addLabel}
            </label>
            <label className="flex min-h-9 [@media(pointer:coarse)]:min-h-11 items-center gap-3 text-[15px]">
              <input type="radio" name="mode" checked={replace} onChange={() => setReplace(true)} className="h-4 w-4 accent-[var(--accent-text)]" />
              {replaceLabel}
            </label>
          </fieldset>
          )}

          {error && (
            <p role="alert" className="rounded-2xl border border-danger-line bg-danger/10 px-4 py-3 text-sm text-ink">
              {error}
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-2.5">
            <button type="button" onClick={close} className="pill min-h-9 [@media(pointer:coarse)]:min-h-11 rounded-full border border-ink px-6 text-[13px] [@media(pointer:coarse)]:text-[15px] font-medium">
              Cancel
            </button>
            <button type="button" onClick={() => void run()} disabled={text.trim() === ""} className="press min-h-9 [@media(pointer:coarse)]:min-h-11 rounded-full bg-accent px-6 text-[13px] [@media(pointer:coarse)]:text-[15px] font-bold text-on-accent disabled:opacity-50">
              {submitLabel}
            </button>
          </div>
        </div>
      )}

      {step.kind === "working" && (
        <p role="status" className="mt-8 text-lg text-muted">
          {step.count === 0 ? "Reading the deck from the link." : `Matching ${step.count} card names on Scryfall.`}
        </p>
      )}

      {step.kind === "review" && (
        <div className="mt-6 flex flex-col gap-6">
          <p className="text-lg">
            {step.source && (
              <>
                Read <span className="font-medium">{step.source.name}</span> from {step.source.site}.{" "}
              </>
            )}
            Found <span className="font-medium">{cardCount}</span> cards.{" "}
            {step.notFound.length + step.ignored.length > 0 && "Some lines could not be matched."}
          </p>

          {step.notFound.length > 0 && (
            <div>
              <p className="mb-2.5 text-sm text-muted">No card with these names ({step.notFound.length})</p>
              <ul className="flex max-h-48 flex-col overflow-auto rounded-2xl border border-add-line bg-add-bg px-4 py-2 text-sm">
                {step.notFound.map((name) => (
                  <li key={name} className="py-1.5">
                    {name}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {step.ignored.length > 0 && (
            <div>
              <p className="mb-2.5 text-sm text-muted">Lines that were skipped ({step.ignored.length})</p>
              <ul className="flex max-h-32 flex-col overflow-auto rounded-2xl border border-line px-4 py-2 font-mono text-xs text-muted">
                {step.ignored.map((line, index) => (
                  <li key={index} className="py-1">
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2.5">
            <button type="button" onClick={() => setStep({ kind: "edit" })} className="pill min-h-9 [@media(pointer:coarse)]:min-h-11 rounded-full border border-ink px-6 text-[13px] [@media(pointer:coarse)]:text-[15px] font-medium">
              Back
            </button>
            <button
              type="button"
              disabled={step.found.length === 0}
              onClick={() => {
                onImport(step.found, replace, step.source);
                close();
              }}
              className="press min-h-9 [@media(pointer:coarse)]:min-h-11 rounded-full bg-accent px-6 text-[13px] [@media(pointer:coarse)]:text-[15px] font-bold text-on-accent disabled:opacity-50"
            >
              {confirmLabel(cardCount)}
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
