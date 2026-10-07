import { api } from "./api";
import type { User } from "./types";

/** The signed in player, asked for once and shared by everything on the page that needs it. */
let cached: Promise<User | null> | null = null;
const listeners = new Set<() => void>();

export function getMe(): Promise<User | null> {
  cached ??= api<User>("/api/me").catch(() => null);
  return cached;
}

/** Forget what is known, for example after verifying the email or signing out, and tell whoever is showing it. */
export function refreshMe(): void {
  cached = null;
  listeners.forEach((listener) => listener());
}

export function onMeChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
