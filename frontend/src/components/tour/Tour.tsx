"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { stepsToShow, type TourStep } from "@/lib/tour";
import { btn } from "@/lib/ui";

interface Props {
  steps: TourStep[];
  /** Called once, when the tour is finished or skipped. */
  onClose: () => void;
}

const find = (target: string) => document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
const onScreen = (target: string) => {
  const el = find(target);
  if (!el) return false;
  const box = el.getBoundingClientRect();
  return box.width > 0 && box.height > 0;
};
const PAD = 8; // room between the target and the outline drawn around it
const CARD = 340; // width of the step card
const CARD_HEIGHT = 220; // about how tall the step card is, to decide whether it fits under the target

/**
 * Points at one part of the page at a time: the page dims around it and a card says what it is for. It only points: Back,
 * Next and Skip move it, Escape closes it, and nothing on the page is clicked or changed while it is open.
 */
export function Tour({ steps, onClose }: Props) {
  const [shown] = useState(() => stepsToShow(steps, onScreen));
  const [at, setAt] = useState(0);
  const [box, setBox] = useState<DOMRect | null>(null);
  const next = useRef<HTMLButtonElement>(null);
  const step = shown[at];

  const measure = useCallback(() => {
    const el = step ? find(step.target) : null;
    setBox(el ? el.getBoundingClientRect() : null);
  }, [step]);

  // Each step brings its target into view and puts the keyboard on Next.
  useLayoutEffect(() => {
    const el = step ? find(step.target) : null;
    if (!el) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    measure();
    next.current?.focus();
  }, [step, measure]);

  // The outline follows its target while the page scrolls or resizes.
  useEffect(() => {
    let frame = 0;
    const later = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("scroll", later, true);
    window.addEventListener("resize", later);
    window.addEventListener("keydown", key);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", later, true);
      window.removeEventListener("resize", later);
      window.removeEventListener("keydown", key);
    };
  }, [measure, onClose]);

  // Nothing to point at: close at once, as if finished.
  useEffect(() => {
    if (shown.length === 0) onClose();
  }, [shown.length, onClose]);
  if (!step || typeof document === "undefined") return null;

  const last = at === shown.length - 1;
  // The card goes under the target when there is room, otherwise above it, and always stays inside the window.
  const below = !box || box.bottom + PAD + CARD_HEIGHT < window.innerHeight;
  const left = box ? Math.min(Math.max(box.left + box.width / 2 - CARD / 2, 12), window.innerWidth - CARD - 12) : 12;
  const top = box ? (below ? box.bottom + PAD + 12 : Math.max(box.top - PAD - 12 - CARD_HEIGHT, 12)) : 12;

  return createPortal(
    <div className="fixed inset-0 z-[70]">
      {/* Catches clicks on the dimmed page, so a stray click never edits the deck mid-tour. */}
      <div className="absolute inset-0" aria-hidden="true" />
      {box && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute rounded-[20px] transition-all duration-300 ease-out motion-reduce:transition-none"
          style={{
            left: box.left - PAD,
            top: box.top - PAD,
            width: box.width + PAD * 2,
            height: box.height + PAD * 2,
            boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.55)",
            outline: "2px solid var(--accent-text)",
          }}
        />
      )}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        className="absolute rounded-3xl border border-line bg-bg p-5 shadow-2xl transition-[left,top] duration-300 ease-out motion-reduce:transition-none"
        style={{ left, top, width: Math.min(CARD, window.innerWidth - 24) }}
      >
        <p className="font-mono text-xs text-muted">
          {at + 1} of {shown.length}
        </p>
        <h2 id="tour-title" className="mt-1 text-xl font-medium">
          {step.title}
        </h2>
        <p id="tour-body" className="mt-2 text-[15px] leading-normal text-muted">
          {step.body}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button ref={next} type="button" onClick={() => (last ? onClose() : setAt(at + 1))} className={btn.primary}>
            {last ? "Done" : "Next"}
          </button>
          {at > 0 && (
            <button type="button" onClick={() => setAt(at - 1)} className={btn.secondary}>
              Back
            </button>
          )}
          {!last && (
            <button type="button" onClick={onClose} className={`${btn.quiet} ml-auto`}>
              Skip the tour
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
