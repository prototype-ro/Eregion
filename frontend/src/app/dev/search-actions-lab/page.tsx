import { notFound } from "next/navigation";
import { SearchActionsLab } from "./SearchActionsLab";

export const metadata = { title: "Search actions lab" };

/** A development page. It does not exist in a production build. */
export default function SearchActionsLabPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <SearchActionsLab />;
}
