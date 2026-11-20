"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { btn } from "@/lib/ui";

/** Follow a public deck to get its new versions in the weekly email. Only for a signed-in player who does not own it. */
export function FollowButton({ deckId, onMessage }: { deckId: string; onMessage: (text: string) => void }) {
  const [following, setFollowing] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ following: boolean }>(`/api/explore/${deckId}/follow`)
      .then((state) => setFollowing(state.following))
      .catch(() => setFollowing(null));
  }, [deckId]);

  async function toggle() {
    setBusy(true);
    try {
      const state = await api<{ following: boolean }>(`/api/explore/${deckId}/follow`, { method: following ? "DELETE" : "POST" });
      setFollowing(state.following);
      onMessage(state.following ? "Following: new versions come in the weekly email" : "Not following any more");
    } catch (err) {
      onMessage(err instanceof ApiError ? err.message : "Could not change that.");
    } finally {
      setBusy(false);
    }
  }

  if (following === null) return null;
  return (
    <button type="button" aria-pressed={following} onClick={() => void toggle()} disabled={busy} className={btn.large.secondary}>
      {following ? "Following" : "Follow"}
    </button>
  );
}
