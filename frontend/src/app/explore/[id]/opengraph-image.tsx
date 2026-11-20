/* eslint-disable @next/next/no-img-element */
import { ImageResponse } from "next/og";

export const alt = "A Commander deck on Eregion";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const backend = process.env.BACKEND_URL ?? "http://localhost:8080";

interface PublicDeck {
  name: string;
  ownerName: string;
  commanderName: string | null;
  artUrl: string | null;
  versionNumber: number;
  cardCount: number;
  priceUsd: number;
  bracket?: number | null;
  bracketName?: string | null;
}

/**
 * The picture a chat app or search result shows for a shared deck: the commander's art beside the deck's name and
 * the facts that tell decks apart (version, cards, bracket, price). Before this every preview was the bare art crop.
 */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let deck: PublicDeck | null = null;
  try {
    const response = await fetch(`${backend}/api/explore/${id}`, { next: { revalidate: 300 } });
    if (response.ok) deck = ((await response.json()) as { deck: PublicDeck }).deck;
  } catch {
    deck = null;
  }

  // Scryfall's CDN refuses requests without a User-Agent, so the art is fetched here and handed over as data.
  let art: string | null = null;
  if (deck?.artUrl) {
    try {
      const image = await fetch(deck.artUrl, { headers: { "User-Agent": "Eregion/0.1 (link preview)", Accept: "image/*" } });
      if (image.ok) art = `data:${image.headers.get("content-type") ?? "image/jpeg"};base64,${Buffer.from(await image.arrayBuffer()).toString("base64")}`;
    } catch {
      art = null;
    }
  }

  const facts = deck
    ? [
        `v${deck.versionNumber}`,
        `${deck.cardCount} cards`,
        deck.bracket ? (deck.bracket === 5 ? "cEDH" : `Bracket ${deck.bracket}`) : null,
        `$${Math.round(deck.priceUsd)}`,
      ].filter(Boolean)
    : [];

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#0a0a0a", color: "#f2f2f0" }}>
        {art ? (
          <img src={art} alt="" width={560} height={630} style={{ width: 560, height: 630, objectFit: "cover" }} />
        ) : (
          <div style={{ width: 560, height: 630, background: "#0b4e66" }} />
        )}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "56px 56px 48px" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.05, letterSpacing: -1 }}>{deck?.name ?? "A Commander deck"}</div>
            {deck && <div style={{ marginTop: 18, fontSize: 30, color: "#a8a8a2" }}>{deck.commanderName ?? "No commander"}</div>}
            {deck && <div style={{ marginTop: 8, fontSize: 26, color: "#a8a8a2" }}>{`by ${deck.ownerName}`}</div>}
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              {facts.map((fact) => (
                <div key={fact as string} style={{ fontSize: 26, padding: "8px 20px", borderRadius: 999, border: "2px solid #5db1cf", color: "#5db1cf" }}>
                  {fact}
                </div>
              ))}
            </div>
            <div style={{ marginTop: 30, fontSize: 30, fontWeight: 700 }}>Eregion</div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
