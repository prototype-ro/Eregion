"use client";

import { useEffect, useState } from "react";

/** True one frame after mounting, so a bar can grow from nothing when it first appears. */
function useGrown(): boolean {
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  return grown;
}

const EASE = "ease-[cubic-bezier(0.22,1,0.36,1)]";

interface MeterProps {
  /** 0 to 1. */
  value: number;
  /** The track's height and radius. */
  className?: string;
  /** The fill, from theme colours only. */
  fill?: string;
}

/**
 * A horizontal bar. The fill is full width and is scaled to the value, so it grows and changes with transform alone, which is the one
 * thing the app lets move. With reduced motion it simply shows the value.
 */
export function Meter({ value, className = "h-1.5", fill = "bg-accent-text" }: MeterProps) {
  const grown = useGrown();
  const share = Math.min(1, Math.max(0, value));
  return (
    <div className={`overflow-hidden rounded-full bg-line ${className}`} aria-hidden="true">
      <div
        className={`h-full w-full origin-left rounded-full transition-transform duration-700 ${EASE} motion-reduce:transition-none ${fill}`}
        style={{ transform: `scaleX(${grown ? share : 0})` }}
      />
    </div>
  );
}

/** A vertical column that grows from the bottom in the same way. */
export function Column({ value, className = "h-20" }: { value: number; className?: string }) {
  const grown = useGrown();
  const share = Math.min(1, Math.max(0, value));
  return (
    <div className={`flex w-full items-end ${className}`} aria-hidden="true">
      <div
        className={`h-full w-full origin-bottom rounded-t-md bg-accent-text transition-transform duration-700 ${EASE} motion-reduce:transition-none`}
        style={{ transform: `scaleY(${grown ? share : 0})` }}
      />
    </div>
  );
}

/** One step of a segmented scale. Filled steps take the accent in growing strength, empty ones stay a hairline. */
export function Segment({ filled, strength, className = "h-2" }: { filled: boolean; strength: number; className?: string }) {
  const grown = useGrown();
  return (
    <div className={`flex-1 overflow-hidden rounded-full bg-line ${className}`} aria-hidden="true">
      <div
        className={`h-full w-full origin-left rounded-full transition-transform duration-500 ${EASE} motion-reduce:transition-none`}
        style={{
          transform: `scaleX(${grown && filled ? 1 : 0})`,
          background: `color-mix(in srgb, var(--accent-text) ${Math.round(strength * 100)}%, var(--bg))`,
        }}
      />
    </div>
  );
}
