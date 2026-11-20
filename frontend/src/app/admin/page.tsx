"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Nav } from "@/components/Nav";
import { api, ApiError } from "@/lib/api";
import { getMe } from "@/lib/me";
import type { User } from "@/lib/types";
import { field, std } from "@/lib/ui";

interface Report {
  id: string;
  deckId: string;
  deckName: string;
  deckVisibility: string;
  ownerName: string;
  ownerEmail: string;
  reporterName: string | null;
  reason: string;
  createdAt: string;
  resolvedAt: string | null;
  resolution: string | null;
}

interface UserSummary {
  id: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
  createdAt: string;
  disabledAt: string | null;
  decks: number;
  publicDecks: number;
  artBytes: number;
}

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * Moderation for the accounts listed in EREGION_ADMIN_EMAILS: open reports with their decks, finding and disabling an
 * account, and removing uploaded art. Everyone else sees nothing here, and the API answers them 404.
 */
export default function AdminPage() {
  const [me, setMe] = useState<User | null | undefined>(undefined);
  const [reports, setReports] = useState<Report[] | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [email, setEmail] = useState("");
  const [found, setFound] = useState<UserSummary | null>(null);
  const [artId, setArtId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getMe().then(setMe);
  }, []);

  const loadReports = useCallback(async () => {
    try {
      setReports(await api<Report[]>(`/api/admin/reports?all=${showResolved}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load the reports.");
    }
  }, [showResolved]);

  useEffect(() => {
    if (me?.admin) void loadReports();
  }, [me, loadReports]);

  async function run(work: () => Promise<unknown>, done: string) {
    setError(null);
    setMessage(null);
    try {
      await work();
      setMessage(done);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That did not work.");
    }
  }

  async function findUser(event: React.FormEvent) {
    event.preventDefault();
    setFound(null);
    await run(async () => setFound(await api<UserSummary>(`/api/admin/users?email=${encodeURIComponent(email.trim())}`)), "");
  }

  if (me === undefined) return null;
  if (!me?.admin) {
    return (
      <div className="shell">
        <Nav />
        <main id="main" tabIndex={-1} className="py-16">
          <p className="text-lg text-muted">Nothing here.</p>
        </main>
      </div>
    );
  }

  return (
    <div className="shell">
      <Nav />
      <main id="main" tabIndex={-1} className="flex flex-col gap-14 py-12 pb-24">
        <h1 className="font-display text-[clamp(56px,8vw,112px)] leading-[0.92]">Moderation</h1>
        {(message || error) && (
          <p role={error ? "alert" : "status"} className={`max-w-[640px] rounded-2xl border px-4 py-3 text-sm ${error ? "border-danger-line bg-danger/10" : "border-line"}`}>
            {error ?? message}
          </p>
        )}

        <section aria-labelledby="reports-heading" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="reports-heading" className="text-2xl font-semibold">
              Reports
            </h2>
            <label className="flex items-center gap-2 text-sm text-muted">
              <input type="checkbox" checked={showResolved} onChange={(event) => setShowResolved(event.target.checked)} className="h-4 w-4" />
              Show resolved
            </label>
          </div>
          {reports === null && <p className="text-muted">Loading.</p>}
          {reports?.length === 0 && <p className="text-muted">No open reports.</p>}
          <ul className="flex flex-col divide-y divide-line border-y border-line">
            {reports?.map((report) => (
              <li key={report.id} className="flex flex-col gap-2 py-4">
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <Link href={`/explore/${report.deckId}`} className="font-medium underline underline-offset-4">
                    {report.deckName}
                  </Link>
                  <span className="text-sm text-muted">
                    by {report.ownerName} ({report.ownerEmail}), {report.deckVisibility}
                  </span>
                  <span className="text-sm text-muted">
                    reported {when(report.createdAt)} by {report.reporterName ?? "a deleted account"}
                  </span>
                </div>
                <p className="max-w-[72ch] whitespace-pre-line">{report.reason}</p>
                {report.resolvedAt ? (
                  <p className="text-sm text-muted">
                    {report.resolution} {when(report.resolvedAt)}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        void run(() => api(`/api/admin/reports/${report.id}/resolve`, { method: "POST", body: { action: "unpublish" } }), `${report.deckName} is off Explore`).then(loadReports)
                      }
                      className={std("dangerSolid")}
                    >
                      Take off Explore
                    </button>
                    <button
                      type="button"
                      onClick={() => void run(() => api(`/api/admin/reports/${report.id}/resolve`, { method: "POST", body: { action: "dismiss" } }), "Report dismissed").then(loadReports)}
                      className={std("secondary")}
                    >
                      Dismiss
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="users-heading" className="flex max-w-[720px] flex-col gap-4">
          <h2 id="users-heading" className="text-2xl font-semibold">
            Accounts
          </h2>
          <form onSubmit={(event) => void findUser(event)} className="flex flex-wrap gap-2">
            <label htmlFor="admin-email" className="sr-only">
              Email
            </label>
            <input id="admin-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email address" className={`${field.md} max-w-[360px]`} />
            <button type="submit" className={std("secondary")}>
              Find
            </button>
          </form>
          {found && (
            <div className="flex flex-col gap-2 rounded-2xl border border-line p-4 text-sm">
              <p className="text-base font-medium">
                {found.displayName} <span className="text-muted">({found.email})</span>
              </p>
              <p className="text-muted">
                Joined {when(found.createdAt)}, {found.emailVerified ? "email confirmed" : "email not confirmed"}, {found.decks} decks ({found.publicDecks} public),{" "}
                {(found.artBytes / (1024 * 1024)).toFixed(1)} MB of art.
              </p>
              {found.disabledAt ? (
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-danger">Disabled {when(found.disabledAt)}</span>
                  <button type="button" onClick={() => void run(() => api(`/api/admin/users/${found.id}/enable`, { method: "POST" }), `${found.email} can sign in again`).then(() => setFound(null))} className={std("secondary")}>
                    Enable
                  </button>
                </div>
              ) : (
                <div>
                  <button
                    type="button"
                    onClick={() => void run(() => api(`/api/admin/users/${found.id}/disable`, { method: "POST" }), `${found.email} is disabled; its sessions ended and its decks are private`).then(() => setFound(null))}
                    className={std("dangerSolid")}
                  >
                    Disable account
                  </button>
                  <p className="mt-2 text-xs text-muted">Sign-in is refused, every session ends and its public decks go private. Nothing is deleted.</p>
                </div>
              )}
            </div>
          )}
        </section>

        <section aria-labelledby="art-heading" className="flex max-w-[720px] flex-col gap-4">
          <h2 id="art-heading" className="text-2xl font-semibold">
            Uploaded art
          </h2>
          <p className="text-sm text-muted">
            For a copyright claim: the art id is the last part of the image address, /api/custom-printings/<span className="font-mono">id</span>/image.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void run(() => api(`/api/admin/custom-printings/${artId.trim()}`, { method: "DELETE" }), "Art deleted").then(() => setArtId(""));
            }}
            className="flex flex-wrap gap-2"
          >
            <label htmlFor="admin-art" className="sr-only">
              Art id
            </label>
            <input id="admin-art" required value={artId} onChange={(event) => setArtId(event.target.value)} placeholder="Art id" className={`${field.md} max-w-[420px] font-mono`} />
            <button type="submit" className={std("dangerSolid")}>
              Delete art
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
