import Link from "next/link";
import { AccountLinks } from "./AccountLinks";
import { VerifyNotice } from "./VerifyNotice";
import { ThemeToggle } from "./ThemeToggle";

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`inline-flex min-h-9 [@media(pointer:coarse)]:min-h-11 items-center font-display text-[35px] leading-none ${className}`}>
      Eregion
    </Link>
  );
}

export function Nav({ active }: { active?: "decks" | "explore" | "collection" }) {
  return (
    <>
    {/*
      Phones: wordmark and account on one row, the three sections on a second row that runs
      the full width. From sm up everything sits on one line.
    */}
    <header className="flex min-h-[72px] flex-wrap items-center justify-between gap-x-6 border-b border-line pt-3 sm:pt-0">
      <Wordmark />
      <nav className="order-last -mb-px flex w-full gap-7 text-[15px] font-medium sm:order-none sm:mb-0 sm:w-auto sm:gap-8" aria-label="Main">
        <Link
          href="/decks"
          className={`inline-flex min-h-9 [@media(pointer:coarse)]:min-h-11 min-w-11 items-center border-b-2 ${active === "decks" ? "border-accent-text" : "border-transparent text-muted"}`}
        >
          Decks
        </Link>
        <Link
          href="/explore"
          className={`inline-flex min-h-9 [@media(pointer:coarse)]:min-h-11 min-w-11 items-center border-b-2 ${active === "explore" ? "border-accent-text" : "border-transparent text-muted"}`}
        >
          Explore
        </Link>
        <Link
          href="/collection"
          className={`inline-flex min-h-9 [@media(pointer:coarse)]:min-h-11 min-w-11 items-center border-b-2 ${active === "collection" ? "border-accent-text" : "border-transparent text-muted"}`}
        >
          Collection
        </Link>
      </nav>
      <div className="flex items-center gap-1.5 sm:gap-2.5">
        <ThemeToggle />
        <AccountLinks />
      </div>
    </header>
    <VerifyNotice />
    </>
  );
}
