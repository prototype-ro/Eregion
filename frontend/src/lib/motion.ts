"use client";

import gsap from "gsap";
import { Flip } from "gsap/Flip";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP, Flip);

/*
 * Motion has one rhythm across the app and only ever moves transform and opacity. Every use
 * answers a question for the reader: what just appeared, where a dialog came from, which
 * version is open now. Reduced motion skips all of it and shows the end state.
 */
export const MOTION = {
  enter: 0.32,
  ease: "power2.out",
  stagger: 0.035,
} as const;

export const REDUCED = "(prefers-reduced-motion: reduce)";

/** Runs fn only when the reader has not asked for reduced motion. */
export function whenMotionAllowed(fn: () => void) {
  const mm = gsap.matchMedia();
  mm.add(`not all and ${REDUCED}`, fn);
  return mm;
}

export { gsap, useGSAP, Flip };
