import Link from "next/link";
import { AccountLinks } from "./AccountLinks";
import { VerifyNotice } from "./VerifyNotice";
import { ThemeToggle } from "./ThemeToggle";

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`font-display text-[35px] leading-none ${className}`}>
      Eregion
    </Link>
  );
}

export function Nav({ active }: { active?: "decks" | "explore" | "collection" }) {
  return (
    <>
    <header className="flex min-h-[72px] flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-line">
      <Wordmark />
      <nav className="flex gap-8 text-[15px] font-medium" aria-label="Main">
        <Link
          href="/decks"
          className={`border-b-2 py-1.5 ${active === "decks" ? "border-accent-text" : "border-transparent text-muted"}`}
        >
          Decks
        </Link>
        <Link
          href="/explore"
          className={`border-b-2 py-1.5 ${active === "explore" ? "border-accent-text" : "border-transparent text-muted"}`}
        >
          Explore
        </Link>
        <Link
          href="/collection"
          className={`border-b-2 py-1.5 ${active === "collection" ? "border-accent-text" : "border-transparent text-muted"}`}
        >
          Collection
        </Link>
      </nav>
      <div className="flex items-center gap-2.5">
        <ThemeToggle />
        <AccountLinks />
      </div>
    </header>
    <VerifyNotice />
    </>
  );
}
