import { notFound } from "next/navigation";
import { Concepts } from "./Concepts";

export const metadata = { title: "Deck concepts" };

/** A development page. It does not exist in a production build. */
export default function DeckConceptsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Concepts />;
}
