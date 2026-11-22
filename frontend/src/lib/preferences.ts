"use client";

import { useEffect, useState } from "react";
import { api } from "./api";

/** How the signed in player likes the site to behave, kept on their account. */
export interface Preferences {
  /** The timeline offers variants (branches) and merging. Off until the player turns it on in Account. */
  variantsEnabled: boolean;
  /** The player finished or skipped the deck page tour, so it is no longer offered. */
  tourDone: boolean;
}

const DEFAULT: Preferences = { variantsEnabled: false, tourDone: false };
let cached: Promise<Preferences> | null = null;
let known: Preferences | null = null;
const listeners = new Set<(value: Preferences) => void>();

/** Asked once per page load and shared; a change reaches every component using it. loaded is false until the account answered. */
export function usePreferences(): Preferences & { loaded: boolean } {
  const [preferences, setPreferences] = useState<Preferences | null>(known);
  useEffect(() => {
    cached ??= api<Preferences>("/api/account/preferences")
      .then((value) => (known = value))
      .catch(() => {
        cached = null;
        return DEFAULT;
      });
    let live = true;
    void cached.then((value) => live && setPreferences(value));
    const listen = (value: Preferences) => live && setPreferences(value);
    listeners.add(listen);
    return () => {
      live = false;
      listeners.delete(listen);
    };
  }, []);
  return { ...(preferences ?? DEFAULT), loaded: preferences !== null };
}

/** Saves the settings given, leaving the others as they are, then tells every component using the preferences. */
export async function savePreferences(change: Partial<Preferences>): Promise<Preferences> {
  const saved = await api<Preferences>("/api/account/preferences", { method: "PUT", body: change });
  known = saved;
  cached = Promise.resolve(saved);
  listeners.forEach((listen) => listen(saved));
  return saved;
}

export const setVariants = (enabled: boolean) => savePreferences({ variantsEnabled: enabled });
