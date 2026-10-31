import { notFound } from "next/navigation";
import { SchematicLab } from "./SchematicLab";

export const metadata = { title: "Schematic lab" };

/** A development page. It does not exist in a production build. */
export default function SchematicPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <SchematicLab />;
}
