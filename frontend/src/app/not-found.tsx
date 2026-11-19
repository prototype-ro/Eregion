import Link from "next/link";
import { Nav } from "@/components/Nav";

export const metadata = { title: "Not found · Eregion" };

/** Any unknown address, and any deck that is private or gone (a private deck looks the same as a missing one). */
export default function NotFound() {
  return (
    <div className="shell">
      <Nav />
      <main id="main" tabIndex={-1} className="flex flex-col gap-8 py-16">
        <h1 className="font-display text-[clamp(56px,10vw,140px)] leading-[0.9]">Nothing here</h1>
        <p className="max-w-[560px] text-lg text-muted">
          This page does not exist, or the deck it pointed to is private or was deleted.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/explore" className="press inline-flex min-h-9 [@media(pointer:coarse)]:min-h-11 items-center rounded-full bg-accent px-7 font-bold text-on-accent">
            Browse shared decks
          </Link>
          <Link href="/" className="pill inline-flex min-h-9 [@media(pointer:coarse)]:min-h-11 items-center rounded-full border px-7 font-medium">
            Home
          </Link>
        </div>
      </main>
    </div>
  );
}
