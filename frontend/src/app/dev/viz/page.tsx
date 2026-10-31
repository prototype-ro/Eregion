import { notFound } from "next/navigation";
import { VizLab } from "./VizLab";

export const metadata = { title: "Viz lab" };

/** A development page. It does not exist in a production build. */
export default function VizPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <VizLab />;
}
