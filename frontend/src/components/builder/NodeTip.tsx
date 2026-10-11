"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

interface Props {
  show: boolean;
  left: number | undefined;
  top: number | undefined;
  /** Changes when the tooltip moves to another dot while open, so its text can refresh without the whole shape popping again. */
  contentKey: number | undefined;
  children: ReactNode;
}

const WIDTH = 280;
const BUBBLE = 28; // the circle that appears at the dot
// A cubic-bezier with an overshoot: it runs past the end and settles back, which is the spring.
const SPRING = "cubic-bezier(0.34, 1.56, 0.64, 1)";
const SOFT_SPRING = "cubic-bezier(0.3, 1.35, 0.5, 1)";
const OUT = "cubic-bezier(0.2, 0.8, 0.2, 1)";
const IN = "cubic-bezier(0.5, 0, 0.9, 0.5)";

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The tooltip over a version dot. A small round bubble pops out at the dot, and a card springs out of it: it starts narrow and
 * short, stretches past its size and settles, while the bubble melts into it. The text then fades in on its own layer, never scaled.
 *
 * Everything that moves is a transform or an opacity on a layer of its own, run by the Web Animations API. The browser's compositor
 * plays these without running any JavaScript per frame and without repainting, so they stay smooth even when the page is busy.
 * The shape, the border and the shadow are drawn once, at the finished size, and only scaled.
 */
export function NodeTip({ show, left, top, contentKey, children }: Props) {
  const place = useRef<HTMLDivElement>(null);
  const drop = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLDivElement>(null);
  const running = useRef<Animation[]>([]);
  const settled = useRef(false);
  const lastKey = useRef(contentKey);
  const [mounted, setMounted] = useState(show);
  if (show && !mounted) setMounted(true);

  const play = (el: HTMLElement | null, keyframes: Keyframe[], options: KeyframeAnimationOptions) => {
    if (!el) return null;
    const a = el.animate(keyframes, { fill: "both", ...options });
    running.current.push(a);
    return a;
  };
  const stop = () => {
    running.current.forEach((a) => a.cancel());
    running.current = [];
  };

  // Opens: the layers exist now, so the animations can start on the same frame, before anything is painted.
  useLayoutEffect(() => {
    if (!show || !mounted) return;
    stop();
    settled.current = false;
    if (reduced()) {
      // No motion: everything simply shows at its final state.
      [card.current, text.current].forEach((e) => e && (e.style.opacity = "1"));
      settled.current = true;
      return;
    }
    const sx = BUBBLE / WIDTH, sy = 0.24;
    // The card: narrow and short at the dot, then past its size, then settled. Squash and stretch.
    play(card.current, [
      { transform: `scale(${sx}, ${sy})`, opacity: 0, offset: 0 },
      { opacity: 1, offset: 0.18 },
      { transform: "scale(1.035, 1.07)", opacity: 1, offset: 0.62, easing: OUT },
      { transform: "scale(1, 1)", opacity: 1, offset: 1 },
    ], { duration: 640, easing: SOFT_SPRING });
    // The bubble: pops, then melts into the card as it grows.
    play(bubble.current, [
      { transform: "scale(0.2)", opacity: 0, offset: 0 },
      { transform: "scale(1)", opacity: 1, offset: 0.3 },
      { transform: "scale(1.5, 2.4)", opacity: 0, offset: 1 },
    ], { duration: 360, easing: SPRING });
    // A small drop with it, so it seems to fall out of the dot.
    play(drop.current, [{ transform: "translateY(-14px)" }, { transform: "translateY(0)" }], { duration: 520, easing: OUT });
    // The text waits for the card to be nearly open, then fades in as one piece.
    const t = play(text.current, [{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay: 300, easing: "ease-out" });
    t?.finished.then(() => (settled.current = true)).catch(() => {});
    return stop;
  }, [show, mounted]);

  // Closes: the text goes, then the card folds back toward the dot.
  useLayoutEffect(() => {
    if (show || !mounted) return;
    stop();
    if (reduced()) {
      setMounted(false);
      return;
    }
    play(text.current, [{ opacity: 1 }, { opacity: 0 }], { duration: 80, easing: "ease-in" });
    play(card.current, [{ transform: "scale(1, 1)", opacity: 1 }, { transform: `scale(${BUBBLE / WIDTH}, 0.24)`, opacity: 0 }], { duration: 230, easing: IN });
    play(bubble.current, [{ opacity: 0, transform: "scale(1.5, 2.4)" }, { opacity: 0, transform: "scale(0.2)" }], { duration: 230 });
    play(drop.current, [{ transform: "translateY(0)" }, { transform: "translateY(-10px)" }], { duration: 230, easing: IN });
    const last = running.current[2];
    let cancelled = false;
    last?.finished.then(() => !cancelled && setMounted(false)).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [show, mounted]);

  // Moving to a neighbouring dot while open: the card slides over (a CSS transition on a transform), and only its text refreshes.
  useEffect(() => {
    if (lastKey.current === contentKey) return;
    lastKey.current = contentKey;
    if (!show || !settled.current || reduced()) return;
    text.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 170, easing: "ease-out" });
  }, [contentKey, show]);

  useEffect(() => stop, []);

  if (!mounted) return null;
  const x = Math.round(left ?? 0), y = Math.round(top ?? 0);
  return (
    <div
      ref={place}
      role="tooltip"
      className="pointer-events-none fixed top-0 left-0 z-40"
      style={{ width: WIDTH, transform: `translate3d(${x - WIDTH / 2}px, ${y}px, 0)`, transition: "transform 170ms cubic-bezier(0.2, 0.8, 0.2, 1)", willChange: "transform" }}
    >
      <div ref={drop} className="relative" style={{ willChange: "transform" }}>
        <div ref={card} aria-hidden="true" className="absolute inset-0 rounded-2xl border border-line bg-bg shadow-[0_18px_40px_rgba(0,0,0,0.5)]" style={{ transformOrigin: "50% 0%", willChange: "transform, opacity", opacity: 0 }} />
        <div ref={bubble} aria-hidden="true" className="absolute top-0 left-1/2 rounded-full border border-line bg-bg" style={{ width: BUBBLE, height: BUBBLE, marginLeft: -BUBBLE / 2, transformOrigin: "50% 0%", willChange: "transform, opacity", opacity: 0 }} />
        <div ref={text} className="relative p-4 text-sm" style={{ willChange: "opacity", opacity: 0 }}>
          {children}
        </div>
      </div>
    </div>
  );
}
