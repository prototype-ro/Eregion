import { notFound } from "next/navigation";
import { Palette } from "./Palette";

export const metadata = { title: "Palette" };

/** A development page. It does not exist in a production build. */
export default function PalettePage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Palette />;
}
