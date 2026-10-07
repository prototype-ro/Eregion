import { NextResponse, type NextRequest } from "next/server";

/**
 * Forwards /api to the backend. This reads BACKEND_URL when the server starts, unlike a rewrite in
 * next.config, which is fixed when the site is built. The same image can then run against any backend.
 * The browser only ever talks to this site, so the login cookie stays first party.
 */
export function proxy(request: NextRequest) {
  const backend = process.env.BACKEND_URL ?? "http://localhost:8080";
  return NextResponse.rewrite(new URL(request.nextUrl.pathname + request.nextUrl.search, backend));
}

export const config = { matcher: "/api/:path*" };
