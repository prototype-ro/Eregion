"use client";

import Link from "next/link";
import { useState } from "react";
import { Nav } from "@/components/Nav";
import { api, ApiError } from "@/lib/api";

const input =
  "min-h-14 w-full rounded-full border border-line bg-surface px-6 text-[17px] text-ink placeholder:text-muted focus:border-ink focus:outline-none";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/forgot", { method: "POST", body: { email } });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? (err.fields?.email ?? err.message) : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shell">
      <Nav />
      <main className="flex flex-col gap-10 py-16">
        <h1 className="font-display text-[clamp(56px,8vw,112px)] leading-[0.92]">Reset your password</h1>
        {sent ? (
          <div role="status" className="max-w-[520px]">
            <p className="text-lg leading-normal">If that address has an account, a link to choose a new password is on its way. It works once, for an hour.</p>
            <p className="mt-4 text-[15px] text-muted">
              Nothing arrived after a few minutes? Check the spam folder, or{" "}
              <button type="button" onClick={() => setSent(false)} className="text-accent-text underline underline-offset-4">
                try again
              </button>
              .
            </p>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="flex w-full max-w-[460px] flex-col gap-5">
            <p className="text-[15px] leading-snug text-muted">Enter the email you signed up with. We will send you a link to choose a new password.</p>
            <div className="flex flex-col gap-2">
              <label htmlFor="email" className="text-sm text-muted">
                Email
              </label>
              <input id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className={input} />
            </div>
            {error && (
              <p role="alert" className="rounded-2xl border border-add-line bg-add-bg px-4 py-3 text-sm text-add-text">
                {error}
              </p>
            )}
            <button type="submit" disabled={busy || email.trim() === ""} className="press min-h-14 rounded-full bg-accent px-8 text-base font-bold text-on-accent disabled:opacity-60">
              {busy ? "Sending" : "Send the link"}
            </button>
            <Link href="/login" className="text-sm text-muted underline underline-offset-4 hover:text-ink">
              Back to sign in
            </Link>
          </form>
        )}
      </main>
    </div>
  );
}
