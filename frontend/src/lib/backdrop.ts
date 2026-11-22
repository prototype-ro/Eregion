import { api } from "./api";

/** A card's art chosen to sit behind a deck's header. */
export interface Backdrop {
  scryfallId: string;
  name: string;
  artist: string | null;
  setName: string | null;
  artUrl: string;
}

/** Cards whose name contains q, with their art. */
export const searchCardArt = (q: string) => api<Backdrop[]>(`/api/card-art?q=${encodeURIComponent(q)}`);

/** A few cards' art at random, to choose from without knowing names. */
export const randomCardArt = (count = 4) => api<Backdrop[]>(`/api/card-art/random?count=${count}`);

/** The deck's chosen art, or null while it shows its commander's. */
export const deckBackdrop = (deckId: string) => api<{ backdrop: Backdrop | null }>(`/api/decks/${deckId}/backdrop`);

export const chooseBackdrop = (deckId: string, scryfallId: string) =>
  api<{ backdrop: Backdrop }>(`/api/decks/${deckId}/backdrop`, { method: "PUT", body: { scryfallId } });

/** Back to the commander's art. */
export const clearBackdrop = (deckId: string) => api<void>(`/api/decks/${deckId}/backdrop`, { method: "DELETE" });
