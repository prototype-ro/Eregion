"use client";

import { useEffect, useState } from "react";

const KEY = "eregion-dev-palette";

/** Development only: turns the Oakfrogs trial palette on and off for the whole app, and remembers the choice. */
export function PaletteSwitch() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY) === "oakfrogs";
      setOn(saved);
      if (saved) document.documentElement.dataset.palette = "oakfrogs";
    } catch {
      // Storage can be blocked. The switch then only lasts until the page is reloaded.
    }
  }, []);
  const flip = () => {
    const next = !on;
    setOn(next);
    if (next) document.documentElement.dataset.palette = "oakfrogs";
    else delete document.documentElement.dataset.palette;
    try {
      if (next) localStorage.setItem(KEY, "oakfrogs");
      else localStorage.removeItem(KEY);
    } catch {
      // Not remembered, which is fine for a trial.
    }
  };
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={flip}
      className="fixed bottom-4 left-[230px] z-[60] inline-flex min-h-9 items-center rounded-full border border-line bg-surface px-4 text-[13px] text-muted transition-colors hover:text-ink aria-pressed:border-accent-text aria-pressed:text-accent-text"
    >
      Oakfrogs {on ? "on" : "off"}
    </button>
  );
}
