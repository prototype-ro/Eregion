"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { Nav } from "@/components/Nav";
import { api, ApiError } from "@/lib/api";
import { refreshMe } from "@/lib/me";
import { btn } from "@/lib/ui";

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <Verify />
    </Suspense>
  );
}

function Verify() {
  const token = useSearchParams().get("token") ?? "";
  const [state, setState] = useState<"working" | "done" | "failed">("working");
  const [message, setMessage] = useState<string>("");
  // The link works once, so a development double render must not use it up twice.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!token) {
      setState("failed");
      setMessage("This page needs the link from your email.");
      return;
    }
    api("/api/auth/verify", { method: "POST", body: { token } })
      .then(() => {
        setState("done");
        refreshMe();
      })
      .catch((err) => {
        setState("failed");
        setMessage(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
      });
  }, [token]);

  return (
    <div className="shell">
      <Nav />
      <main className="flex flex-col gap-8 py-16">
        <h1 className="font-display text-[clamp(56px,8vw,112px)] leading-[0.92]">{state === "done" ? "Email confirmed" : "Confirming your email"}</h1>
        {state === "working" && <p className="text-lg text-muted">One moment.</p>}
        {state === "done" && (
          <div role="status" className="max-w-[520px]">
            <p className="text-lg leading-normal">Thanks. You can share decks now.</p>
            <Link href="/decks" className={`${btn.large.primary} mt-6`}>
              Go to your decks
            </Link>
          </div>
        )}
        {state === "failed" && (
          <div role="alert" className="max-w-[520px]">
            <p className="text-lg leading-normal text-add-text">{message}</p>
            <p className="mt-4 text-[15px] text-muted">
              Signed in? Ask for a new link from your{" "}
              <Link href="/account" className="text-accent-text underline underline-offset-4">
                account page
              </Link>
              .
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
