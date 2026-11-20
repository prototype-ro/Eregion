import { headers } from "next/headers";

const backend = process.env.BACKEND_URL ?? "http://localhost:8080";

/**
 * A request from the site's own server to the API, for pages rendered on the server. The visitor's address goes
 * along as X-Forwarded-For (as the /api proxy already sends it), so the API's per-visitor rate limits count the
 * visitor and not this server, which would otherwise put every page view on the site into one bucket.
 */
export async function backendFetch(path: string, init: RequestInit & { next?: { revalidate?: number } } = {}): Promise<Response> {
  let forwarded: string | null = null;
  try {
    forwarded = (await headers()).get("x-forwarded-for");
  } catch {
    // Outside a request (a build), there is no visitor to name.
  }
  return fetch(`${backend}${path}`, {
    ...init,
    headers: { ...(init.headers as Record<string, string> | undefined), ...(forwarded ? { "x-forwarded-for": forwarded } : {}) },
  });
}
