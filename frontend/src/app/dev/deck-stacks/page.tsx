import { notFound } from "next/navigation";
import { StacksLab } from "./StacksLab";

export const metadata = { title: "Deck stacks lab" };

/** A development page. It does not exist in a production build. */
export default function DeckStacksPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <StacksLab />;
}
