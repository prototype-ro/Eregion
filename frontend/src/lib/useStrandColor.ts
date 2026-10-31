"use client";

import { useEffect, useState } from "react";
import { artHue, DEFAULT_STRAND, strandColorOf } from "./artColor";

/** The colours a person can pick for the strands, besides the one taken from the commander's art. */
export const STRAND_CHOICES: Array<[string, string]> = [
  ["#38d6ff", "Cyan"],
  ["#9b6bff", "Violet"],
  ["#ff4fd8", "Magenta"],
  ["#3dff8a", "Green"],
  ["#ffb02e", "Amber"],
];
const STRAND_KEY = "eregion-strand-color";
/** Sent on the window when the pick changes, so every part of the page that glows in the strand colour follows at once. */
const CHANGE = "eregion-strand-change";

const valid = (value: string | null): value is string => !!value && (value === "auto" || STRAND_CHOICES.some(([hex]) => hex === value));

function readChoice(): string {
  try {
    const saved = localStorage.getItem(STRAND_KEY);
    return valid(saved) ? saved : "auto";
  } catch {
    return "auto";
  }
}

/**
 * The colour of the version timeline's strands, shared with the statistics graphics: picked by the person, or by default taken
 * from the commander's art. `choice` is "auto" or one of the picked hexes; `color` is what to draw with.
 */
export function useStrandColor(artUrl: string | null | undefined) {
  const [choice, setChoice] = useState<string>("auto");
  const [autoHue, setAutoHue] = useState<number | null>(null);

  useEffect(() => {
    const sync = () => setChoice(readChoice());
    sync();
    window.addEventListener(CHANGE, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGE, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void artHue(artUrl).then((hue) => !cancelled && setAutoHue(hue));
    return () => {
      cancelled = true;
    };
  }, [artUrl]);

  const autoColor = autoHue !== null ? strandColorOf(autoHue) : DEFAULT_STRAND;
  const pick = (next: string) => {
    setChoice(next);
    try {
      localStorage.setItem(STRAND_KEY, next);
    } catch {
      // Not remembered.
    }
    window.dispatchEvent(new Event(CHANGE));
  };

  return {
    choice,
    color: choice !== "auto" ? choice : autoColor,
    autoColor,
    pick,
  };
}
