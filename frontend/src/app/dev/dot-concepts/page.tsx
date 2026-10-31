import { notFound } from "next/navigation";
import { DotConcepts } from "./DotConcepts";

export const metadata = { title: "Dot concepts" };

/** A development page. It does not exist in a production build. */
export default function DotConceptsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DotConcepts />;
}
