"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Nav } from "@/components/Nav";
import { api } from "@/lib/api";
import { btn } from "@/lib/ui";

export default function UnsubscribePage() {
  return (
    <Suspense fallback={null}>
      <Unsubscribe />
    </Suspense>
  );
}

/**
 * The link at the bottom of the weekly email. It asks before stopping, because mail scanners open links on their own
 * and a plain visit must not unsubscribe anyone.
 */
function Unsubscribe() {
  const token = useSearchParams().get("token") ?? "";
  const [state, setState] = useState<"ask" | "done" | "failed">("ask");

  async function confirm() {
    try {
      await api(`/api/digest/unsubscribe?token=${encodeURIComponent(token)}`, { method: "POST" });
      setState("done");
    } catch {
      setState("failed");
    }
  }

  return (
    <div className="shell">
      <Nav />
      <main id="main" tabIndex={-1} className="flex max-w-[620px] flex-col gap-6 py-16">
        <h1 className="font-display text-[clamp(48px,8vw,96px)] leading-[0.92]">Weekly email</h1>
        {state === "ask" && (
          <>
            <p className="text-lg text-muted">Stop the weekly email about decks you follow? You keep following them, and can turn it back on from your account page.</p>
            <div>
              <button type="button" onClick={() => void confirm()} disabled={!token} className={btn.large.primary}>
                Stop the weekly email
              </button>
            </div>
          </>
        )}
        {state === "done" && (
          <p role="status" className="text-lg">
            Done. No more weekly emails. Turn them back on any time from your <Link href="/account" className="underline underline-offset-4">account page</Link>.
          </p>
        )}
        {state === "failed" && (
          <p role="alert" className="text-lg">
            That link did not work. Sign in and turn the email off on your <Link href="/account" className="underline underline-offset-4">account page</Link>.
          </p>
        )}
      </main>
    </div>
  );
}
