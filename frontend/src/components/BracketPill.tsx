/** A deck's bracket as a small label, the same on the decks list, Explore and a deck's header. Nothing until it is known. */
export function BracketPill({ bracket, name }: { bracket?: number | null; name?: string | null }) {
  if (!bracket) return null;
  const label = bracket === 5 ? "cEDH" : `Bracket ${bracket}`;
  return (
    <span title={name ? `${label}: ${name}` : label} className="rounded-full border border-line px-2.5 py-0.5 font-mono text-xs text-ink">
      {bracket === 5 ? "cEDH" : `B${bracket}`}
      {name && bracket !== 5 ? <span className="text-muted"> {name}</span> : null}
    </span>
  );
}
