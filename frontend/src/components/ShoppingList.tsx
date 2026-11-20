"use client";

import { Dialog } from "@/components/Dialog";
import { CopyButton } from "@/components/CopyButton";
import { formatPrice } from "@/lib/links";
import { shoppingList } from "@/lib/collection";
import type { DeckCardLine } from "@/lib/types";
import { std } from "@/lib/ui";

/**
 * The cards to buy to finish the deck, priciest first, with a total, and a plain list to paste into a store's mass
 * entry. Prices are Scryfall's market estimates in US dollars.
 */
export function ShoppingList({ open, onClose, lines }: { open: boolean; onClose: () => void; lines: DeckCardLine[] }) {
  const needs = shoppingList(lines);
  const total = needs.reduce((sum, need) => sum + (need.each ?? 0) * need.copies, 0);
  const unpriced = needs.filter((need) => need.each === null).length;
  return (
    <Dialog open={open} onClose={onClose} label="Shopping list" size="md">
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-display text-[44px] leading-none">Shopping list</h2>
          <p className="font-mono text-[13px] text-muted">
            {needs.length === 0 ? "Nothing to buy" : `${needs.reduce((sum, need) => sum + need.copies, 0)} cards, about ${formatPrice(total)}`}
          </p>
        </div>
        {needs.length === 0 ? (
          <p className="text-muted">Your collection has every card in the deck.</p>
        ) : (
          <ul className="max-h-[50vh] divide-y divide-line overflow-auto rounded-2xl border border-line">
            {needs.map((need) => (
              <li key={need.name} className="flex items-baseline justify-between gap-4 px-4 py-2 text-[15px]">
                <span>
                  {need.copies} {need.name}
                </span>
                <span className="font-mono text-sm text-muted">{need.each === null ? "no price" : formatPrice(need.each * need.copies)}</span>
              </li>
            ))}
          </ul>
        )}
        {unpriced > 0 && <p className="text-xs text-muted">{unpriced} without a market price are left out of the total.</p>}
        <div className="flex flex-wrap gap-2.5">
          {needs.length > 0 && <CopyButton label="Copy list" text={() => needs.map((need) => `${need.copies} ${need.name}`).join("\n")} className={std("primary")} />}
          <button type="button" onClick={onClose} className={std("secondary")}>
            Close
          </button>
        </div>
        <p className="text-xs text-muted">Prices are Scryfall market estimates in US dollars. Mark what you own on the Collection page.</p>
      </div>
    </Dialog>
  );
}
