import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/siteUrl";

/** Public pages may be indexed. Signed-in pages and the API have nothing for a search engine. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/decks", "/account", "/collection", "/dev/", "/admin", "/unsubscribe", "/reset-password", "/verify-email"] }],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
