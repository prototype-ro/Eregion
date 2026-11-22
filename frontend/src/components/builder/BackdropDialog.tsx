"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { Dialog } from "@/components/Dialog";
import { ApiError } from "@/lib/api";
import { type Backdrop, chooseBackdrop, clearBackdrop, searchArtSeries } from "@/lib/backdrop";
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

/** Chooses the art behind the deck's header: the commander's, or an Art Series card found by name. */
export function BackdropDialog(props: Props) {
  return (
    <Dialog open={props.open} onClose={props.onClose} label="Backdrop" size="lg">
      {props.open && <Body {...props} />}
    </Dialog>
  );
}

function Body({ onClose, deckId, current, commanderArt, onChanged }: Props) {
  const [query, setQuery] = useState(current?.name ?? "");
  const [found, setFound] = useState<Backdrop[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Searches a moment after typing stops, so each keystroke does not reach Scryfall.
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

  const tile = "group flex flex-col gap-2 rounded-2xl p-1.5 text-left transition-colors hover:bg-surface disabled:opacity-50";
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
          <button type="button" disabled={busy} onClick={() => void pick(null)} aria-pressed={current === null} className={`${tile} w-56`}>
            <img src={commanderArt} alt="" className={`aspect-[4/3] w-full rounded-xl object-cover ${current === null ? "ring-2 ring-accent-text" : ""}`} />
            <span className="px-1 text-sm">{current === null ? "In use" : "Use the commander's art"}</span>
          </button>
        ) : (
          <p className="text-[15px] text-muted">Choose a commander for the deck to use its art.</p>
        )}
      </section>

      <section aria-labelledby="backdrop-art-series" className="flex flex-col gap-3">
        <h3 id="backdrop-art-series" className="text-sm text-muted">
          Art Series card
        </h3>
        <label htmlFor="art-series-search" className="sr-only">
          Search Art Series cards by name
        </label>
        <input
          id="art-series-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by card name"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className={`${field.md} sm:max-w-sm`}
        />
        <p role="status" className="text-sm text-muted">
          {searching ? "Searching" : found && found.length === 0 ? "No Art Series card has that name." : ""}
        </p>
        {error && (
          <p role="alert" className="rounded-2xl border border-danger-line bg-danger/10 px-4 py-3 text-sm text-ink">
            {error}
          </p>
        )}
        {found && found.length > 0 && (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {found.map((art) => {
              const chosen = current?.scryfallId === art.scryfallId;
              return (
                <li key={art.scryfallId}>
                  <button type="button" disabled={busy} aria-pressed={chosen} onClick={() => void pick(art)} className={`${tile} w-full`}>
                    <img src={art.artUrl} alt="" className={`aspect-[4/3] w-full rounded-xl object-cover ${chosen ? "ring-2 ring-accent-text" : ""}`} />
                    <span className="px-1 text-sm leading-snug">
                      {art.name}
                      <span className="block text-xs text-muted">{[art.setName, art.artist && `art by ${art.artist}`].filter(Boolean).join(", ")}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div>
        <button type="button" onClick={onClose} className={btn.large.secondary}>
          Close
        </button>
      </div>
    </div>
  );
}
