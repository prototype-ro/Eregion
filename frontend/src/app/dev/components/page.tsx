import { notFound } from "next/navigation";
import { Showcase } from "./Showcase";

export const metadata = { title: "Components" };

/** A development page. It does not exist in a production build. */
export default function ComponentsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Showcase />;
}
