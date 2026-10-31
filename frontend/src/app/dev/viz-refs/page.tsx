import { notFound } from "next/navigation";
import { VizRefs } from "./VizRefs";

export const metadata = { title: "Viz references" };

/** A development page. It does not exist in a production build. */
export default function VizRefsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <VizRefs />;
}
