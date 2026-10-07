import Image from "next/image";
import { formatPrice } from "@/lib/links";
import type { DeckCardLine } from "@/lib/types";

export function CardPreview({ line, showCollection }: { line: DeckCardLine | null; showCollection: boolean }) {
  if (!line) {
    return (
      <div className="flex aspect-[5/7] items-center justify-center rounded-[18px] border border-line bg-surface p-6 text-center text-[15px] leading-snug text-muted">
        Hover a card to see it here.
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {line.imageNormal ? (
        <div className="relative aspect-[488/680] overflow-hidden rounded-[18px] bg-surface">
          <Image src={line.imageNormal} alt={`${line.name} card image`} fill sizes="300px" className="object-cover" />
        </div>
      ) : (
        <div className="flex aspect-[5/7] items-center justify-center rounded-[18px] border border-line bg-surface p-6 text-center text-muted">
          No image for this card.
        </div>
      )}
      <div>
        <p className="font-display text-[35px] leading-none">{line.name}</p>
        <p className="mt-2 font-mono text-[13px] text-muted">
          {line.typeLine}
          {line.manaCost ? `, ${line.manaCost.replace(/[{}]/g, "")}` : ""}
        </p>
        <p className="mt-3 text-[28px] leading-none font-medium tracking-[-0.03em]">{formatPrice(line.priceUsd)}</p>
        <p className="mt-2 font-mono text-xs text-muted">
          {line.setCode.toUpperCase()} {line.collectorNumber}
          {line.rarity ? `, ${line.rarity}` : ""}
        </p>
        {showCollection && (
          <p className={`mt-2.5 text-sm ${line.owned >= line.quantity ? "text-muted" : "text-add-text"}`}>
            {line.owned >= line.quantity
              ? `In your collection (${line.owned})`
              : line.owned > 0
                ? `You own ${line.owned} of ${line.quantity}`
                : "Not in your collection"}
          </p>
        )}
      </div>
    </div>
  );
}
