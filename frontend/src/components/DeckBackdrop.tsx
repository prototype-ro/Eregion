/* eslint-disable @next/next/no-img-element */

// The art fades out toward the left, where the deck's title sits, and toward the bottom, into the page.
const FADE = "linear-gradient(to right, transparent 0%, black 45%), linear-gradient(to bottom, black 40%, transparent 100%)";
// The page's side padding (.shell in globals.css). The art reaches past it to the screen's edge instead of stopping short.
const BLEED = "calc(-1 * clamp(20px, 3.4vw, 80px))";

/**
 * The art behind a deck's header: the owner's Art Series card, or the commander's art. Decorative, since the title says what
 * the deck is. Hidden on small screens, where the header has no room beside it.
 */
export function DeckBackdrop({ url }: { url: string | null | undefined }) {
  if (!url) return null;
  return (
    <div aria-hidden="true" className="pointer-events-none absolute top-0 left-0 z-0 hidden h-[620px] overflow-hidden md:block" style={{ right: BLEED }}>
      <img
        src={url}
        alt=""
        className="absolute top-0 right-0 h-full w-[72%] object-cover object-[50%_30%] opacity-60 select-none"
        style={{ maskImage: FADE, maskComposite: "intersect", WebkitMaskImage: FADE, WebkitMaskComposite: "source-in" }}
      />
    </div>
  );
}
