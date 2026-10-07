import { api } from "./api";

/** Ends the session. The server expires the httpOnly login cookie. */
export async function signOut(): Promise<void> {
  await api("/api/auth/logout", { method: "POST" });
}
