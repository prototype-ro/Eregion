import { notFound } from "next/navigation";
import { GraphicsLab } from "./GraphicsLab";

export const metadata = { title: "Stats graphics lab" };

/** A development page. It does not exist in a production build. */
export default function StatsGraphicsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <GraphicsLab />;
}
