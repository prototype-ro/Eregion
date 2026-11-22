import { headers } from "next/headers";
import { visitorAddress } from "./visitorAddress";

const backend = process.env.BACKEND_URL ?? "http://localhost:8080";
const secret = process.env.EREGION_PROXY_SECRET;

/**
 * What a call from the site's own server tells the API about who it is for. The visitor's address goes along as
 * X-Forwarded-For (as the /api proxy sends it), so the API's per-visitor rate limits count the visitor and not this
 * server. When the API runs on another host (the site on Vercel), the shared secret goes too: the API's proxy turns
 * away calls without it, and the API then believes the visitor's address from X-Eregion-Client-Ip.
 */
export function siteHeaders(visitor: string | null): Record<string, string> {
  const sent: Record<string, string> = {};
  if (visitor) sent["x-forwarded-for"] = visitor;
  if (secret) {
    sent["x-eregion-proxy"] = secret;
    if (visitor) sent["x-eregion-client-ip"] = visitor;
  }
  return sent;
}

/** A request from the site's own server to the API, for pages rendered on the server and for the sitemap. */
export async function backendFetch(path: string, init: RequestInit & { next?: { revalidate?: number } } = {}): Promise<Response> {
  let visitor: string | null = null;
  try {
    visitor = visitorAddress(await headers());
  } catch {
    // Outside a request (a build, the sitemap), there is no visitor to name.
  }
  return fetch(`${backend}${path}`, {
    ...init,
    headers: { ...(init.headers as Record<string, string> | undefined), ...siteHeaders(visitor) },
  });
}
