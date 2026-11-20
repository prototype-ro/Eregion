import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Nav } from "@/components/Nav";
import { PublicDeckCard } from "@/components/PublicDeckCard";
import { backendFetch } from "@/lib/backend";
import type { PublicDeck } from "@/lib/types";

async function decksOf(id: string): Promise<PublicDeck[]> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return [];
  const response = await backendFetch(`/api/explore?owner=${id}&limit=48`, { cache: "no-store" }).catch(() => null);
  return response?.ok ? ((await response.json()) as PublicDeck[]) : [];
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const decks = await decksOf((await params).id);
  if (decks.length === 0) return { title: "Player" };
  const name = decks[0].ownerName;
  return { title: `${name}'s decks · Eregion`, description: `${decks.length} Commander ${decks.length === 1 ? "deck" : "decks"} shared by ${name}, each with its history.` };
}

/** A player's shared decks, newest first. A player with none shared has no page, so nothing about them shows. */
export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const decks = await decksOf((await params).id);
  if (decks.length === 0) notFound();
  return (
    <div className="shell">
      <Nav active="explore" />
      <main id="main" tabIndex={-1} className="pb-24">
        <h1 className="pt-16 pb-3 font-display text-[clamp(56px,10vw,140px)] leading-[0.9]">{decks[0].ownerName}</h1>
        <p className="pb-10 text-lg text-muted">
          {decks.length} shared {decks.length === 1 ? "deck" : "decks"}
        </p>
        <ul className="grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-6">
          {decks.map((deck) => (
            <PublicDeckCard key={deck.id} deck={deck} />
          ))}
        </ul>
      </main>
    </div>
  );
}
