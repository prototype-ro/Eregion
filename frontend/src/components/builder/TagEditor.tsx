"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/Dialog";
import type { DeckCardLine } from "@/lib/types";
import { btn, field } from "@/lib/ui";

interface Props {
  line: DeckCardLine | null;
  /** Every tag already used in the deck, offered as one-click suggestions. */
  suggestions: string[];
  onClose: () => void;
  onChange: (line: DeckCardLine, tags: string[]) => void;
}

const MAX_TAGS = 12;

const chip = "flex min-h-9 [@media(pointer:coarse)]:min-h-11 items-center gap-2 rounded-full border border-line px-4 text-sm";

/** Custom tags for one card. Tags group cards in the deck however you like, such as Ramp or Win condition. */
export function TagEditor({ line, suggestions, onClose, onChange }: Props) {
  const [draft, setDraft] = useState("");
  const [tags, setTags] = useState<string[]>([]);

  useEffect(() => {
    setTags(line?.tags ?? []);
    setDraft("");
  }, [line]);

  if (!line) return <Dialog open={false} onClose={onClose} label="Edit tags" size="sm">{null}</Dialog>;

  const has = (tag: string) => tags.some((existing) => existing.toLowerCase() === tag.toLowerCase());

  function add(raw: string) {
    const tag = raw.trim().replace(/\s+/g, " ").slice(0, 30);
    if (!tag || has(tag) || tags.length >= MAX_TAGS) return;
    const next = [...tags, tag];
    setTags(next);
    setDraft("");
    onChange(line!, next);
  }

  function remove(tag: string) {
    const next = tags.filter((existing) => existing !== tag);
    setTags(next);
    onChange(line!, next);
  }

  return (
    <Dialog open onClose={onClose} label={`Tags for ${line.name}`} size="sm">
      <h2 className="font-display text-[40px] leading-none">Tags</h2>
      <p className="mt-2 text-[15px] text-muted">{line.name}</p>

      <ul className="mt-6 flex min-h-9 [@media(pointer:coarse)]:min-h-11 flex-wrap gap-2" aria-label="Current tags">
        {tags.length === 0 && <li className="py-2.5 text-sm text-muted">No tags yet.</li>}
        {tags.map((tag) => (
          <li key={tag} className={chip}>
            {tag}
            <button type="button" aria-label={`Remove tag ${tag}`} onClick={() => remove(tag)} className="-mr-2 flex h-9 w-9 items-center justify-center rounded-full text-lg leading-none text-muted hover:text-ink">
              x
            </button>
          </li>
        ))}
      </ul>

      <form
        className="mt-6 flex gap-2.5"
        onSubmit={(event) => {
          event.preventDefault();
          add(draft);
        }}
      >
        <label htmlFor="tag-input" className="sr-only">
          New tag
        </label>
        <input
          id="tag-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={30}
          placeholder="Add a tag, then press Enter"
          autoFocus
          className={`${field.lg} flex-1`}
        />
        <button type="submit" disabled={!draft.trim()} className={btn.large.primary}>
          Add
        </button>
      </form>

      {suggestions.filter((tag) => !has(tag)).length > 0 && (
        <div className="mt-6">
          <p className="mb-2.5 text-sm text-muted">Used elsewhere in this deck</p>
          <ul className="flex flex-wrap gap-2">
            {suggestions
              .filter((tag) => !has(tag))
              .map((tag) => (
                <li key={tag}>
                  <button type="button" onClick={() => add(tag)} className={`${chip} hover:border-ink`}>
                    + {tag}
                  </button>
                </li>
              ))}
          </ul>
        </div>
      )}

      <div className="mt-8 flex justify-end">
        <button type="button" onClick={onClose} className="press min-h-9 [@media(pointer:coarse)]:min-h-11 rounded-full bg-accent px-6 text-[13px] [@media(pointer:coarse)]:text-[15px] font-bold text-on-accent">
          Done
        </button>
      </div>
    </Dialog>
  );
}
