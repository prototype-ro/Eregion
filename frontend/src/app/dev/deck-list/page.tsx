import { notFound } from "next/navigation";
import { ListLab } from "./ListLab";

export const metadata = { title: "Deck list lab" };

/** A development page. It does not exist in a production build. */
export default function DeckListPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ListLab />;
}
