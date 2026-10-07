"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Dialog } from "@/components/Dialog";
import { api, ApiError } from "@/lib/api";
import { formatPrice } from "@/lib/links";
import type { DeckCardLine, Printing } from "@/lib/types";

interface Props {
  line: DeckCardLine | null;
  onClose: () => void;
  onChoose: (line: DeckCardLine, printing: Printing) => void;
}

/** Every English paper printing of a card, newest first. Picking one changes the art and price for that card. */
export function PrintingPicker({ line, onClose, onChoose }: Props) {
  const [printings, setPrintings] = useState<Printing[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cardId = line?.cardId ?? null;

  useEffect(() => {
    if (!cardId) return;
    let cancelled = false;
    setPrintings(null);
    setError(null);
    api<Printing[]>(`/api/cards/${cardId}/printings`)
      .then((list) => {
        if (!cancelled) setPrintings(list);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Could not load printings.");
      });
    return () => {
      cancelled = true;
    };
  }, [cardId]);

  return (
    <Dialog open={line !== null} onClose={onClose} label="Choose a printing" size="lg">
      {line && (
        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-display text-[44px] leading-none">{line.name}</h2>
            <p className="text-[15px] text-muted">{printings ? `${printings.length} printings` : "Loading printings"}</p>
          </div>

          {error && (
            <p role="alert" className="mt-6 rounded-2xl border border-add-line bg-add-bg px-4 py-3 text-sm text-add-text">
              {error}
            </p>
          )}

          {printings && printings.length === 0 && <p className="mt-6 text-muted">No other printings were found for this card.</p>}

          {printings && (
            <ul className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-5 gap-y-7">
              {printings.map((printing) => {
                const current = printing.scryfallId === line.printingId;
                return (
                  <li key={printing.scryfallId}>
                    <button
                      type="button"
                      onClick={() => onChoose(line, printing)}
                      aria-pressed={current}
                      className={`group block w-full rounded-[12px] text-left ${current ? "outline-2 outline-offset-4 outline-accent-text" : ""}`}
                    >
                      <div className="relative aspect-[488/680] overflow-hidden rounded-[10px] bg-surface">
                        {printing.imageSmall && (
                          <Image src={printing.imageSmall} alt="" fill sizes="170px" className="object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                        )}
                      </div>
                      <p className="mt-2.5 truncate text-sm font-medium">{printing.setName || printing.setCode.toUpperCase()}</p>
                      <p className="mt-0.5 font-mono text-xs text-muted">
                        {printing.setCode.toUpperCase()} {printing.collectorNumber}
                        {printing.releasedAt ? `, ${printing.releasedAt.slice(0, 4)}` : ""}
                      </p>
                      <p className="mt-1 text-sm">
                        {formatPrice(printing.priceUsd)}
                        {current && <span className="ml-2 text-accent-text">Current</span>}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-8 flex justify-end">
            <button type="button" onClick={onClose} className="pill min-h-11 rounded-full border border-ink px-6 text-[15px] font-medium">
              Close
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
