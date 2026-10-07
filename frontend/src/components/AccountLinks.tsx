"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { signOut } from "@/lib/auth";
import { getMe, onMeChange, refreshMe } from "@/lib/me";
import type { User } from "@/lib/types";

/** Shows who is signed in, with a way to their account and to sign out, or the sign in and sign up buttons. */
export function AccountLinks() {
  const router = useRouter();
  // undefined while checking, null when nobody is signed in.
  const [user, setUser] = useState<User | null | undefined>(undefined);

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

  async function leave() {
    try {
      await signOut();
    } finally {
      refreshMe();
      setUser(null);
      router.push("/");
    }
  }

  if (user === undefined) return <span className="min-h-11 w-40" aria-hidden="true" />;

  if (user) {
    return (
      <>
        <Link href="/account" className="hidden max-w-[160px] truncate text-sm text-muted hover:text-ink sm:inline" title="Your account">
          {user.displayName}
        </Link>
        <button type="button" onClick={() => void leave()} className="pill inline-flex min-h-11 items-center whitespace-nowrap rounded-full border border-ink px-5 text-sm font-medium">
          Sign out
        </button>
      </>
    );
  }

  return (
    <>
      <Link href="/login" className="pill inline-flex min-h-11 items-center whitespace-nowrap rounded-full border border-ink px-5 text-sm font-medium">
        Sign in
      </Link>
      <Link href="/register" className="press inline-flex min-h-11 items-center whitespace-nowrap rounded-full bg-accent px-5 text-sm font-bold text-on-accent">
        Start a deck
      </Link>
    </>
  );
}
