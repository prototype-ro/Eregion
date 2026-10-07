"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { CustomArtSection } from "@/components/CustomArtSection";
import { Dialog } from "@/components/Dialog";
import { api, ApiError } from "@/lib/api";
import { formatPrice } from "@/lib/links";
import type { CustomPrinting, DeckCardLine, Printing } from "@/lib/types";

interface Props {
  line: DeckCardLine | null;
  onClose: () => void;
  onChoose: (line: DeckCardLine, printing: Printing) => void;
  onChooseCustom: (line: DeckCardLine, art: CustomPrinting) => void;
}

/**
 * The art choices for a card, in two sections: the player's own custom art, and every English paper
 * printing from Scryfall, newest first. Picking one changes the art for that card in the deck.
 */
export function PrintingPicker({ line, onClose, onChoose, onChooseCustom }: Props) {
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
          <h2 className="font-display text-[44px] leading-none">{line.name}</h2>

          <div className="mt-8">
            <CustomArtSection cardId={line.cardId} currentId={line.customPrintingId} onChoose={(art) => onChooseCustom(line, art)} />
          </div>

          <div className="mt-12 flex flex-wrap items-baseline justify-between gap-3 border-t border-line pt-8">
            <h3 className="text-[22px] font-medium tracking-[-0.02em]">Scryfall</h3>
            <p className="text-sm text-muted">{printings ? `${printings.length} printings` : "Loading printings"}</p>
          </div>

          {error && (
            <p role="alert" className="mt-6 rounded-2xl border border-add-line bg-add-bg px-4 py-3 text-sm text-add-text">
              {error}
            </p>
          )}

          {printings && printings.length === 0 && <p className="mt-6 text-muted">No other printings were found for this card.</p>}

          {printings && (
            <ul className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-5 gap-y-7">
              {printings.map((printing) => {
                const current = line.customPrintingId === null && printing.scryfallId === line.printingId;
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
