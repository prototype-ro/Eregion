"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Dialog } from "@/components/Dialog";
import { Nav } from "@/components/Nav";
import { api, ApiError } from "@/lib/api";
import { getMe, refreshMe } from "@/lib/me";
import type { User } from "@/lib/types";
import { btn, field } from "@/lib/ui";

const input = field.lg;
const section = "grid gap-x-12 gap-y-5 border-t border-line py-10 lg:grid-cols-[minmax(220px,300px)_minmax(0,1fr)]";

function Message({ text, bad }: { text: string; bad?: boolean }) {
  return (
    <p role={bad ? "alert" : "status"} className={`rounded-2xl border px-4 py-3 text-sm ${bad ? "border-add-line bg-add-bg text-add-text" : "border-line bg-surface"}`}>
      {text}
    </p>
  );
}

export default function AccountPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    void getMe().then((me) => {
      if (!me) router.replace("/login?next=/account");
      else setUser(me);
    });
  }, [router]);

  if (!user) return <div className="shell"><Nav /><p className="py-16 text-muted">Loading.</p></div>;

  return (
    <div className="shell">
      <Nav />
      <main className="pb-24">
        <h1 className="pt-14 pb-10 font-display text-[clamp(64px,10vw,144px)] leading-[0.92]">Account</h1>
        <Profile user={user} />
        <Password />
        <Sessions />
        <DeleteAccount />
      </main>
    </div>
  );
}

function Profile({ user }: { user: User }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const [error, setError] = useState<string | null>(null);

  async function resend() {
    setState("sending");
    try {
      await api("/api/account/resend-verification", { method: "POST" });
      setState("sent");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send it.");
      setState("failed");
    }
  }

  return (
    <section className={section} aria-labelledby="profile-heading">
      <h2 id="profile-heading" className="text-[28px] leading-tight font-medium tracking-[-0.02em]">Profile</h2>
      <div className="flex max-w-[560px] flex-col gap-4 text-[15px]">
        <p>
          <span className="block text-sm text-muted">Display name</span>
          {user.displayName}
        </p>
        <p>
          <span className="block text-sm text-muted">Email</span>
          {user.email}
          <span className={`ml-3 rounded-full border px-2.5 py-0.5 text-xs ${user.emailVerified ? "border-accent bg-accent font-bold text-on-accent" : "border-line text-muted"}`}>
            {user.emailVerified ? "Confirmed" : "Not confirmed"}
          </span>
        </p>
        {!user.emailVerified && (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm leading-snug text-muted">Confirm your address to make decks public. Look for the email from us, or send it again.</p>
            <button type="button" onClick={() => void resend()} disabled={state === "sending" || state === "sent"} className="pill min-h-9 [@media(pointer:coarse)]:min-h-11 rounded-full border border-ink px-5 text-sm font-medium disabled:opacity-50">
              {state === "sent" ? "Sent. Check your inbox" : state === "sending" ? "Sending" : "Send the link again"}
            </button>
            {state === "failed" && error && <Message text={error} bad />}
          </div>
        )}
      </div>
    </section>
  );
}

function Password() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ text: string; bad: boolean } | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      await api("/api/account/password", { method: "POST", body: { currentPassword: current, newPassword: next } });
      setCurrent("");
      setNext("");
      setResult({ text: "Password changed. Your other sign ins have ended.", bad: false });
    } catch (err) {
      setResult({ text: err instanceof ApiError ? (err.fields?.newPassword ?? err.message) : "Something went wrong.", bad: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={section} aria-labelledby="password-heading">
      <h2 id="password-heading" className="text-[28px] leading-tight font-medium tracking-[-0.02em]">Password</h2>
      <form onSubmit={submit} className="flex max-w-[460px] flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="current-password" className="text-sm text-muted">Current password</label>
          <input id="current-password" type="password" autoComplete="current-password" value={current} onChange={(event) => setCurrent(event.target.value)} className={input} />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="account-new-password" className="text-sm text-muted">New password</label>
          <input id="account-new-password" type="password" autoComplete="new-password" value={next} onChange={(event) => setNext(event.target.value)} className={input} />
          <p className="text-sm text-muted">At least 10 characters, and not a common password.</p>
        </div>
        {result && <Message text={result.text} bad={result.bad} />}
        <button type="submit" disabled={busy || !current || !next} className={`${btn.large.primary} self-start`}>
          {busy ? "Saving" : "Change password"}
        </button>
      </form>
    </section>
  );
}

function Sessions() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function endAll() {
    setBusy(true);
    try {
      await api("/api/account/sessions/end", { method: "POST" });
    } finally {
      refreshMe();
      router.push("/login");
    }
  }

  return (
    <section className={section} aria-labelledby="sessions-heading">
      <h2 id="sessions-heading" className="text-[28px] leading-tight font-medium tracking-[-0.02em]">Sign ins</h2>
      <div className="flex max-w-[560px] flex-col items-start gap-4">
        <p className="text-[15px] leading-snug text-muted">Lost a device, or used a shared computer? Sign out everywhere, this browser included, and sign in again.</p>
        <button type="button" onClick={() => void endAll()} disabled={busy} className={btn.large.secondary}>
          Sign out everywhere
        </button>
      </div>
    </section>
  );
}

function DeleteAccount() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <section className={section} aria-labelledby="delete-heading">
      <h2 id="delete-heading" className="text-[28px] leading-tight font-medium tracking-[-0.02em]">Delete account</h2>
      <div className="flex max-w-[560px] flex-col items-start gap-4">
        <p className="text-[15px] leading-snug text-muted">Removes your account, decks, versions, collection and custom art for good. Public decks leave Explore at once. This cannot be undone.</p>
        <button type="button" onClick={() => setOpen(true)} className={btn.large.danger}>
          Delete my account
        </button>
      </div>
      <Dialog open={open} onClose={() => setOpen(false)} label="Delete account" size="sm">
        <DeleteForm
          onClose={() => setOpen(false)}
          onDeleted={() => {
            refreshMe();
            router.push("/");
          }}
        />
      </Dialog>
      <p className="sr-only">
        <Link href="/">Home</Link>
      </p>
    </section>
  );
}

function DeleteForm({ onClose, onDeleted }: { onClose: () => void; onDeleted: () => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/account/delete", { method: "POST", body: { password } });
      onDeleted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <h2 className="font-display text-[44px] leading-none">Delete account</h2>
      <p className="text-[15px] leading-snug">Everything you made is removed for good. Type your password to confirm.</p>
      <div className="flex flex-col gap-2">
        <label htmlFor="delete-password" className="text-sm text-muted">Password</label>
        <input id="delete-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus className={input} />
      </div>
      {error && <Message text={error} bad />}
      <div className="flex gap-2.5">
        <button type="submit" disabled={busy || !password} className={btn.large.dangerSolid}>
          {busy ? "Deleting" : "Delete everything"}
        </button>
        <button type="button" onClick={onClose} className={btn.large.secondary}>
          Keep my account
        </button>
      </div>
    </form>
  );
}
