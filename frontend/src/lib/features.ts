"use client";

import { useEffect, useState } from "react";
import { api } from "./api";

/** Optional parts of the app the server has turned on. Everything is off until the server says otherwise. */
export interface Features {
  /** The proxy art prompt and lore assistant, which call a paid language model. */
  assistant: boolean;
}

const OFF: Features = { assistant: false };
let cached: Promise<Features> | null = null;

/** Asked once per page load and shared by every component that needs it. */
export function useFeatures(): Features {
  const [features, setFeatures] = useState<Features>(OFF);
  useEffect(() => {
    cached ??= api<Features>("/api/features").catch(() => {
      cached = null;
      return OFF;
    });
    let live = true;
    void cached.then((value) => live && setFeatures(value));
    return () => {
      live = false;
    };
  }, []);
  return features;
}
