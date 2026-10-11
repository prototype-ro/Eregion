"use client";

import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { gsap, MOTION, REDUCED, useGSAP } from "@/lib/motion";

interface Props {
  show: boolean;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  id?: string;
  role?: string;
  /** Open and close by height, for blocks that push the page, such as a panel body or a confirmation. */
  collapse?: boolean;
  /** Play the leaving animation. Off means the content just goes. */
  exit?: boolean;
  /** Play the entrance on the very first render too. By default what is already there when the page loads stays still. */
  appear?: boolean;
  /** How far it travels while entering, and how small it starts, for popovers and toasts. */
  y?: number;
  scale?: number;
  origin?: string;
  /** A selector for children that follow the entrance one after another, such as menu items. */
  stagger?: string;
}

/**
 * Keeps its children on screen while they animate out, then removes them. Only transform, opacity and, for
 * collapse, one height. Reduced motion shows and removes them at once.
 */
export function Presence({ show, children, className, style, id, role, collapse = false, exit = true, appear = false, y = 8, scale = 1, origin, stagger }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(show);
  const first = useRef(true);
  // Asked to show: mount now, and the effect below plays the entrance once the element exists.
  if (show && !mounted) setMounted(true);

  useGSAP(
    () => {
      const element = ref.current;
      const skipEntrance = first.current && !appear;
      first.current = false;
      const reduced = window.matchMedia(REDUCED).matches;

      if (show) {
        if (!element || skipEntrance || reduced) return;
        gsap.killTweensOf(element);
        // Coming back in the middle of leaving continues from where it is. A fresh mount starts from the hidden state.
        const fresh = Number(getComputedStyle(element).opacity) > 0.99;
        if (collapse) {
          gsap.set(element, { overflow: "hidden" });
          const to = { height: "auto", autoAlpha: 1, duration: MOTION.enter + 0.08, ease: "power2.out", clearProps: "height,overflow,opacity,visibility" };
          if (fresh) gsap.fromTo(element, { height: 0, autoAlpha: 0 }, to);
          else gsap.to(element, to);
        } else {
          const to = { autoAlpha: 1, y: 0, scale: 1, duration: MOTION.enter, ease: MOTION.ease, clearProps: "opacity,visibility,transform" };
          if (fresh) gsap.fromTo(element, { autoAlpha: 0, y, scale }, to);
          else gsap.to(element, to);
        }
        if (stagger) {
          gsap.from(element.querySelectorAll(stagger), { autoAlpha: 0, y: 4, duration: 0.24, ease: MOTION.ease, stagger: { amount: 0.1 }, delay: 0.06, clearProps: "opacity,visibility,transform" });
        }
        return;
      }

      if (!mounted) return;
      if (!element || !exit || reduced) {
        setMounted(false);
        return;
      }
      gsap.killTweensOf(element);
      if (collapse) {
        gsap.set(element, { overflow: "hidden" });
        gsap.to(element, { height: 0, autoAlpha: 0, duration: 0.26, ease: "power2.in", onComplete: () => setMounted(false) });
      } else {
        gsap.to(element, { autoAlpha: 0, y: y / 2, scale, duration: 0.16, ease: "power1.in", onComplete: () => setMounted(false) });
      }
    },
    { dependencies: [show] },
  );

  if (!mounted) return null;
  return (
    <div ref={ref} id={id} role={role} className={className} style={{ ...style, transformOrigin: origin }}>
      {children}
    </div>
  );
}
