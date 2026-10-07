"use client";

import { useEffect, useRef } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  label: string;
  /** Width of the dialog. */
  size?: "sm" | "md" | "lg";
  children: React.ReactNode;
}

const WIDTH = { sm: "w-[min(520px,94vw)]", md: "w-[min(760px,94vw)]", lg: "w-[min(1120px,94vw)]" };

/**
 * A modal built on the native dialog element, which gives focus trapping, Escape to close and a
 * backdrop for free. Children only mount while open, so a closed dialog loads nothing.
 */
export function Dialog({ open, onClose, label, size = "md", children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

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
      {open && <div className="p-6 sm:p-8">{children}</div>}
    </dialog>
  );
}
