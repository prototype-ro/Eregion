"use client";

/* eslint-disable @next/next/no-img-element */
import { Shuffle } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { Dialog } from "@/components/Dialog";
import { ApiError } from "@/lib/api";
import { type Backdrop, chooseBackdrop, clearBackdrop, randomArtSeries, searchArtSeries } from "@/lib/backdrop";
import { btn, field } from "@/lib/ui";

interface Props {
  open: boolean;
  onClose: () => void;
  deckId: string;
  /** The chosen Art Series card, or null while the deck shows its commander's art. */
  current: Backdrop | null;
  /** The commander's art, shown as the first choice; null when the deck has no commander yet. */
  commanderArt: string | null;
  onChanged: (backdrop: Backdrop | null) => void;
}

/** Chooses the art behind the deck's header: the commander's, or an Art Series card from a shuffled few or found by name. */
export function BackdropDialog(props: Props) {
  return (
    <Dialog open={props.open} onClose={props.onClose} label="Backdrop" size="lg">
      {props.open && <Body {...props} />}
    </Dialog>
  );
}

function Body({ onClose, deckId, current, commanderArt, onChanged }: Props) {
  const [offered, setOffered] = useState<Backdrop[] | null>(null);
  const [shuffling, setShuffling] = useState(false);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Backdrop[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Four Art Series cards at random: most players know none of them by name.
  const shuffle = useCallback(() => {
    setShuffling(true);
    setError(null);
    randomArtSeries(4)
      .then(setOffered)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load Art Series cards."))
      .finally(() => setShuffling(false));
  }, []);
  useEffect(() => shuffle(), [shuffle]);

  // A name search waits a moment after typing stops, so each keystroke does not reach Scryfall.
  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) {
      setFound(null);
      return;
    }
    let live = true;
    const timer = setTimeout(() => {
      setSearching(true);
      setError(null);
      searchArtSeries(text)
        .then((list) => live && setFound(list))
        .catch((err) => live && setError(err instanceof ApiError ? err.message : "Could not search Art Series cards."))
        .finally(() => live && setSearching(false));
    }, 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query]);

  async function pick(choice: Backdrop | null) {
    setBusy(true);
    setError(null);
    try {
      if (choice) onChanged((await chooseBackdrop(deckId, choice.scryfallId)).backdrop);
      else {
        await clearBackdrop(deckId);
        onChanged(null);
      }
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not change the backdrop.");
      setBusy(false);
    }
  }

  // Each use sets its width: the grid cells fill their column, the commander tile stays one column wide.
  const tile = "group flex flex-col gap-2 rounded-2xl p-1.5 text-left transition-colors hover:bg-surface disabled:opacity-50";
  const cards = (list: Backdrop[]) => (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {list.map((art) => {
        const chosen = current?.scryfallId === art.scryfallId;
        return (
          <li key={art.scryfallId}>
            <button type="button" disabled={busy} aria-pressed={chosen} onClick={() => void pick(art)} className={`${tile} w-full`}>
              <img src={art.artUrl} alt="" className={`aspect-[4/3] w-full rounded-xl bg-surface object-cover ${chosen ? "ring-2 ring-accent-text" : ""}`} />
              <span className="px-1 text-sm leading-snug">
                {art.name}
                <span className="block text-xs text-muted">{[art.setName, art.artist && `art by ${art.artist}`].filter(Boolean).join(", ")}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
  const searchingByName = query.trim().length >= 2;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-display text-[44px] leading-none">Backdrop</h2>
        <p className="mt-2 text-[15px] text-muted">The art behind this deck&rsquo;s name, here and on its public page.</p>
      </div>

      <section aria-labelledby="backdrop-commander" className="flex flex-col gap-3">
        <h3 id="backdrop-commander" className="text-sm text-muted">
          Commander art
        </h3>
        {commanderArt ? (
          <button type="button" disabled={busy} onClick={() => void pick(null)} aria-pressed={current === null} className={`${tile} w-[calc((100%-1.5rem)/4)] min-w-40`}>
            <img src={commanderArt} alt="" className={`aspect-[4/3] w-full rounded-xl object-cover ${current === null ? "ring-2 ring-accent-text" : ""}`} />
            <span className="px-1 text-sm">{current === null ? "In use" : "Use the commander's art"}</span>
          </button>
        ) : (
          <p className="text-[15px] text-muted">Choose a commander for the deck to use its art.</p>
        )}
      </section>

      <section aria-labelledby="backdrop-art-series" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 id="backdrop-art-series" className="text-sm text-muted">
            {searchingByName ? "Art Series cards with that name" : "Art Series cards"}
          </h3>
          {!searchingByName && (
            <button type="button" disabled={shuffling || busy} onClick={shuffle} className={btn.secondary}>
              <Shuffle size={16} aria-hidden />
              {shuffling ? "Shuffling" : "Shuffle"}
            </button>
          )}
        </div>
        {error && (
          <p role="alert" className="rounded-2xl border border-danger-line bg-danger/10 px-4 py-3 text-sm text-ink">
            {error}
          </p>
        )}
        <p role="status" className="sr-only">
          {searching || shuffling ? "Loading cards" : ""}
        </p>
        {searchingByName ? (
          found === null || searching ? (
            <p className="text-sm text-muted">Searching</p>
          ) : found.length === 0 ? (
            <p className="text-sm text-muted">No Art Series card has that name.</p>
          ) : (
            cards(found)
          )
        ) : offered === null ? (
          <p className="text-sm text-muted">Finding Art Series cards</p>
        ) : (
          <div className={shuffling ? "opacity-50 transition-opacity" : "transition-opacity"}>{cards(offered)}</div>
        )}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="art-series-search" className="text-sm text-muted">
            Or search by card name
          </label>
          <input
            id="art-series-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Wurmcoil Engine"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className={`${field.md} sm:max-w-sm`}
          />
        </div>
      </section>

      <div>
        <button type="button" onClick={onClose} className={btn.large.secondary}>
          Close
        </button>
      </div>
    </div>
  );
}
