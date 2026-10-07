import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Card art comes from Scryfall's CDN, which is already optimized and refuses requests
    // from Next's server-side image optimizer (it requires a User-Agent). Browsers load
    // the images directly instead.
    unoptimized: true,
    remotePatterns: [{ protocol: "https", hostname: "cards.scryfall.io" }],
  },
};

export default nextConfig;
