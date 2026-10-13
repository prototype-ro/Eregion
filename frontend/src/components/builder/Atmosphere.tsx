"use client";

/**
 * The commander's colors, spilled into the page as soft light. Which parts show is set by `data-atmosphere` on the root element
 * (off, header, accents or page), so the levels can be compared on the real page. Colorless shows nothing.
 */

const MANA: Record<string, string> = {
  W: "oklch(0.93 0.05 95)",
  U: "oklch(0.72 0.14 245)",
  B: "oklch(0.55 0.1 305)",
  R: "oklch(0.7 0.2 28)",
  G: "oklch(0.72 0.17 150)",
};

const ORDER = "WUBRG";
const HEADER_SPOTS: Array<[string, string]> = [["-6%", "-35%"], ["26%", "-48%"], ["58%", "-40%"], ["88%", "-44%"], ["46%", "-22%"]];
const PAGE_SPOTS: Array<[string, string]> = [["-10%", "-12%"], ["30%", "-18%"], ["60%", "-14%"], ["92%", "-10%"], ["50%", "30%"]];

/** The first color of the identity, for borders and other accents. */
export function atmosphereAccent(identity: string): string | undefined {
  const letter = ORDER.split("").find((l) => identity.includes(l));
  return letter ? MANA[letter] : undefined;
}

function Spots({ identity, spots, size, opacity }: { identity: string; spots: Array<[string, string]>; size: number; opacity: number }) {
  return (
    <>
      {ORDER.split("").map((letter, index) => (
        <span
          key={letter}
          aria-hidden="true"
          className="absolute rounded-full blur-3xl transition-opacity duration-700"
          style={{ left: spots[index][0], top: spots[index][1], width: size, height: size, background: MANA[letter], opacity: identity.includes(letter) ? opacity : 0 }}
        />
      ))}
    </>
  );
}

/** Behind the deck name and the commander art. */
export function HeaderAtmosphere({ identity }: { identity: string }) {
  return (
    <div aria-hidden="true" className="atm-header art-clip pointer-events-none absolute top-0 left-1/2 z-0 h-[520px] w-screen -translate-x-1/2 overflow-hidden">
      <Spots identity={identity} spots={HEADER_SPOTS} size={420} opacity={0.34} />
    </div>
  );
}

/** A faint wash behind the whole page, fixed in place while the page scrolls. */
export function PageAtmosphere({ identity }: { identity: string }) {
  return (
    <div aria-hidden="true" className="atm-page pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <Spots identity={identity} spots={PAGE_SPOTS} size={520} opacity={0.14} />
    </div>
  );
}
