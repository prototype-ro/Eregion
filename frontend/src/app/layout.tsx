import type { Metadata } from "next";
import { Bricolage_Grotesque, Fragment_Mono, Pirata_One } from "next/font/google";
import "mana-font/css/mana.min.css";
import "./globals.css";
import { DevTools } from "@/components/dev/DevTools";
import { SiteFooter } from "@/components/SiteFooter";

const display = Pirata_One({ subsets: ["latin"], weight: "400", variable: "--font-pirata", display: "swap" });
const mono = Fragment_Mono({ subsets: ["latin"], weight: "400", variable: "--font-fragment-mono", display: "swap" });
const sans = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", display: "swap" });

const description = "A Commander deck builder that keeps every version of your deck: see what changed, try ideas on a branch, and check its bracket.";

export const metadata: Metadata = {
  title: "Eregion",
  description,
  openGraph: { title: "Eregion", description, type: "website", siteName: "Eregion" },
  twitter: { card: "summary", title: "Eregion", description },
};

// Applies a saved theme before first paint so the page never flashes the wrong colors.
const themeScript = `try{var t=localStorage.getItem("eregion-theme");if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t)}}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-screen flex-col font-sans">
        {children}
        <SiteFooter />
        <DevTools />
      </body>
    </html>
  );
}
