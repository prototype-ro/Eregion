import type { NextConfig } from "next";

// Where the Spring Boot API runs. Only the Next server reads this.
const backend = process.env.BACKEND_URL ?? "http://localhost:8080";

const nextConfig: NextConfig = {
  images: {
    // Card art comes from Scryfall's CDN, which is already optimized and refuses requests
    // from Next's server-side image optimizer (it requires a User-Agent). Browsers load
    // the images directly instead.
    unoptimized: true,
    remotePatterns: [{ protocol: "https", hostname: "cards.scryfall.io" }],
  },
  // The browser only ever talks to this site. Next forwards /api to the backend, which makes the
  // httpOnly login cookie first party, so it needs no cross-site cookie settings.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
  experimental: {
    // Importing a long list can take a while on the backend. The default proxy limit is 30 seconds.
    proxyTimeout: 120_000,
  },
};

export default nextConfig;
