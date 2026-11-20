import { Contact, LegalPage, LegalSection } from "@/components/LegalPage";
import { SITE } from "@/lib/site";

export const metadata = { title: "Terms · Eregion", description: "The rules for using Eregion." };

export default function TermsPage() {
  return (
    <LegalPage title="Terms">
      <p>
        These terms are an agreement between you and {SITE.operator || "the operator of " + SITE.name}. By creating an
        account you accept them. {SITE.name} is free to use, and stays free: donations, if you choose to give, unlock nothing.
      </p>

      <LegalSection title="Your account">
        <p>
          You must be {SITE.minimumAge} or older. Keep your password to yourself; you are responsible for what happens
          on your account. You can delete it at any time from the Account page.
        </p>
      </LegalSection>

      <LegalSection title="What you post">
        <p>
          Your decks, notes and art stay yours. So that the site can work, you allow us to store them and, for decks
          you make public, to show them to anyone. Only upload art you made or have the right to use.
        </p>
        <p>Do not post anything illegal, hateful, harassing, sexual, or that copies someone else&apos;s work without permission.</p>
        <p>We may remove content or close accounts that break these rules, and will say why when we can.</p>
      </LegalSection>

      <LegalSection title="Proxies and custom art">
        <p>
          Art you add to cards is for personal, casual play. It is not for sale and not for sanctioned tournaments.
          {" "}{SITE.name} does not print cards.
        </p>
      </LegalSection>

      <LegalSection title="Numbers are estimates">
        <p>
          Brackets, win turns, combo chances, prices and other analysis are estimates to help you think about a deck.
          They are not official rulings from Wizards of the Coast, and a playgroup&apos;s judgement always wins.
        </p>
      </LegalSection>

      <LegalSection title="Copyright claims">
        <p>
          If something on {SITE.name} uses your work without permission, write to <Contact /> with a link to the page,
          the work it copies, and why it is yours. We will look at it and take it down while we check.
        </p>
      </LegalSection>

      <LegalSection title="Not affiliated">
        <p>
          {SITE.name} is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards.
          Portions of the materials used are property of Wizards of the Coast. &copy;Wizards of the Coast LLC. Card
          data and images come from Scryfall, which is not involved in running this site.
        </p>
      </LegalSection>

      <LegalSection title="No guarantees">
        <p>
          The site is provided as it is. We work to keep it running and your data safe, but cannot promise it will
          always be available or free of mistakes. Export decks you care about. As far as the law allows, we are not
          liable for losses from using it.
        </p>
      </LegalSection>

      <LegalSection title="Changes">
        <p>If these terms change in a way that matters, signed in players will see a notice before the change applies.</p>
      </LegalSection>
    </LegalPage>
  );
}
