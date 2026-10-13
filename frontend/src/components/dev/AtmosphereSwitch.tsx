"use client";

import { useEffect, useState } from "react";

const KEY = "eregion-dev-atmosphere";
const LEVELS = ["off", "header", "accents", "page"] as const;
type Level = (typeof LEVELS)[number];

/** Development only: steps the commander atmosphere through its levels so they can be compared on the real deck page. */
export function AtmosphereSwitch() {
  const [level, setLevel] = useState<Level>("off");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY) as Level | null;
      if (saved && LEVELS.includes(saved)) {
        setLevel(saved);
        document.documentElement.dataset.atmosphere = saved;
      }
    } catch {
      // Storage can be blocked. The level then lasts until the page is reloaded.
    }
  }, []);
  const next = () => {
    const following = LEVELS[(LEVELS.indexOf(level) + 1) % LEVELS.length];
    setLevel(following);
    document.documentElement.dataset.atmosphere = following;
    try {
      localStorage.setItem(KEY, following);
    } catch {
      // Not remembered, which is fine here.
    }
  };
  return (
    <button
      type="button"
      data-annotate-ignore
      onClick={next}
      title="Cycle the commander atmosphere: off, header, accents, page"
      className="fixed bottom-2 left-[10.4rem] z-[99998] rounded-full border border-line bg-bg px-2.5 py-1 text-[11px] font-medium text-muted opacity-60 shadow-lg hover:opacity-100"
    >
      Mood: {level}
    </button>
  );
}
