"use client";

import Image from "next/image";
import { Dialog } from "@/components/Dialog";
import { formatPrice } from "@/lib/links";
import type { DeckCardLine } from "@/lib/types";

interface Props {
  line: DeckCardLine | null;
  showCollection: boolean;
  onClose: () => void;
  onChangePrinting: (line: DeckCardLine) => void;
}

const Fact = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex justify-between gap-6 border-b border-line py-3 text-[15px]">
    <dt className="text-muted">{label}</dt>
    <dd className="text-right">{children}</dd>
  </div>
);

/** The center peek: one card in full, with everything we know about it. */
export function CardPeek({ line, showCollection, onClose, onChangePrinting }: Props) {
  return (
    <Dialog open={line !== null} onClose={onClose} label={line ? `${line.name} details` : "Card details"} size="md">
      {line && (
        <div className="grid gap-8 sm:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <div className="relative aspect-[488/680] overflow-hidden rounded-[18px] bg-surface">
            {line.imageNormal && <Image src={line.imageNormal} alt={`${line.name} card image`} fill sizes="320px" className="object-cover" />}
          </div>

          <div className="flex min-w-0 flex-col">
            <h2 className="font-display text-[44px] leading-none">{line.name}</h2>
            <p className="mt-3 font-mono text-[13px] text-muted">
              {line.typeLine}
              {line.manaCost ? `, ${line.manaCost.replace(/[{}]/g, "")}` : ""}
            </p>

            {line.oracleText && (
              <div className="mt-5 flex flex-col gap-2.5 text-[15px] leading-relaxed">
                {line.oracleText.split("\n").map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
              </div>
            )}

            <dl className="mt-6 border-t border-line">
              <Fact label="Price">
                <span className="text-lg font-medium">{formatPrice(line.priceUsd)}</span>
              </Fact>
              <Fact label="Printing">
                {line.setName || line.setCode.toUpperCase()}
                {line.collectorNumber ? ` #${line.collectorNumber}` : ""}
              </Fact>
              <Fact label="Rarity">
                <span className="capitalize">{line.rarity || "Unknown"}</span>
              </Fact>
              {line.artist && <Fact label="Artist">{line.artist}</Fact>}
              {showCollection && (
                <Fact label="In your collection">
                  {line.owned >= line.quantity ? `Yes, you own ${line.owned}` : line.owned > 0 ? `${line.owned} of ${line.quantity}` : "Not owned"}
                </Fact>
              )}
              {line.tags.length > 0 && <Fact label="Tags">{line.tags.join(", ")}</Fact>}
            </dl>

            <div className="mt-auto flex flex-wrap gap-2.5 pt-6">
              <button
                type="button"
                onClick={() => onChangePrinting(line)}
                className="pill min-h-11 rounded-full border border-ink px-5 text-[15px] font-medium"
              >
                Change printing
              </button>
              <button type="button" onClick={onClose} className="press min-h-11 rounded-full bg-accent px-6 text-[15px] font-bold text-on-accent">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}
