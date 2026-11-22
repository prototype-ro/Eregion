import { NextResponse, type NextRequest } from "next/server";
import { visitorAddress } from "@/lib/visitorAddress";

/**
 * Forwards /api to the backend. This reads BACKEND_URL when the server starts, unlike a rewrite in
 * next.config, which is fixed when the site is built. The same image can then run against any backend.
 * The browser only ever talks to this site, so the login cookie stays first party.
 *
 * When the site and the API run on different hosts (the site on Vercel), the API only sees this proxy's
 * address. EREGION_PROXY_SECRET, shared with the API, lets the proxy say who the visitor is: the API believes
 * X-Eregion-Client-Ip only when the secret comes with it, and the API's own proxy turns away calls without it.
 */
export function proxy(request: NextRequest) {
  const backend = process.env.BACKEND_URL ?? "http://localhost:8080";
  const target = new URL(request.nextUrl.pathname + request.nextUrl.search, backend);
  const secret = process.env.EREGION_PROXY_SECRET;
  if (!secret) return NextResponse.rewrite(target);

  const headers = new Headers(request.headers);
  headers.set("x-eregion-proxy", secret);
  const visitor = visitorAddress(request.headers);
  if (visitor) headers.set("x-eregion-client-ip", visitor);
  else headers.delete("x-eregion-client-ip");
  return NextResponse.rewrite(target, { request: { headers } });
}

export const config = { matcher: "/api/:path*" };
