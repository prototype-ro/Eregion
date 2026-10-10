"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Nav } from "@/components/Nav";
import { api, ApiError } from "@/lib/api";

const input =
  "min-h-14 w-full rounded-full border border-line bg-surface px-6 text-[17px] text-ink placeholder:text-muted focus:border-ink focus:outline-none";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <Reset />
    </Suspense>
  );
}

function Reset() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/reset", { method: "POST", body: { token, password } });
      setDone(true);
      setTimeout(() => router.push("/login"), 2500);
    } catch (err) {
      setError(err instanceof ApiError ? (err.fields?.password ?? err.message) : "Something went wrong. Try again.");
      setBusy(false);
    }
  }

  return (
    <div className="shell">
      <Nav />
      <main className="flex flex-col gap-10 py-16">
        <h1 className="font-display text-[clamp(56px,8vw,112px)] leading-[0.92]">New password</h1>
        {!token ? (
          <p role="alert" className="max-w-[520px] text-lg text-add-text">
            This page needs the link from your email.{" "}
            <Link href="/forgot-password" className="underline underline-offset-4">
              Ask for a new one
            </Link>
            .
          </p>
        ) : done ? (
          <p role="status" className="max-w-[520px] text-lg leading-normal">
            Your password is changed, and every other sign in has ended. Taking you to sign in.
          </p>
        ) : (
          <form onSubmit={submit} noValidate className="flex w-full max-w-[460px] flex-col gap-5">
            <div className="flex flex-col gap-2">
              <label htmlFor="new-password" className="text-sm text-muted">
                New password
              </label>
              <input id="new-password" type="password" autoComplete="new-password" required value={password} onChange={(event) => setPassword(event.target.value)} className={input} />
              <p className="text-sm text-muted">At least 10 characters, and not a common password.</p>
            </div>
            {error && (
              <p role="alert" className="rounded-2xl border border-danger-line bg-danger/10 px-4 py-3 text-sm text-ink">
                {error}{" "}
                {/valid any more/.test(error) && (
                  <Link href="/forgot-password" className="underline underline-offset-4">
                    Ask for a new link
                  </Link>
                )}
              </p>
            )}
            <button type="submit" disabled={busy || password === ""} className="press min-h-14 rounded-full bg-accent px-8 text-base font-bold text-on-accent disabled:opacity-60">
              {busy ? "Saving" : "Change password"}
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
