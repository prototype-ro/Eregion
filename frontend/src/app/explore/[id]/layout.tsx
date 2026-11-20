import type { Metadata } from "next";
import { notFound } from "next/navigation";

const backend = process.env.BACKEND_URL ?? "http://localhost:8080";

interface PublicDeck {
  deck: {
    name: string;
    ownerName: string;
    commanderName: string | null;
    artUrl: string | null;
    description: string;
    versionNumber: number;
    cardCount: number;
    bracket?: number | null;
  };
}

/**
 * The link preview of a shared deck: its name, owner, commander and art, read on the server so chat apps and
 * search engines see it without running the page. A deck that is private or gone gets a plain title.
 */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { title: "Deck" };
  try {
    const response = await fetch(`${backend}/api/explore/${id}`, { next: { revalidate: 60 } });
    if (!response.ok) return { title: "Deck" };
    const { deck } = (await response.json()) as PublicDeck;
    const title = `${deck.name} by ${deck.ownerName}`;
    // Facts first, so every preview says something that sets this deck apart; the owner's own words follow.
    const bracket = deck.bracket ? (deck.bracket === 5 ? ", cEDH" : `, bracket ${deck.bracket}`) : "";
    const facts = `${deck.commanderName ?? "Commander deck"}, version ${deck.versionNumber}, ${deck.cardCount} cards${bracket}.`;
    const description = deck.description ? `${facts} ${deck.description}`.slice(0, 200) : `${facts} See how it got here on Eregion.`;
    // The picture comes from opengraph-image.tsx next to this file.
    return {
      title,
      description,
      openGraph: { title, description, type: "website" },
      twitter: { card: "summary_large_image", title, description },
    };
  } catch {
    return { title: "Deck" };
  }
}

/**
 * A deck that is private, deleted or never existed answers a real 404, so search engines drop it and link
 * previews do not show an empty deck page. If the API cannot be reached, the page renders and shows its own error.
 */
export default async function Layout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const status = await fetch(`${backend}/api/explore/${id}`, { cache: "no-store" }).then(
    (response) => response.status,
    () => null,
  );
  if (status === 404) notFound();
  return children;
}
