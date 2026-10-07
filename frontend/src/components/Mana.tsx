import { describeCost, splitMana } from "@/lib/mana";

/** Draws one symbol with the mana font. Unknown symbols stay as text so nothing disappears. */
function Symbol({ raw, icon, label }: { raw: string; icon: string | null; label: string }) {
  if (!icon) return <span>{`{${raw}}`}</span>;
  return <i className={`ms ms-cost ms-shadow ${icon} mx-[1px] align-[-0.1em]`} role="img" aria-label={label} />;
}

/** A card's mana cost as the real symbols. Shows `empty` when the card has no cost. */
export function ManaCost({ cost, empty = null, className = "" }: { cost: string; empty?: React.ReactNode; className?: string }) {
  if (!cost) return <>{empty}</>;
  return (
    <span className={`inline-flex items-center whitespace-nowrap ${className}`} role="group" aria-label={`Mana cost: ${describeCost(cost)}`}>
      {splitMana(cost).map((piece, index) =>
        piece.kind === "symbol" ? <Symbol key={index} raw={piece.token.raw} icon={piece.token.icon} label={piece.token.label} /> : <span key={index}>{piece.text}</span>,
      )}
    </span>
  );
}

/** Rules text where every {symbol} is drawn as the real symbol. */
export function ManaText({ text }: { text: string }) {
  return (
    <>
      {splitMana(text).map((piece, index) =>
        piece.kind === "symbol" ? <Symbol key={index} raw={piece.token.raw} icon={piece.token.icon} label={piece.token.label} /> : <span key={index}>{piece.text}</span>,
      )}
    </>
  );
}
