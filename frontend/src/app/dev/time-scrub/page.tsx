import { notFound } from "next/navigation";
import { TimeScrubLab } from "./TimeScrubLab";

export const metadata = { title: "Time-scrub lab" };

/** A development page. It does not exist in a production build. */
export default function TimeScrubPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <TimeScrubLab />;
}
