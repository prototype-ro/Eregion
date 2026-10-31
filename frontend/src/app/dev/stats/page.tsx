import { notFound } from "next/navigation";
import { StatsLab } from "./StatsLab";

export const metadata = { title: "Stats lab" };

/** A development page. It does not exist in a production build. */
export default function StatsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <StatsLab />;
}
