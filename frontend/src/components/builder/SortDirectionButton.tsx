import type { SortDirection } from "@/lib/groups";

/** An arrow that points up for ascending and down for descending. Pressing it flips the order. */
export function SortDirectionButton({ direction, onFlip }: { direction: SortDirection; onFlip: () => void }) {
  const ascending = direction === "asc";
  return (
    <button
      type="button"
      onClick={onFlip}
      aria-label={ascending ? "Ascending. Switch to descending" : "Descending. Switch to ascending"}
      title={ascending ? "Ascending" : "Descending"}
      data-direction={direction}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-ink hover:border-ink focus-visible:border-ink focus-visible:outline-none"
    >
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {ascending ? <path d="M9 15V3M4 8l5-5 5 5" /> : <path d="M9 3v12M4 10l5 5 5-5" />}
      </svg>
    </button>
  );
}
