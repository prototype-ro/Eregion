import Link from "next/link";
import { CardArt } from "@/components/CardArt";
import { Nav } from "@/components/Nav";

// Placeholder art. Cards belong to Wizards of the Coast and the artists.
const ART = {
  edgar: "https://cards.scryfall.io/art_crop/front/a/5/a577ba08-0aa8-45be-aa83-d5078770127c.jpg",
  atraxa: "https://cards.scryfall.io/art_crop/front/d/0/d0d33d52-3d28-4635-b985-51e126289259.jpg",
  solRing: "https://cards.scryfall.io/art_crop/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg",
};

const added = ["Rhystic Study", "Cyclonic Rift", "Fierce Guardianship"];
const removed = ["Divination", "Mulldrifter", "Sign in Blood"];

function Sectionhead({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex max-w-[680px] flex-col gap-3.5 pt-28">
      <h2 className="font-display text-[clamp(56px,8vw,112px)] leading-[0.92]">{title}</h2>
      <p className="text-lg leading-normal text-muted">{body}</p>
    </div>
  );
}

export default function Home() {
  return (
    <div className="shell">
      <Nav />

      {/* Hero */}
      <section className="grid items-stretch gap-10 pt-14 md:grid-cols-2">
        <div className="flex flex-col justify-center gap-7">
          <h1 className="max-w-[520px] text-[clamp(48px,6vw,88px)] leading-[0.98] font-medium tracking-[-0.04em]">
            Every deck has a history.
          </h1>
          <p className="max-w-[480px] text-[19px] leading-normal text-muted">
            Save every version of your Commander deck and see which cards changed and how the curve moved.
          </p>
          <div className="flex flex-wrap gap-2.5">
            <Link
              href="/register"
              className="press inline-flex min-h-11 items-center whitespace-nowrap rounded-full bg-accent px-7 text-base font-bold text-on-accent"
            >
              Start a deck
            </Link>
            <Link
              href="/login"
              className="pill inline-flex min-h-11 items-center whitespace-nowrap rounded-full border border-ink px-7 text-base font-medium"
            >
              View demo deck
            </Link>
          </div>
        </div>
        <figure className="flex flex-col gap-2.5">
          <CardArt
            src={ART.edgar}
            alt="Edgar Markov surrounded by knights in red and silver armor, shown in grayscale"
            sizes="(min-width: 768px) 50vw, 100vw"
            position="50% 35%"
            priority
            className="min-h-[420px] flex-1 rounded-card md:min-h-[560px] 2xl:min-h-[720px]"
          />
          <figcaption className="font-mono text-xs text-muted">
            Placeholder art: Edgar Markov, illustrated by Volkan Baga.
          </figcaption>
        </figure>
      </section>

      {/* Features: three cells, one tall plus two stacked */}
      <Sectionhead title="Build, track, own" body="One place for a deck from first draft to the fiftieth tweak." />
      <section className="mt-9 grid gap-5 md:grid-cols-[1.15fr_1fr]">
        <article className="flex flex-col overflow-hidden rounded-card border border-line bg-surface md:row-span-2">
          <CardArt
            src={ART.atraxa}
            alt="Atraxa, Praetors' Voice, a winged figure with a staff in darkness, shown in grayscale"
            sizes="(min-width: 768px) 55vw, 100vw"
            position="50% 30%"
            className="h-80"
          />
          <div className="flex flex-1 flex-col gap-4 p-8">
            <h3 className="text-3xl leading-tight font-medium tracking-[-0.025em]">A builder that stays out of the way</h3>
            <p className="max-w-[440px] leading-normal text-muted">
              Search any card, add it in one click, and view your list as text, stacks or full cards. Paste a list from another site to start.
            </p>
            <ul className="mt-auto flex flex-wrap gap-2 pt-3 text-sm">
              {["List", "Stacks", "Gallery", "Custom tags", "Import"].map((feature) => (
                <li key={feature} className="rounded-full border border-line px-4 py-2">
                  {feature}
                </li>
              ))}
            </ul>
          </div>
        </article>

        <article className="flex min-h-[280px] flex-col gap-3.5 rounded-card bg-accent p-8 text-on-accent">
          <h3 className="text-3xl leading-tight font-medium tracking-[-0.025em]">Versions and diffs</h3>
          <p className="max-w-[420px] leading-normal">
            Every save is a full snapshot. Compare any two and see exactly what moved.
          </p>
          <p className="mt-auto text-6xl leading-none font-medium tracking-[-0.045em]">+3 / -3</p>
        </article>

        <article className="flex min-h-[280px] flex-wrap overflow-hidden rounded-card border border-line bg-surface">
          <div className="flex min-w-[220px] flex-1 flex-col gap-3.5 p-8">
            <h3 className="text-3xl leading-tight font-medium tracking-[-0.025em]">Your collection</h3>
            <p className="leading-normal text-muted">See what you own and what you still need.</p>
            <p className="mt-auto text-xl font-medium">96 of 100 owned</p>
          </div>
          <CardArt
            src={ART.solRing}
            alt="Sol Ring card art, shown in grayscale"
            sizes="200px"
            className="min-h-40 w-full sm:w-[200px] sm:flex-none"
          />
        </article>
      </section>

      {/* What changed */}
      <Sectionhead
        title="What changed?"
        body="Swap a card and watch the average cost, the curve and the colors move with it. Sample deck shown."
      />
      <section className="mt-9 grid overflow-hidden rounded-card border border-line bg-surface md:grid-cols-[1.1fr_1.1fr_1fr]">
        <div className="flex flex-col gap-2.5 p-8">
          <h3 className="mb-1 text-[15px] font-normal text-muted">Added in v8</h3>
          {added.map((name) => (
            <p
              key={name}
              className="flex justify-between rounded-2xl border border-add-line bg-add-bg px-4 py-3.5"
            >
              <span>{name}</span>
              <span className="font-mono text-add-text">MV 3</span>
            </p>
          ))}
        </div>
        <div className="flex flex-col gap-2.5 border-line p-8 md:border-l">
          <h3 className="mb-1 text-[15px] font-normal text-muted">Removed from v7</h3>
          {removed.map((name, i) => (
            <p
              key={name}
              className="flex justify-between rounded-2xl border border-line px-4 py-3.5 text-muted line-through"
            >
              <span>{name}</span>
              <span className="font-mono">MV {[3, 5, 2][i]}</span>
            </p>
          ))}
        </div>
        <div className="flex flex-col justify-center gap-1.5 border-line p-8 md:border-l">
          <p className="text-[15px] text-muted">Average mana value</p>
          <p className="text-[88px] leading-none font-medium tracking-[-0.05em]">2.94</p>
          <p className="font-mono text-sm text-accent-text">down from 3.12</p>
        </div>
      </section>

      {/* Call to action */}
      <section className="mt-28 flex flex-wrap items-end justify-between gap-8 rounded-card bg-accent px-11 py-16 text-on-accent">
        <h2 className="max-w-[820px] font-display text-[clamp(56px,8vw,120px)] leading-[0.92]">
          Your next deck starts here
        </h2>
        <Link
          href="/register"
          className="press inline-flex min-h-11 items-center whitespace-nowrap rounded-full bg-[#0a0a0a] px-8 text-base font-bold text-[#f2f2f0]"
        >
          Start a deck
        </Link>
      </section>

      <footer className="flex flex-wrap justify-between gap-3 pt-8 pb-10 text-[13px] text-muted">
        <p>Eregion, a deck ledger for Commander players.</p>
        <p>Placeholder card art belongs to Wizards of the Coast and the artists. Not affiliated.</p>
      </footer>
    </div>
  );
}
