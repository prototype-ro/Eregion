/** EDHREC's page slug for a card: lowercase, no accents or punctuation, words joined by hyphens. */
export function edhrecSlug(cardName: string): string {
  const front = cardName.split(" // ")[0];
  return front
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’,]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const edhrecCardUrl = (name: string) => `https://edhrec.com/cards/${edhrecSlug(name)}`;
export const edhrecCommanderUrl = (name: string) => `https://edhrec.com/commanders/${edhrecSlug(name)}`;

export function formatPrice(value: number | null | undefined): string {
  if (value === null || value === undefined) return "No price";
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/** A card can lead a deck when it is legendary. This is a hint for showing the commander link, not a legality check. */
export const canBeCommander = (typeLine: string) => typeLine.includes("Legendary");

/** Public decks that use this card as a commander. */
export const exploreCommanderUrl = (cardId: string) => `/explore?commander=${cardId}`;

/** Colors in the game's own order: white, blue, black, red, green. */
export const sortColors = (identity: string) => "WUBRG".split("").filter((color) => identity.includes(color)).join("");

/** Where a custom art's image is served from. */
export const customArtUrl = (id: string) => `/api/custom-printings/${id}/image`;
