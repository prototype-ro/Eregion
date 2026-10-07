import { api } from "./api";

/** Ends the session. The server expires the httpOnly login cookie. */
export async function signOut(): Promise<void> {
  await api("/api/auth/logout", { method: "POST" });
}

/** The sign in page, remembering where to come back to. Only a path of this site is ever passed on. */
export function loginUrl(): string {
  const here = typeof window === "undefined" ? "" : window.location.pathname + window.location.search;
  return here && here !== "/login" ? `/login?next=${encodeURIComponent(here)}` : "/login";
}
