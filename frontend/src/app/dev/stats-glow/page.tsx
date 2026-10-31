import { notFound } from "next/navigation";
import { GlowLab } from "./GlowLab";

export const metadata = { title: "Stats glow lab" };

/** A development page. It does not exist in a production build. */
export default function StatsGlowPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <GlowLab />;
}
