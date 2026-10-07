const KEY = "eregion-token";

// The token lives in localStorage for now. That is simple but readable by any script on
// the page, so moving it into an httpOnly cookie behind a Next route handler is the
// planned hardening step before this goes public.
export function getToken(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(KEY, token);
  } catch {
    // Storage blocked: the user stays signed in only until the page reloads.
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
