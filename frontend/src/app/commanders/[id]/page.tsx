import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CardArt } from "@/components/CardArt";
import { Nav } from "@/components/Nav";
import { PublicDeckCard } from "@/components/PublicDeckCard";
import { backendFetch } from "@/lib/backend";
import { exploreCommanderUrl } from "@/lib/links";
import type { PublicDeck } from "@/lib/types";

/** Below this many decks a commander page is thin, so search engines are asked not to index it. */
const INDEX_FROM = 3;

async function decksWith(id: string): Promise<PublicDeck[]> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return [];
  const response = await backendFetch(`/api/explore?commander=${id}&limit=48`, { cache: "no-store" }).catch(() => null);
  return response?.ok ? ((await response.json()) as PublicDeck[]) : [];
}

const commanderName = (decks: PublicDeck[], id: string) =>
  decks.find((deck) => deck.commanderId === id)?.commanderName?.split(" + ")[0] ?? decks[0].commanderName ?? "Commander";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const decks = await decksWith(id);
  if (decks.length === 0) return { title: "Commander" };
  const name = commanderName(decks, id);
  return {
    title: `${name} decks · Eregion`,
    description: `${decks.length} shared ${name} Commander ${decks.length === 1 ? "deck" : "decks"}, each with its bracket, analysis and the history of how it was built.`,
    robots: decks.length < INDEX_FROM ? { index: false, follow: true } : undefined,
  };
}

/** Every shared deck led by one commander: the page people search for ("Atraxa decks"). */
export default async function CommanderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const decks = await decksWith(id);
  if (decks.length === 0) notFound();
  const name = commanderName(decks, id);
  const art = decks.find((deck) => deck.commanderId === id)?.artUrl ?? null;
  return (
    <div className="shell">
      <Nav active="explore" />
      <main id="main" tabIndex={-1} className="pb-24">
        <div className="flex flex-wrap items-end gap-8 pt-14 pb-10">
          {art && <CardArt src={art} alt={`${name} card art`} sizes="240px" className="aspect-[4/5] w-40 rounded-card" priority />}
          <div>
            <h1 className="font-display text-[clamp(48px,8vw,112px)] leading-[0.92]">{name}</h1>
            <p className="mt-3 text-lg text-muted">
              {decks.length} shared {decks.length === 1 ? "deck" : "decks"}.{" "}
              <Link href={exploreCommanderUrl(id)} className="text-accent-text underline underline-offset-4">
                Filter them on Explore
              </Link>
            </p>
          </div>
        </div>
        <ul className="grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-6">
          {decks.map((deck) => (
            <PublicDeckCard key={deck.id} deck={deck} />
          ))}
        </ul>
      </main>
    </div>
  );
}
