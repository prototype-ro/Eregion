"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { User } from "@/lib/types";

const input =
  "min-h-14 w-full rounded-full border border-line bg-surface px-6 text-[17px] text-ink placeholder:text-muted focus:border-ink focus:outline-none";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const isRegister = mode === "register";
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const body = isRegister
        ? { email: data.get("email"), password: data.get("password"), displayName: data.get("displayName") }
        : { email: data.get("email"), password: data.get("password") };
      // The server answers with the user and sets the httpOnly login cookie itself.
      await api<User>(isRegister ? "/api/auth/register" : "/api/auth/login", {
        method: "POST",
        body,
      });
      router.push("/decks");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFields(err.fields ?? {});
      } else {
        setError("Something went wrong. Try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex w-full max-w-[460px] flex-col gap-5">
      {isRegister && (
        <div className="flex flex-col gap-2">
          <label htmlFor="displayName" className="text-sm text-muted">
            Display name
          </label>
          <input id="displayName" name="displayName" autoComplete="nickname" required className={input} />
          {fields.displayName && <p className="text-sm text-add-text">{fields.displayName}</p>}
        </div>
      )}
      <div className="flex flex-col gap-2">
        <label htmlFor="email" className="text-sm text-muted">
          Email
        </label>
        <input id="email" name="email" type="email" autoComplete="email" required className={input} />
        {fields.email && <p className="text-sm text-add-text">{fields.email}</p>}
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="password" className="text-sm text-muted">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete={isRegister ? "new-password" : "current-password"}
          required
          className={input}
        />
        {isRegister && !fields.password && <p className="text-sm text-muted">At least 10 characters, and not a common password.</p>}
        {fields.password && <p className="text-sm text-add-text">{fields.password}</p>}
      </div>

      {error && (
        <p role="alert" className="rounded-2xl border border-add-line bg-add-bg px-4 py-3 text-sm text-add-text">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="press min-h-14 rounded-full bg-accent px-8 text-base font-bold text-on-accent disabled:opacity-60"
      >
        {busy ? "Working" : isRegister ? "Create account" : "Sign in"}
      </button>

      <p className="text-sm text-muted">
        {isRegister ? "Already have an account? " : "New here? "}
        <Link href={isRegister ? "/login" : "/register"} className="text-ink underline underline-offset-4">
          {isRegister ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </form>
  );
}
