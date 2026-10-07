import Link from "next/link";
import { ThemeToggle } from "./ThemeToggle";

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`font-display text-[35px] leading-none ${className}`}>
      Eregion
    </Link>
  );
}

export function Nav({ active }: { active?: "decks" | "collection" }) {
  return (
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
          href="/collection"
          className={`border-b-2 py-1.5 ${active === "collection" ? "border-accent-text" : "border-transparent text-muted"}`}
        >
          Collection
        </Link>
      </nav>
      <div className="flex items-center gap-2.5">
        <ThemeToggle />
        <Link
          href="/login"
          className="pill inline-flex min-h-11 items-center whitespace-nowrap rounded-full border border-ink px-5 text-sm font-medium"
        >
          Sign in
        </Link>
        <Link
          href="/register"
          className="press inline-flex min-h-11 items-center whitespace-nowrap rounded-full bg-accent px-5 text-sm font-bold text-on-accent"
        >
          Start a deck
        </Link>
      </div>
    </header>
  );
}
