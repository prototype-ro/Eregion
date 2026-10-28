"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog } from "@/components/Dialog";
import { ApiError } from "@/lib/api";
import { fullPrompt } from "@/lib/proxy";
import type { useProxies } from "@/lib/useProxies";
import type { ProxyGeneration, ProxyMode } from "@/lib/types";
import { btn } from "@/lib/ui";

type Proxies = ReturnType<typeof useProxies>;

interface Props {
  open: boolean;
  onClose: () => void;
  cardId: string | null;
  cardName: string;
  proxies: Proxies;
  onNotify: (message: string) => void;
}

/** One card's proxy: pick nickname or reskin, generate, refine, look back through earlier results, copy the prompt. */
export function ProxyPanel(props: Props) {
  return (
    <Dialog open={props.open && props.cardId !== null} onClose={props.onClose} label={`Proxy for ${props.cardName}`} size="md">
      {props.cardId && <Body {...props} cardId={props.cardId} />}
    </Dialog>
  );
}

function Body({ cardId, cardName, proxies, onNotify }: Props & { cardId: string }) {
  const treatment = proxies.treatments.find((t) => t.cardId === cardId) ?? null;
  const [mode, setMode] = useState<ProxyMode>(treatment?.mode ?? "NICKNAME");
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ProxyGeneration[]>([]);
  const current = treatment?.current ?? null;
  const touchedMode = useRef(false);

  // The saved mode arrives after the first render when the proxies load late. Follow it until the player picks one.
  useEffect(() => {
    if (treatment && !touchedMode.current) setMode(treatment.mode);
  }, [treatment?.mode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!treatment) return;
    let cancelled = false;
    proxies.history(cardId).then((list) => !cancelled && setHistory(list)).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [cardId, treatment?.currentGenerationId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run(refine: boolean) {
    setBusy(true);
    setError(null);
    try {
      await proxies.generate(cardId, mode, refine ? instruction : undefined);
      if (refine) setInstruction("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not generate. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function choose(generationId: string) {
    setBusy(true);
    try {
      const next = await proxies.choose(cardId, generationId);
      touchedMode.current = false;
      setMode(next.mode);
    } catch {
      onNotify("Could not switch.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!current) return;
    try {
      await navigator.clipboard.writeText(fullPrompt(current.prompt, proxies.lore.mjParams));
      onNotify("Prompt copied");
    } catch {
      onNotify("Could not copy. Select the text and copy it by hand.");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <h2 className="font-display text-[44px] leading-none">{current?.nickname ?? cardName}</h2>
      {current?.nickname && <p className="-mt-3 text-sm text-muted">Proxy for {cardName}</p>}

      <div role="group" aria-label="Mode" className="grid grid-cols-2 rounded-full border border-line p-1">
        {(["NICKNAME", "RESKIN"] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => {
              touchedMode.current = true;
              setMode(m);
            }}
            className={`min-h-9 rounded-full text-[13px] [@media(pointer:coarse)]:min-h-11 ${mode === m ? "bg-ink text-bg" : "text-muted hover:text-ink"}`}
          >
            {m === "NICKNAME" ? "New nickname" : "Keep the name, new art"}
          </button>
        ))}
      </div>

      {current ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">
            {current.character.tier && <span className="mr-2 font-mono text-xs uppercase">{current.character.tier}</span>}
            {current.character.who}
          </p>
          <p className="whitespace-pre-wrap rounded-3xl border border-line bg-surface px-5 py-4 text-[15px] leading-relaxed">{current.prompt}</p>
          <div className="flex gap-2.5">
            <button type="button" className={btn.primary} onClick={copy}>
              Copy prompt
            </button>
            <button type="button" className={btn.secondary} disabled={busy} onClick={() => run(false)}>
              {busy ? "Working…" : "Generate again"}
            </button>
          </div>
          <div className="flex gap-2.5">
            <input
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              maxLength={1000}
              placeholder="Refine: make the armor darker"
              aria-label="Refine instruction"
              className="min-h-9 w-full rounded-full border border-line bg-surface px-4 text-[13px] text-ink placeholder:text-muted focus:border-ink focus:outline-none [@media(pointer:coarse)]:min-h-11"
            />
            <button type="button" className={btn.secondary} disabled={busy || !instruction.trim()} onClick={() => run(true)}>
              Refine
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className={btn.large.primary} disabled={busy} onClick={() => run(false)}>
          {busy ? "Working…" : "Generate"}
        </button>
      )}

      {proxies.lore.lore === null && <p className="text-sm text-muted">This deck has no lore yet, so results will be generic. Add it under Proxies.</p>}
      {error && (
        <p role="alert" className="rounded-2xl border border-danger-line bg-danger/10 px-4 py-3 text-sm text-ink">
          {error}
        </p>
      )}

      {history.length > 1 && (
        <section aria-label="History" className="flex flex-col gap-2">
          <h3 className="text-sm text-muted">Earlier results</h3>
          <ul className="flex max-h-56 flex-col gap-2 overflow-auto">
            {history.map((g) => (
              <li key={g.id} className="flex items-start justify-between gap-3 rounded-2xl border border-line px-4 py-3 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{g.nickname ?? cardName}</span>
                  <span className="line-clamp-2 text-muted">{g.instruction ? `${g.instruction}: ` : ""}{g.prompt}</span>
                </span>
                {g.id === treatment?.currentGenerationId ? (
                  <span className="shrink-0 font-mono text-xs text-muted">current</span>
                ) : (
                  <button type="button" className={btn.quiet} disabled={busy} onClick={() => choose(g.id)}>
                    Use this
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
