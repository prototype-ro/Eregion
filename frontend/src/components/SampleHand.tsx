"use client";

/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Dialog } from "@/components/Dialog";
import type { DeckCardLine } from "@/lib/types";
import { std } from "@/lib/ui";

interface Card {
  key: string;
  name: string;
  image: string | null;
  isLand: boolean;
}

/** The 99 as single cards: the main board only, each copy its own card, the commander set aside in the command zone. */
function library(lines: DeckCardLine[]): Card[] {
  return lines
    .filter((line) => line.board === "main")
    .flatMap((line) =>
      Array.from({ length: line.quantity }, (_, copy) => ({
        key: `${line.cardId}-${copy}`,
        name: line.name,
        image: line.imageNormal || null,
        isLand: line.primaryType === "Land",
      })),
    );
}

function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  const random = new Uint32Array(out.length);
  crypto.getRandomValues(random);
  for (let i = out.length - 1; i > 0; i--) {
    const j = random[i] % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * A practice opening hand: seven cards, London mulligans (draw seven again, then put one card on the bottom per
 * mulligan), and draws for the next turns. Nothing is saved; it only answers "would I keep this?".
 */
export function SampleHand({ open, onClose, lines }: { open: boolean; onClose: () => void; lines: DeckCardLine[] }) {
  return (
    <Dialog open={open} onClose={onClose} label="Sample hand" size="lg">
      <Hand lines={lines} onClose={onClose} />
    </Dialog>
  );
}

function Hand({ lines, onClose }: { lines: DeckCardLine[]; onClose: () => void }) {
  const cards = useMemo(() => library(lines), [lines]);
  const [deck, setDeck] = useState<Card[]>([]);
  const [hand, setHand] = useState<Card[]>([]);
  const [mulligans, setMulligans] = useState(0);
  const [bottom, setBottom] = useState<Set<string>>(new Set());
  const [drawn, setDrawn] = useState(0);

  const deal = useCallback(
    (taken: number) => {
      const order = shuffled(cards);
      setHand(order.slice(0, 7));
      setDeck(order.slice(7));
      setMulligans(taken);
      setBottom(new Set());
      setDrawn(0);
    },
    [cards],
  );

  useEffect(() => {
    deal(0);
  }, [deal]);

  const toBottom = mulligans - bottom.size;
  const choosing = toBottom > 0;
  const lands = hand.filter((card) => !bottom.has(card.key) && card.isLand).length;
  const kept = hand.length - bottom.size;

  function toggle(card: Card) {
    if (!choosing && !bottom.has(card.key)) return;
    setBottom((current) => {
      const next = new Set(current);
      if (next.has(card.key)) next.delete(card.key);
      else next.add(card.key);
      return next;
    });
  }

  function draw() {
    if (deck.length === 0) return;
    setHand((current) => [...current, deck[0]]);
    setDeck((current) => current.slice(1));
    setDrawn((n) => n + 1);
  }

  if (cards.length < 7) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="font-display text-[44px] leading-none">Sample hand</h2>
        <p className="text-muted">Add at least seven cards to the main board to draw a hand.</p>
        <button type="button" onClick={onClose} className={std("secondary")}>
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-[44px] leading-none">Sample hand</h2>
        <p role="status" className="font-mono text-[13px] text-muted">
          {choosing
            ? `Mulligan to ${7 - mulligans}: pick ${toBottom} more ${toBottom === 1 ? "card" : "cards"} to put on the bottom`
            : `${kept} cards, ${lands} ${lands === 1 ? "land" : "lands"}${drawn ? `, drawn for turn ${drawn + 1}` : ""}${mulligans ? `, after ${mulligans} ${mulligans === 1 ? "mulligan" : "mulligans"}` : ""}`}
        </p>
      </div>
      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {hand.map((card) => {
          const sent = bottom.has(card.key);
          return (
            <li key={card.key}>
              <button
                type="button"
                onClick={() => toggle(card)}
                disabled={!choosing && !sent}
                aria-pressed={choosing || sent ? sent : undefined}
                aria-label={sent ? `${card.name}, on the bottom` : card.name}
                className={`block w-full overflow-hidden rounded-[10px] transition-opacity ${sent ? "opacity-30" : ""} ${choosing ? "cursor-pointer ring-accent-text hover:ring-2" : "cursor-default"}`}
              >
                {card.image ? (
                  <img src={card.image} alt="" className="aspect-[488/680] w-full object-cover" />
                ) : (
                  <span className="flex aspect-[488/680] items-center justify-center bg-surface p-2 text-center text-xs">{card.name}</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-2.5">
        <button type="button" onClick={() => deal(0)} className={std("primary")}>
          New hand
        </button>
        <button type="button" onClick={() => deal(mulligans + 1)} disabled={mulligans >= 6} className={std("secondary")}>
          Mulligan
        </button>
        <button type="button" onClick={draw} disabled={choosing || deck.length === 0} className={std("secondary")}>
          Draw a card
        </button>
        <button type="button" onClick={onClose} className={std("quiet")}>
          Close
        </button>
      </div>
      <p className="text-xs text-muted">The commander stays in the command zone. Shuffled with your browser&rsquo;s random numbers; nothing is saved.</p>
    </div>
  );
}
