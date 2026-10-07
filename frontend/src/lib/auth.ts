import { api } from "./api";
import { clearAllDrafts } from "./draft";

/** Ends the session. The server expires the httpOnly login cookie. */
export async function signOut(): Promise<void> {
  await api("/api/auth/logout", { method: "POST" });
  // Unsaved edits belong to the person who made them, not to whoever uses this browser next.
  clearAllDrafts();
}

/** The sign in page, remembering where to come back to. Only a path of this site is ever passed on. */
export function loginUrl(): string {
  const here = typeof window === "undefined" ? "" : window.location.pathname + window.location.search;
  return here && here !== "/login" ? `/login?next=${encodeURIComponent(here)}` : "/login";
}
