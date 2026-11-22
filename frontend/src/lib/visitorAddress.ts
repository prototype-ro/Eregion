/**
 * The visitor's address as the host in front of this site reports it. Vercel sets x-real-ip and replaces any
 * x-forwarded-for the visitor sent; Caddy, in the Docker setup, writes x-forwarded-for itself.
 */
export function visitorAddress(headers: Headers): string | null {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  const first = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return first || null;
}
