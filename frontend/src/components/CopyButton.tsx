"use client";

import { useState } from "react";
import { std } from "@/lib/ui";

/** Copies text made at the moment of the click, and says so for a few seconds. */
export function CopyButton({ label, text, className }: { label: string; text: () => string; className?: string }) {
  const [said, setSaid] = useState<string | null>(null);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text());
      setSaid("Copied");
    } catch {
      setSaid("Could not copy");
    }
    setTimeout(() => setSaid(null), 2500);
  }
  return (
    <button type="button" onClick={() => void copy()} className={className ?? std("secondary")}>
      <span aria-live="polite">{said ?? label}</span>
    </button>
  );
}
