import { notFound } from "next/navigation";

/**
 * Every page under /dev is a design lab for this machine only. Each page also checks on its own, but this guard covers
 * any new lab page that forgets to, so none can ever be served by a production build.
 */
export default function DevLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === "production") notFound();
  return children;
}
