import { api } from "./api";

/** An Art Series card chosen to sit behind a deck's header. */
export interface Backdrop {
  scryfallId: string;
  name: string;
  artist: string | null;
  setName: string | null;
  artUrl: string;
}

/** Art Series cards whose name contains q. */
export const searchArtSeries = (q: string) => api<Backdrop[]>(`/api/art-series?q=${encodeURIComponent(q)}`);

/** A few Art Series cards at random, for players who know none by name. */
export const randomArtSeries = (count = 4) => api<Backdrop[]>(`/api/art-series/random?count=${count}`);

/** The deck's chosen art, or null while it shows its commander's. */
export const deckBackdrop = (deckId: string) => api<{ backdrop: Backdrop | null }>(`/api/decks/${deckId}/backdrop`);

export const chooseBackdrop = (deckId: string, scryfallId: string) =>
  api<{ backdrop: Backdrop }>(`/api/decks/${deckId}/backdrop`, { method: "PUT", body: { scryfallId } });

/** Back to the commander's art. */
export const clearBackdrop = (deckId: string) => api<void>(`/api/decks/${deckId}/backdrop`, { method: "DELETE" });
