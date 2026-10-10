"use client";

import { MoonStars, Sun } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

type Theme = "light" | "dark";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const attr = document.documentElement.getAttribute("data-theme");
    if (attr === "light" || attr === "dark") {
      setTheme(attr);
    } else {
      setTheme(window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    }
  }, []);

  function toggle() {
    const next: Theme = theme === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("eregion-theme", next);
    } catch {
      // Private mode or blocked storage: the choice just won't persist.
    }
    setTheme(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "light" ? "Switch to the dark theme" : "Switch to the light theme"}
      title={theme === "light" ? "Dark theme" : "Light theme"}
      className="flex size-11 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface hover:text-ink"
    >
      {theme === "light" ? <MoonStars size={20} weight="regular" aria-hidden /> : <Sun size={20} weight="regular" aria-hidden />}
    </button>
  );
}
