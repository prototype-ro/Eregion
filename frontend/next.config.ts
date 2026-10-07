import type { NextConfig } from "next";

// Where the Spring Boot API runs. Only the Next server reads this.
const backend = process.env.BACKEND_URL ?? "http://localhost:8080";

const dev = process.env.NODE_ENV !== "production";

// What the browser may load. Scripts and styles need 'unsafe-inline' for the data Next puts in the page and
// the theme script that runs before first paint. Development also needs eval and a socket for hot reload.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://cards.scryfall.io",
  "font-src 'self' data:",
  `connect-src 'self'${dev ? " ws: wss:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(dev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // Only over HTTPS, so a local http server is never told to insist on it.
  ...(dev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  // A self-contained server for the Docker image.
  output: "standalone",
  images: {
    // Card art comes from Scryfall's CDN, which is already optimized and refuses requests
    // from Next's server-side image optimizer (it requires a User-Agent). Browsers load
    // the images directly instead.
    unoptimized: true,
    remotePatterns: [{ protocol: "https", hostname: "cards.scryfall.io" }],
  },
  // The browser only ever talks to this site. Next forwards /api to the backend, which makes the
  // httpOnly login cookie first party, so it needs no cross-site cookie settings.
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
  experimental: {
    // Importing a long list can take a while on the backend. The default proxy limit is 30 seconds.
    proxyTimeout: 120_000,
  },
};

export default nextConfig;
