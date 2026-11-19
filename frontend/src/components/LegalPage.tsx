import { Nav } from "@/components/Nav";
import { SITE, SITE_INCOMPLETE } from "@/lib/site";

/** Shared frame for the privacy policy and terms: same width, type and update line. */
export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="shell">
      <Nav />
      <main id="main" tabIndex={-1} className="flex max-w-[760px] flex-col gap-6 py-16 text-[16px] leading-relaxed">
        <h1 className="font-display text-[clamp(56px,9vw,120px)] leading-[0.9]">{title}</h1>
        <p className="text-sm text-muted">Last updated {SITE.legalUpdated}.</p>
        {SITE_INCOMPLETE && (
          <p role="note" className="rounded-2xl border border-danger-line bg-danger/10 px-4 py-3 text-sm">
            Draft: the operator name and contact address are not filled in yet (frontend/src/lib/site.ts).
          </p>
        )}
        {children}
      </main>
    </div>
  );
}

export function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="pt-4 text-2xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function Contact() {
  return SITE.contactEmail ? (
    <a href={`mailto:${SITE.contactEmail}`} className="underline underline-offset-4">{SITE.contactEmail}</a>
  ) : (
    <span>the contact address in the footer</span>
  );
}
