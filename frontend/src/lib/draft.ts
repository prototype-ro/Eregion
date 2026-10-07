import type { DeckCardLine } from "./types";

/** Unsaved edits to a deck, kept on this device so a refresh, a crash or an ended session does not lose them. */
export interface Draft {
  lines: DeckCardLine[];
  /** Fingerprint of the saved version the edits started from. A draft for a version that has changed since is dropped. */
  baseSignature: string;
  savedAt: number;
}

const PREFIX = "eregion-draft:";

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

function defaultStore(): Store | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

const keyFor = (deckId: string, versionNumber: number) => `${PREFIX}${deckId}:${versionNumber}`;

/** Keeps the draft. Storage can be full or blocked, in which case the draft is simply not kept. */
export function saveDraft(deckId: string, versionNumber: number, baseSignature: string, lines: DeckCardLine[], store: Store | null = defaultStore(), now = Date.now()): void {
  try {
    const draft: Draft = { lines, baseSignature, savedAt: now };
    store?.setItem(keyFor(deckId, versionNumber), JSON.stringify(draft));
  } catch {
    // Not kept.
  }
}

/** The kept draft, or null when there is none, it is damaged, or the version it started from has changed. */
export function loadDraft(deckId: string, versionNumber: number, baseSignature: string, store: Store | null = defaultStore()): Draft | null {
  try {
    const raw = store?.getItem(keyFor(deckId, versionNumber));
    if (!raw) return null;
    const draft = JSON.parse(raw) as Draft;
    if (draft.baseSignature !== baseSignature || !Array.isArray(draft.lines) || draft.lines.length === 0 || typeof draft.savedAt !== "number") return null;
    return draft;
  } catch {
    return null;
  }
}

export function clearDraft(deckId: string, versionNumber: number, store: Store | null = defaultStore()): void {
  try {
    store?.removeItem(keyFor(deckId, versionNumber));
  } catch {
    // Nothing to do.
  }
}

/** Forgets every draft, for example on sign out, so the next person on a shared computer does not see them. */
export function clearAllDrafts(store: Store | null = defaultStore()): void {
  try {
    if (!store) return;
    const keys: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (key?.startsWith(PREFIX)) keys.push(key);
    }
    keys.forEach((key) => store.removeItem(key));
  } catch {
    // Nothing to do.
  }
}
