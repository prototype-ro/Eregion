import Link from "next/link";
import { formatPrice } from "@/lib/links";
import { foldedRoleCounts, knownRoles } from "@/lib/roles";
import type { DeckCardLine, DeckStats } from "@/lib/types";

interface Props {
  deckId: string;
  stats: DeckStats;
  /** Stats of the opened version, to show how the draft shifted. Null before the first save. */
  saved: DeckStats | null;
  savedVersion: number;
  removed: DeckCardLine[];
  showCollection: boolean;
  /** A page someone else's deck: no changes to compare against. */
  readOnly?: boolean;
}

/** The deck's numbers, in their own section under the cards so they read separately. */
export function StatsSection({ deckId, stats, saved, savedVersion, removed, showCollection, readOnly = false }: Props) {
  const maxCurve = Math.max(...stats.curve, 1);
  const shift = saved ? Math.round((stats.averageManaValue - saved.averageManaValue) * 100) / 100 : 0;

  return (
    <section aria-labelledby="stats-heading" className="border-t border-line pt-14 pb-24">
      <h2 id="stats-heading" className="font-display text-[clamp(56px,7vw,112px)] leading-[0.92]">
        Statistics
      </h2>

      <div className={`mt-10 grid gap-x-16 gap-y-14 md:grid-cols-2 ${readOnly ? "xl:grid-cols-[1fr_1.5fr_1fr]" : "xl:grid-cols-[1fr_1.5fr_1fr_1fr]"}`}>
        <div className="flex flex-col gap-10">
          <div>
            <p className="text-[15px] text-muted">Average mana value</p>
            <p className="mt-1.5 text-[clamp(64px,7vw,104px)] leading-none font-medium tracking-[-0.05em]">
              {stats.averageManaValue.toFixed(2)}
            </p>
            {saved && (
              <p className="mt-2 font-mono text-[13px] text-accent-text">
                {shift === 0 ? "same as" : shift < 0 ? `down ${Math.abs(shift).toFixed(2)} from` : `up ${shift.toFixed(2)} from`}{" "}
                v{savedVersion}, lands excluded
              </p>
            )}
          </div>
          {showCollection && (
          <div>
            <p className="text-[15px] text-muted">Your collection</p>
            <p className="mt-2 text-[clamp(40px,4vw,64px)] leading-none font-medium tracking-[-0.04em] whitespace-nowrap">
              {stats.owned} of {stats.totalCards}
            </p>
            <p className="mt-2 text-sm text-muted">owned. {stats.missing} still needed.</p>
          </div>
          )}
          <div>
            <p className="text-[15px] text-muted">Deck value</p>
            <p className="mt-2 text-[clamp(40px,4vw,64px)] leading-none font-medium tracking-[-0.04em] whitespace-nowrap">
              {formatPrice(stats.totalPriceUsd)}
            </p>
            <p className="mt-2 text-sm text-muted">Scryfall market prices, refreshed daily.</p>
          </div>
        </div>

        <div>
          <p className="mb-4 text-[15px] text-muted">Mana curve</p>
          <div className="flex h-[180px] items-end gap-3 border-b border-line">
            {stats.curve.map((count, value) => (
              <div key={value} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
                <span className="font-mono text-xs text-muted">{count || ""}</span>
                <div className="w-full rounded-t-md bg-accent-text" style={{ height: `${Math.round((count / maxCurve) * 130)}px` }} />
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-3 font-mono text-xs text-muted">
            {stats.curve.map((_, value) => (
              <span key={value} className="min-w-0 flex-1 text-center">
                {value === 6 ? "6+" : value}
              </span>
            ))}
          </div>
        </div>

        <div>
          <p className="border-b border-line pb-2.5 text-[15px] text-muted">Card types</p>
          <ul>
            {Object.entries(stats.types).map(([type, count]) => (
              <li key={type} className="flex justify-between py-2.5 text-[15px]">
                <span>{type}</span>
                <span className="font-mono text-[13px] text-muted">{count}</span>
              </li>
            ))}
          </ul>
          {knownRoles(stats.roles).length > 0 && (
            <>
              <p className="mt-6 border-b border-line pb-2.5 text-[15px] text-muted">Roles</p>
              <ul>
                {Object.entries(foldedRoleCounts(stats.roles)).map(([role, count]) => (
                  <li key={role} className="flex justify-between py-2.5 text-[15px]">
                    <span className={role === "Uncategorized" ? "text-muted" : ""}>{role}</span>
                    <span className="font-mono text-[13px] text-muted">{count}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {!readOnly && (
        <div>
          <div className="flex items-baseline justify-between border-b border-line pb-2.5">
            <p className="text-[15px] text-muted">{saved ? `Removed since v${savedVersion}` : "Removed"}</p>
            {saved && (
              <Link href={`/decks/${deckId}/diff`} className="-my-3 inline-flex min-h-9 [@media(pointer:coarse)]:min-h-11 min-w-11 items-center justify-center text-sm text-accent-text">
                Full diff
              </Link>
            )}
          </div>
          {removed.length === 0 ? (
            <p className="py-3 text-sm text-muted">Nothing removed.</p>
          ) : (
            <ul>
              {removed.map((line) => (
                <li key={`${line.cardId}|${line.board}`} className="flex justify-between py-2.5 text-[15px] text-muted line-through">
                  <span>{line.name}</span>
                  <span className="font-mono text-[13px]">{line.quantity > 1 ? `${line.quantity}x` : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        )}
      </div>
    </section>
  );
}
