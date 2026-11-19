"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Dialog } from "@/components/Dialog";
import { ApiError } from "@/lib/api";
import { fullPrompt } from "@/lib/proxy";
import type { useProxies } from "@/lib/useProxies";
import type { LoreVerdict, ProxyChatTurn, ProxyGeneration, ProxyMode } from "@/lib/types";
import { useLore } from "@/lib/useLore";
import { tierOptions } from "@/lib/proxyTiers";
import { btn } from "@/lib/ui";

type Proxies = ReturnType<typeof useProxies>;

interface Props {
  open: boolean;
  onClose: () => void;
  cardId: string | null;
  cardName: string;
  /** The card's existing art (custom or Scryfall), shown if the composited render 404s or hasn't been produced yet. */
  cardImage?: string;
  deckId: string;
  proxies: Proxies;
  onNotify: (message: string) => void;
}

/** One card's proxy: pick nickname or reskin, generate, refine, look back through earlier results, copy the prompt. */
export function ProxyPanel(props: Props) {
  return (
    <Dialog open={props.open && props.cardId !== null} onClose={props.onClose} label={`Proxy for ${props.cardName}`} size="md">
      {props.cardId && <Body key={props.cardId} {...props} cardId={props.cardId} />}
    </Dialog>
  );
}

/** The card's existing art (custom or Scryfall); there is no composited render anymore. */
function RenderImage({ cardName, cardImage }: { cardName: string; cardImage?: string }) {
  if (!cardImage) return null;
  return <Image src={cardImage} alt={`${cardName} card image`} fill sizes="160px" className="object-cover" />;
}

function Body({ cardId, cardName, cardImage, deckId, proxies, onNotify }: Props & { cardId: string }) {
  const treatment = proxies.treatments.find((t) => t.cardId === cardId) ?? null;
  const [mode, setMode] = useState<ProxyMode>(treatment?.mode ?? "NICKNAME");
  const [instruction, setInstruction] = useState("");
  const [ignoreType, setIgnoreType] = useState(false);
  const [ignoreRulesText, setIgnoreRulesText] = useState(false);
  const [loreOnly, setLoreOnly] = useState(false);
  const [ignoreLore, setIgnoreLore] = useState(false);
  const [tier, setTier] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ProxyGeneration[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ProxyChatTurn[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const current = treatment?.current ?? null;
  const touchedMode = useRef(false);
  const lore = useLore(deckId);
  const tiers = tierOptions(lore.doc);
  const [verdict, setVerdict] = useState<LoreVerdict | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);

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
      await proxies.generate(cardId, mode, refine ? instruction : undefined, ignoreType, ignoreRulesText, loreOnly, tier, ignoreLore);
      if (refine) setInstruction("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not generate. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function sendChat() {
    const text = chatInput.trim();
    if (!text) return;
    const next = [...chatMessages, { role: "user", content: text } as ProxyChatTurn];
    setChatMessages(next);
    setChatInput("");
    setChatBusy(true);
    setChatError(null);
    try {
      const reply = await proxies.chat(cardId, mode, ignoreType, ignoreRulesText, next, loreOnly, ignoreLore);
      setChatMessages([...next, { role: "assistant", content: reply }]);
    } catch (err) {
      setChatError(err instanceof ApiError ? err.message : "Could not reach the model. Try again.");
    } finally {
      setChatBusy(false);
    }
  }

  /** Carries a chat message over as the refine instruction, then closes the chat so the player reviews it before committing. */
  function useAsInstruction(text: string) {
    setInstruction(text);
    setChatOpen(false);
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

  async function check() {
    setChecking(true);
    setCheckError(null);
    setVerdict(null);
    try {
      setVerdict(await lore.check(cardId));
    } catch (err) {
      setCheckError(err instanceof ApiError ? err.message : "Could not check.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="relative aspect-[488/680] w-40 overflow-hidden rounded-[18px] bg-surface">
        <RenderImage cardName={cardName} cardImage={cardImage} />
      </div>
      <h2 className="font-display text-[44px] leading-none">{current?.nickname ?? cardName}</h2>
      {current?.nickname && <p className="-mt-3 text-sm text-muted">Proxy for {cardName}</p>}
      <p className="text-xs text-muted">
        Your instructions, the deck&rsquo;s lore and this card&rsquo;s details are sent to DeepSeek to write the prompt.
        Do not include personal information. <a href="/privacy" className="underline underline-offset-2">Privacy</a>
      </p>

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

      {tiers.length > 0 && (
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted">Tier</span>
          <select
            value={tier}
            onChange={(event) => setTier(event.target.value)}
            className="min-h-9 rounded-xl border border-line bg-surface px-3 text-[13px] text-ink [@media(pointer:coarse)]:min-h-11"
          >
            <option value="">Let the lore decide</option>
            {tiers.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="flex flex-col gap-2.5">
        <button
          type="button"
          role="switch"
          aria-checked={ignoreLore}
          onClick={() =>
            setIgnoreLore((on) => {
              const next = !on;
              if (next) setLoreOnly(false);
              return next;
            })
          }
          className="flex items-center justify-between gap-4 rounded-2xl border border-line px-4 py-3 text-left [@media(pointer:coarse)]:min-h-11"
        >
          <span className="flex flex-col">
            <span className="text-sm">No lore</span>
            <span className="text-xs text-muted">The deck's lore is not sent at all. The card stands alone, with no deck characters or places in the art.</span>
          </span>
          <span className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors ${ignoreLore ? "border-accent-text bg-accent" : "border-line bg-surface"}`}>
            <span className={`absolute top-0.5 size-3.5 rounded-full bg-ink transition-all ${ignoreLore ? "left-[18px]" : "left-0.5"}`} />
          </span>
        </button>
        <button
          type="button"
          role="switch"
          aria-checked={loreOnly}
          disabled={ignoreLore}
          onClick={() =>
            setLoreOnly((on) => {
              const next = !on;
              if (next) setIgnoreLore(false);
              return next;
            })
          }
          className={`flex items-center justify-between gap-4 rounded-2xl border border-line px-4 py-3 text-left [@media(pointer:coarse)]:min-h-11 ${ignoreLore ? "opacity-50" : ""}`}
        >
          <span className="flex flex-col">
            <span className="text-sm">Lore and type only</span>
            <span className="text-xs text-muted">
              The model sees nothing of the card but its type (creature type for a creature, card type for anything else): no name, rules text, cost or
              colors.
            </span>
          </span>
          <span className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors ${loreOnly ? "border-accent-text bg-accent" : "border-line bg-surface"}`}>
            <span className={`absolute top-0.5 size-3.5 rounded-full bg-ink transition-all ${loreOnly ? "left-[18px]" : "left-0.5"}`} />
          </span>
        </button>
        <div className={`flex flex-col gap-1.5 ${loreOnly || ignoreLore ? "opacity-50" : ""}`}>
          <label className="flex items-center gap-2.5 text-sm text-muted">
            <input
              type="checkbox"
              checked={loreOnly || ignoreType}
              disabled={loreOnly}
              onChange={(event) => setIgnoreType(event.target.checked)}
              className="size-4 accent-accent-text"
            />
            Ignore this card&rsquo;s printed type and let the lore decide what it is
          </label>
          <label className="flex items-center gap-2.5 text-sm text-muted">
            <input
              type="checkbox"
              checked={loreOnly || ignoreRulesText}
              disabled={loreOnly}
              onChange={(event) => setIgnoreRulesText(event.target.checked)}
              className="size-4 accent-accent-text"
            />
            Ignore this card&rsquo;s rules text and focus on the lore and the type
          </label>
        </div>
      </div>

      {current ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">
            {current.character.tier && <span className="mr-2 font-mono text-xs uppercase">{current.character.tier}</span>}
            {current.character.who}
          </p>
          <p className="whitespace-pre-wrap rounded-3xl border border-line bg-surface px-5 py-4 text-[15px] leading-relaxed">{fullPrompt(current.prompt, proxies.lore.mjParams)}</p>
          <div className="flex gap-2.5">
            <button type="button" className={btn.primary} onClick={copy}>
              Copy prompt
            </button>
            <button type="button" className={btn.secondary} disabled={busy} onClick={() => run(false)}>
              {busy ? "Working…" : "Generate again"}
            </button>
          </div>
          {chatOpen ? (
            <div className="flex flex-col gap-2.5 rounded-3xl border border-line bg-surface p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Discuss before committing</h3>
                <button type="button" className={btn.quiet} onClick={() => setChatOpen(false)}>
                  Close
                </button>
              </div>
              {chatMessages.length > 0 && (
                <ul className="flex max-h-64 flex-col gap-2 overflow-auto">
                  {chatMessages.map((message, index) => (
                    <li
                      key={index}
                      className={`rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${message.role === "user" ? "bg-ink text-bg" : "border border-line bg-bg"}`}
                    >
                      <p className="whitespace-pre-wrap">{message.content}</p>
                      {message.role === "assistant" && (
                        <button type="button" className="mt-1.5 text-xs text-muted underline hover:text-ink" onClick={() => useAsInstruction(message.content)}>
                          Use as refine instruction
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {chatError && <p className="text-xs text-danger">{chatError}</p>}
              <div className="flex gap-2.5">
                <input
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !chatBusy) {
                      event.preventDefault();
                      void sendChat();
                    }
                  }}
                  maxLength={2000}
                  placeholder="Ask about ideas before committing to a change…"
                  aria-label="Chat message"
                  className="min-h-9 w-full rounded-full border border-line bg-bg px-4 text-[13px] text-ink placeholder:text-muted focus:border-ink focus:outline-none [@media(pointer:coarse)]:min-h-11"
                />
                <button type="button" className={btn.secondary} disabled={chatBusy || !chatInput.trim()} onClick={() => void sendChat()}>
                  {chatBusy ? "…" : "Send"}
                </button>
              </div>
            </div>
          ) : (
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
              <button type="button" className={btn.quiet} onClick={() => setChatOpen(true)} title="Discuss ideas with the AI before committing a refinement">
                Discuss first
              </button>
            </div>
          )}
        </div>
      ) : (
        <button type="button" className={btn.large.primary} disabled={busy} onClick={() => run(false)}>
          {busy ? "Working…" : "Generate"}
        </button>
      )}

      <div className="flex items-center gap-2.5">
        <button type="button" className={btn.secondary} disabled={checking} onClick={() => void check()}>
          {checking ? "Checking…" : "Check against lore"}
        </button>
        {checkError && <span className="text-sm text-danger">{checkError}</span>}
      </div>
      {verdict && (
        <div
          role="status"
          className={`flex flex-col gap-2 rounded-3xl border px-5 py-4 text-sm ${verdict.fits ? "border-add-line bg-add-bg text-add-text" : "border-danger-line bg-danger/10 text-ink"}`}
        >
          <span className="font-medium">{verdict.fits ? "Fits the locked lore." : "Breaks the locked lore:"}</span>
          {verdict.problems.map((problem, index) => (
            <span key={index}>
              {problem.rule && <span className="mr-2 font-mono text-xs uppercase">{problem.rule}</span>}
              {problem.message}
            </span>
          ))}
        </div>
      )}

      {proxies.lore.lore === null && <p className="text-sm text-muted">This deck has no lore yet, so results will be generic. Add it under Lore.</p>}
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
