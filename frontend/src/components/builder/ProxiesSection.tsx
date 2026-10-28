"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { pending, runBatch } from "@/lib/proxy";
import type { useProxies } from "@/lib/useProxies";
import type { DeckCardLine, ProxyMode } from "@/lib/types";
import { btn } from "@/lib/ui";

type Proxies = ReturnType<typeof useProxies>;

interface Props {
  lines: DeckCardLine[];
  proxies: Proxies;
  onOpen: (cardId: string) => void;
}

const CONCURRENCY = 3;

/** The deck's lore and parameters, every card with its proxy status, and a batch generate over the cards you tick. */
export function ProxiesSection({ lines, proxies, onOpen }: Props) {
  const cards = useMemo(() => {
    const seen = new Map<string, DeckCardLine>();
    for (const line of lines) if (line.board !== "tokens" && !seen.has(line.cardId)) seen.set(line.cardId, line);
    return [...seen.values()];
  }, [lines]);

  const [lore, setLore] = useState(proxies.lore.lore ?? "");
  const [params, setParams] = useState(proxies.lore.mjParams ?? "");
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<ProxyMode>("NICKNAME");
  const [progress, setProgress] = useState<{ finished: number; total: number } | null>(null);
  const [failures, setFailures] = useState<Map<string, string>>(new Map());
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    setLore(proxies.lore.lore ?? "");
    setParams(proxies.lore.mjParams ?? "");
  }, [proxies.lore.lore, proxies.lore.mjParams]);

  const byCard = new Map(proxies.treatments.map((t) => [t.cardId, t]));
  const dirty = lore !== (proxies.lore.lore ?? "") || params !== (proxies.lore.mjParams ?? "");
  const running = progress !== null;

  async function save() {
    try {
      await proxies.saveLore(lore, params);
      setSavedMessage("Saved");
    } catch (err) {
      setSavedMessage(err instanceof ApiError ? err.message : "Could not save");
    }
  }

  async function generateSelected(ids: string[]) {
    if (ids.length === 0) return;
    const controller = new AbortController();
    abort.current = controller;
    setFailures(new Map());
    setProgress({ finished: 0, total: ids.length });
    const result = await runBatch(
      ids,
      async (id) => {
        await proxies.generate(id, mode);
      },
      { concurrency: CONCURRENCY, signal: controller.signal, onProgress: (finished) => setProgress({ finished, total: ids.length }) },
    );
    setFailures(new Map(result.failed.map(({ item, error }) => [item, error instanceof ApiError ? error.message : "Failed"])));
    setProgress(null);
    setSelected(new Set(result.failed.map(({ item }) => item)));
  }

  const toggle = (id: string) =>
    setSelected((previous) => {
      const next = new Set(previous);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <section aria-label="Proxies" className="mt-16 flex flex-col gap-6">
      <h2 className="font-display text-[44px] leading-none">Proxies</h2>

      <div className="flex flex-col gap-2">
        <label htmlFor="deck-lore" className="text-sm text-muted">
          Deck lore. The model reads all of it for every card.
        </label>
        <textarea
          id="deck-lore"
          value={lore}
          onChange={(event) => setLore(event.target.value)}
          maxLength={60000}
          rows={8}
          className="w-full resize-y rounded-3xl border border-line bg-surface px-5 py-4 text-[15px] leading-relaxed text-ink placeholder:text-muted focus:border-ink focus:outline-none"
        />
        <div className="flex items-center gap-2.5">
          <input
            value={params}
            onChange={(event) => setParams(event.target.value)}
            maxLength={200}
            aria-label="Midjourney parameters"
            placeholder="--ar 5:7 --style raw --v 7"
            className="min-h-9 w-full max-w-sm rounded-full border border-line bg-surface px-4 text-[13px] text-ink placeholder:text-muted focus:border-ink focus:outline-none [@media(pointer:coarse)]:min-h-11"
          />
          <button type="button" className={btn.primary} disabled={!dirty} onClick={save}>
            Save
          </button>
          {savedMessage && !dirty && <span className="text-sm text-muted">{savedMessage}</span>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <select value={mode} onChange={(event) => setMode(event.target.value as ProxyMode)} aria-label="Mode for the selected cards" className="min-h-9 rounded-full border border-line bg-surface px-4 text-[13px] text-ink">
          <option value="NICKNAME">New nickname</option>
          <option value="RESKIN">Keep the name, new art</option>
        </select>
        <button type="button" className={btn.primary} disabled={running || selected.size === 0} onClick={() => generateSelected([...selected])}>
          Generate {selected.size > 0 ? selected.size : ""} selected
        </button>
        <button type="button" className={btn.secondary} disabled={running} onClick={() => setSelected(new Set(pending(cards.map((c) => c.cardId), proxies.treatments)))}>
          Select cards without a proxy
        </button>
        {running && (
          <>
            <progress value={progress.finished} max={progress.total} className="w-40" aria-label="Progress" />
            <span className="font-mono text-xs text-muted">
              {progress.finished} / {progress.total}
            </span>
            <button type="button" className={btn.quiet} onClick={() => abort.current?.abort()}>
              Cancel
            </button>
          </>
        )}
      </div>

      <ul className="flex flex-col divide-y divide-line rounded-3xl border border-line">
        {cards.map((card) => {
          const treatment = byCard.get(card.cardId);
          const failure = failures.get(card.cardId);
          return (
            <li key={card.cardId} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <input type="checkbox" aria-label={`Select ${card.name}`} checked={selected.has(card.cardId)} onChange={() => toggle(card.cardId)} disabled={running} />
              <button type="button" className="min-w-0 flex-1 truncate text-left hover:underline" onClick={() => onOpen(card.cardId)}>
                {card.name}
                {treatment?.current?.nickname && <span className="ml-2 text-muted">→ {treatment.current.nickname}</span>}
              </button>
              {failure && <span className="truncate text-xs text-danger" title={failure}>{failure}</span>}
              <span className="shrink-0 font-mono text-xs text-muted">{treatment ? (treatment.mode === "NICKNAME" ? "nickname" : "reskin") : "none"}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
