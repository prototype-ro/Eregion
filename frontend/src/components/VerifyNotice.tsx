"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { getMe, onMeChange } from "@/lib/me";
import type { User } from "@/lib/types";

/** A strip under the header for players who have not confirmed their email, with a way to ask for the link again. */
export function VerifyNotice() {
  const [user, setUser] = useState<User | null>(null);
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const load = () => void getMe().then((me) => live && setUser(me));
    load();
    const stop = onMeChange(load);
    return () => {
      live = false;
      stop();
    };
  }, []);

  if (!user || user.emailVerified) return null;

  async function resend() {
    setState("sending");
    try {
      await api("/api/account/resend-verification", { method: "POST" });
      setState("sent");
    } catch (err) {
      setState("failed");
      setMessage(err instanceof ApiError ? err.message : "Could not send it. Try again later.");
    }
  }

  return (
    <div role="status" className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-line py-3 text-sm text-muted">
      <span>
        Confirm your email to share decks. We sent a link to <span className="text-ink">{user.email}</span>.
      </span>
      {state === "sent" ? (
        <span className="text-accent-text">Sent again. Check your inbox.</span>
      ) : (
        <button type="button" onClick={() => void resend()} disabled={state === "sending"} className="inline-flex min-h-11 items-center text-accent-text underline underline-offset-4 disabled:opacity-50">
          {state === "sending" ? "Sending" : "Send the link again"}
        </button>
      )}
      {state === "failed" && message && <span className="text-add-text">{message}</span>}
    </div>
  );
}
