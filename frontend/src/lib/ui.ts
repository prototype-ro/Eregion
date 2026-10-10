/*
 * Action hierarchy. Every screen has at most one primary action; everything else steps down.
 *
 * primary    filled Lyons Blue, the one thing this screen is for
 * secondary  hairline pill that fills on hover, for real alternatives
 * quiet      text only until hovered, for undo-ish or low-stakes actions
 * danger     muted red outline, kept apart from the rest, for anything destructive
 *
 * All of them keep a 44px touch target.
 */
const base = "inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-full text-[15px] disabled:pointer-events-none disabled:opacity-40";

export const btn = {
  primary: `${base} press bg-accent px-6 font-bold text-on-accent`,
  secondary: `${base} pill border border-ink px-5 font-medium`,
  quiet: `${base} px-4 font-medium text-muted transition-colors hover:bg-surface hover:text-ink`,
  danger: `${base} border border-danger-line px-5 font-medium text-danger transition-colors hover:bg-danger/10`,
} as const;

/** Small read-only label, for facts about a deck (format, branch). Not clickable. */
export const tag = "inline-flex items-center rounded-full border border-line px-3 py-1 text-[13px] text-muted";
