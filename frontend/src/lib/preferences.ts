"use client";

import { useEffect, useState } from "react";
import { api } from "./api";

/** How the signed in player likes the site to behave, kept on their account. */
export interface Preferences {
  /** The timeline offers variants (branches) and merging. Off until the player turns it on in Account. */
  variantsEnabled: boolean;
}

const DEFAULT: Preferences = { variantsEnabled: false };
let cached: Promise<Preferences> | null = null;
const listeners = new Set<(value: Preferences) => void>();

/** Asked once per page load and shared; a change made in Account reaches every component that uses it. */
export function usePreferences(): Preferences {
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT);
  useEffect(() => {
    cached ??= api<Preferences>("/api/account/preferences").catch(() => {
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
  return preferences;
}

/** Saves a change on the account, then tells every component using the preferences. */
export async function setVariants(enabled: boolean): Promise<Preferences> {
  const saved = await api<Preferences>("/api/account/preferences", { method: "PUT", body: { variantsEnabled: enabled } });
  cached = Promise.resolve(saved);
  listeners.forEach((listen) => listen(saved));
  return saved;
}
