import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/siteUrl";

// Rebuilt at most once an hour, so new public decks show up without a deploy.
export const revalidate = 3600;

interface PublicDeck {
  id: string;
  publishedAt: string;
}

/** The fixed public pages plus the most recently published decks. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const pages: MetadataRoute.Sitemap = ["", "/explore", "/privacy", "/terms"].map((path) => ({ url: `${base}${path}` }));
  try {
    const backend = process.env.BACKEND_URL ?? "http://localhost:8080";
    const response = await fetch(`${backend}/api/explore?limit=100`, { next: { revalidate } });
    if (!response.ok) return pages;
    const decks = (await response.json()) as PublicDeck[];
    return [...pages, ...decks.map((deck) => ({ url: `${base}/explore/${deck.id}`, lastModified: deck.publishedAt }))];
  } catch {
    // The API is not reachable while the image is built; the next request after start fills the decks in.
    return pages;
  }
}
