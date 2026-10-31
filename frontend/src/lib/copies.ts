/** How a card that appears more than once is shown, so the list, the gallery and the stacks all say it the same way. */

/** "4×" for a repeat, and the plain number for a single card. */
export function copiesLabel(quantity: number): string {
  return quantity > 1 ? `${quantity}×` : String(quantity);
}

/** How many card edges to show behind a pile in the gallery: none for one copy, one for two, two for three or more. */
export function pileEdges(quantity: number): 0 | 1 | 2 {
  if (quantity <= 1) return 0;
  return quantity === 2 ? 1 : 2;
}

/** What a screen reader says for a line's copies. */
export function copiesSpoken(quantity: number): string {
  return `${quantity} ${quantity === 1 ? "copy" : "copies"}`;
}
