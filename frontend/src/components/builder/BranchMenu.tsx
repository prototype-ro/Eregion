"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Presence } from "@/components/motion/Presence";
import type { Branch, Timeline } from "@/lib/types";
import { BranchActions } from "./BranchActions";

interface Props {
  open: boolean;
  /** The branch name that was clicked. The menu opens just under it. */
  anchor: HTMLElement | null;
  branch: Branch | undefined;
  deckId: string;
  timeline: Timeline;
  publishedVersion: number | null;
  locked: boolean;
  onMerge: (branch: Branch, into?: Branch) => void;
  onChanged: (timeline: Timeline, deletedBranchId: string | null) => void;
  onClose: () => void;
}

const WIDTH = 300;

/** A small menu for one branch, opened from its name on the timeline. */
export function BranchMenu({ open, anchor, branch, onClose, ...rest }: Props) {
  const body = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ left: number; top?: number; bottom?: number } | null>(null);

  useEffect(() => {
    if (!open || !anchor) return;
    const rect = anchor.getBoundingClientRect();
    const left = Math.min(Math.max(12, rect.left), window.innerWidth - WIDTH - 12);
    const room = window.innerHeight - rect.bottom;
    setPlace(room < 360 && rect.top > room ? { left, bottom: window.innerHeight - rect.top + 8 } : { left, top: rect.bottom + 8 });
  }, [open, anchor]);

  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      const target = event.target as Node;
      if (body.current?.contains(target) || anchor?.contains(target)) return;
      onClose();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        anchor?.focus();
      }
    };
    // A fixed menu would drift away from its name if the page moved under it.
    const close = () => onClose();
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", escape);
    window.addEventListener("scroll", close, { capture: true, passive: true });
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("scroll", close, { capture: true });
      window.removeEventListener("resize", close);
    };
  }, [open, anchor, onClose]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <Presence
      show={open && !!branch && !!place}
      y={8}
      scale={0.97}
      origin={place?.bottom !== undefined ? "bottom left" : "top left"}
      className="fixed z-[60] rounded-2xl border border-line bg-bg p-1.5 shadow-[0_18px_40px_rgba(0,0,0,0.45)]"
      style={{ left: place?.left, top: place?.top, bottom: place?.bottom, width: WIDTH }}
    >
      <div ref={body}>{branch && <BranchActions key={branch.id} branch={branch} onClose={onClose} {...rest} />}</div>
    </Presence>,
    document.body,
  );
}
