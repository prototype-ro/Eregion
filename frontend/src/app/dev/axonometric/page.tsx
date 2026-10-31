import { notFound } from "next/navigation";
import { AxonometricLab } from "./AxonometricLab";

export const metadata = { title: "Axonometric lab" };

/** A development page. It does not exist in a production build. */
export default function AxonometricPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <AxonometricLab />;
}
