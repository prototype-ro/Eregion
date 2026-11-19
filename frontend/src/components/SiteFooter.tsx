import Link from "next/link";
import { SITE } from "@/lib/site";

/**
 * On every page. The first paragraph is the notice Wizards of the Coast's Fan Content Policy asks for, in its own
 * words; the second credits Scryfall, where the card data, images and prices come from.
 */
export function SiteFooter() {
  return (
    <footer className="shell mt-auto flex flex-col gap-4 border-t border-line pt-8 pb-10 text-[13px] leading-relaxed text-muted">
      <nav aria-label="Site" className="flex flex-wrap gap-x-6 gap-y-1 text-ink">
        <Link href="/explore" className="inline-flex min-h-9 items-center">Explore</Link>
        <Link href="/privacy" className="inline-flex min-h-9 items-center">Privacy</Link>
        <Link href="/terms" className="inline-flex min-h-9 items-center">Terms</Link>
        {SITE.contactEmail && (
          <a href={`mailto:${SITE.contactEmail}`} className="inline-flex min-h-9 items-center">Contact</a>
        )}
      </nav>
      <p className="max-w-[880px]">
        {SITE.name} is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards.
        Portions of the materials used are property of Wizards of the Coast. &copy;Wizards of the Coast LLC.
      </p>
      <p className="max-w-[880px]">
        Card data, images and prices come from{" "}
        <a href="https://scryfall.com" className="underline underline-offset-2" rel="noopener">Scryfall</a>. Card art
        belongs to its artists and Wizards of the Coast. Prices are estimates in US dollars.
      </p>
    </footer>
  );
}
