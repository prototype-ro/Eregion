"use client";

import { useRef } from "react";
import { gsap, MOTION, useGSAP, whenMotionAllowed } from "@/lib/motion";

/**
 * A list whose items settle in one after another when it first appears (or when `replayKey`
 * changes, for example on switching between grid and list). Only the first dozen items move,
 * so long lists stay cheap; the rest are simply there.
 */
export function StaggerList({
  className,
  replayKey,
  children,
  ...rest
}: React.HTMLAttributes<HTMLUListElement> & { replayKey?: string }) {
  const root = useRef<HTMLUListElement>(null);

  useGSAP(
    () => {
      const items = Array.from(root.current?.children ?? []).slice(0, 12);
      if (items.length === 0) return;
      whenMotionAllowed(() => {
        gsap.from(items, { autoAlpha: 0, y: 12, duration: MOTION.enter, ease: MOTION.ease, stagger: MOTION.stagger, clearProps: "all" });
      });
    },
    { scope: root, dependencies: [replayKey] },
  );

  return (
    <ul ref={root} className={className} {...rest}>
      {children}
    </ul>
  );
}
