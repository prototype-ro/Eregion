"use client";

import { useEffect, useRef } from "react";
import { gsap, MOTION, useGSAP, whenMotionAllowed } from "@/lib/motion";

interface Props {
  open: boolean;
  onClose: () => void;
  label: string;
  /** Width of the dialog. */
  size?: "sm" | "md" | "lg";
  children: React.ReactNode;
}

const WIDTH = { sm: "w-[min(520px,94vw)]", md: "w-[min(760px,94vw)]", lg: "w-[min(1120px,94vw)]" };

// showModal() does not reliably stop the page behind it from scrolling (notably on touch), so this
// counts how many dialogs are open and locks the body itself while any are, restoring its previous
// inline style once the count returns to zero. A module-level counter, not per-instance state, is
// what makes stacked dialogs (one opened from another) survive the inner one closing first.
let openDialogs = 0;
let previousBodyOverflow: string | null = null;

function lockBodyScroll() {
  if (openDialogs === 0) {
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  openDialogs++;
}

function unlockBodyScroll() {
  openDialogs = Math.max(0, openDialogs - 1);
  if (openDialogs === 0) {
    document.body.style.overflow = previousBodyOverflow ?? "";
    previousBodyOverflow = null;
  }
}

/**
 * A modal built on the native dialog element, which gives focus trapping, Escape to close and a
 * backdrop for free. Children only mount while open, so a closed dialog loads nothing.
 */
export function Dialog({ open, onClose, label, size = "md", children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const body = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    lockBodyScroll();
    return unlockBodyScroll;
  }, [open]);

  // The panel rises a few pixels into place, so it reads as coming up from the page beneath.
  useGSAP(
    () => {
      if (!open || !body.current) return;
      whenMotionAllowed(() => {
        gsap.from(ref.current, { autoAlpha: 0, y: 14, scale: 0.985, duration: MOTION.enter, ease: MOTION.ease, clearProps: "all" });
      });
    },
    { dependencies: [open] },
  );

  return (
    <dialog
      ref={ref}
      aria-label={label}
      onClose={onClose}
      onClick={(event) => {
        // A click on the dialog element itself is a click on the backdrop.
        if (event.target === ref.current) onClose();
      }}
      className={`m-auto max-h-[90vh] ${WIDTH[size]} overflow-auto rounded-card border border-line bg-bg p-0 text-ink backdrop:bg-black/70`}
    >
      {open && <div ref={body} className="p-6 sm:p-8">{children}</div>}
    </dialog>
  );
}
