import { Contact, LegalPage, LegalSection } from "@/components/LegalPage";
import { SITE } from "@/lib/site";

export const metadata = { title: "Privacy · Eregion", description: "What Eregion stores about you, who else sees it, and how to remove it." };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy">
      <p>
        {SITE.name} is run by {SITE.operator || "its operator"}, who is responsible for your data (the controller under
        the LGPD and the GDPR). Write to <Contact /> about anything on this page.
      </p>

      <LegalSection title="What we keep">
        <ul className="flex list-disc flex-col gap-2 pl-6">
          <li>Your account: email address, display name, and a one-way hash of your password (never the password itself).</li>
          <li>What you make: decks, every saved version with its notes, tags and descriptions, your collection, art you upload, and reports you send.</li>
          <li>One cookie, <code>eregion_session</code>, which keeps you signed in. It is not readable by page scripts and is not used for anything else. Visitors who are not signed in get no cookies.</li>
          <li>Server logs with requests and errors, kept for up to 30 days to fix problems and stop abuse. Your network address is also counted in memory for rate limits and is not stored.</li>
        </ul>
        <p>There is no advertising, no analytics service and no tracking across sites.</p>
      </LegalSection>

      <LegalSection title="Why">
        <p>
          To run your account and show your decks (the service you asked for), to keep the site secure and working
          (a legitimate interest), and, only if you use it, to run the writing assistant (your choice each time).
        </p>
      </LegalSection>

      <LegalSection title="Who else sees it">
        <ul className="flex list-disc flex-col gap-2 pl-6">
          <li>Anyone, for a deck you make public: its published version, its name, description and your display name. Art you uploaded for cards in that version is shown with it. Private decks are seen by no one else.</li>
          <li>Scryfall: your browser loads card images from cards.scryfall.io, which sees your network address like any website you visit.</li>
          <li>Commander Spellbook: the card names in a deck you analyse are sent to find combos. Nothing about you is sent.</li>
          <li>DeepSeek, only when you use the art prompt or lore assistant: your instructions, the deck lore and the card details are sent to DeepSeek to write the answer. Their servers may be outside your country, including in China. Do not put personal information in lore or instructions.</li>
          <li>The companies that host the site and send its email, which handle data only to provide those services.</li>
        </ul>
        <p>Nothing is sold.</p>
      </LegalSection>

      <LegalSection title="How long">
        <p>
          Until you delete it. A deleted deck waits in your trash for 30 days so it can be restored, then it is removed.
          Deleting your account (on the Account page) removes the account, every deck and version, the trash, your
          collection, your art and your reports at once. Copies in backups are gone within 30 days.
        </p>
      </LegalSection>

      <LegalSection title="Your rights">
        <p>
          You can see and correct your data in the app, download all of it as one file from the Account page (Your data),
          and delete everything from the same page. For any other request (access, correction, objection, portability),
          write to <Contact />. You can also complain to your data protection authority: the ANPD in Brazil, or the
          authority where you live in the EU.
        </p>
      </LegalSection>

      <LegalSection title="Age">
        <p>You must be {SITE.minimumAge} or older to create an account.</p>
      </LegalSection>

      <LegalSection title="Changes">
        <p>If this page changes in a way that matters, signed in players will see a notice before it applies.</p>
      </LegalSection>
    </LegalPage>
  );
}
