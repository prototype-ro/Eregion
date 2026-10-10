"use client";

import { useState } from "react";
import { Dialog } from "@/components/Dialog";
import { api, ApiError } from "@/lib/api";

interface Props {
  open: boolean;
  onClose: () => void;
  deckId: string;
}

/** Lets a signed in player tell the site about a public deck, for example spam or abuse. */
export function ReportDialog(props: Props) {
  return (
    <Dialog open={props.open} onClose={props.onClose} label="Report deck" size="sm">
      <Form {...props} />
    </Dialog>
  );
}

function Form({ onClose, deckId }: Props) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/explore/${deckId}/report`, { method: "POST", body: { reason } });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? (err.fields?.reason ?? err.message) : "Could not send the report.");
    }
    setBusy(false);
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-5">
        <h2 className="font-display text-[44px] leading-none">Report sent</h2>
        <p className="text-muted">Thank you. Someone will look at this deck.</p>
        <button type="button" onClick={onClose} className="pill min-h-12 self-start rounded-full border border-ink px-7 text-sm font-medium">
          Close
        </button>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      <h2 className="font-display text-[44px] leading-none">Report deck</h2>
      <div className="flex flex-col gap-2">
        <label htmlFor="report-reason" className="text-sm text-muted">
          What is wrong with it?
        </label>
        <textarea id="report-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} rows={5} autoFocus className="w-full resize-y rounded-3xl border border-line bg-surface px-5 py-4 text-[15px] text-ink focus:border-ink focus:outline-none" />
      </div>
      {error && (
        <p role="alert" className="rounded-2xl border border-danger-line bg-danger/10 px-4 py-3 text-sm text-ink">
          {error}
        </p>
      )}
      <div className="flex gap-2.5">
        <button type="submit" disabled={busy || reason.trim() === ""} className="press min-h-12 rounded-full bg-accent px-7 text-sm font-bold text-on-accent disabled:opacity-50">
          Send report
        </button>
        <button type="button" onClick={onClose} className="pill min-h-12 rounded-full border border-ink px-7 text-sm font-medium">
          Cancel
        </button>
      </div>
    </form>
  );
}
