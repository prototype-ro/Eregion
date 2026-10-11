/*
 * The button, tag and field standard, chosen on /dev/components.
 *
 * Action hierarchy: every screen has at most one primary action; everything else steps down.
 *   primary    solid accent key, the one thing this screen is for
 *   secondary  matte key, a step lighter than the panel, for real alternatives
 *   quiet      text only until hovered, for undo-ish or low-stakes actions
 *   danger     matte red, kept apart from the rest, for anything destructive
 *   glass      only for a control that floats over art or the timeline
 *
 * Sizes: 36px with 13px text by default, growing to 44px with 15px text on a touch screen. "lg" is 44px everywhere
 * (sign in, dialogs, the landing page). The audit tool measures without touch emulation, so it flags the 36px default on
 * a desktop. That is accepted. Radius rule: controls and fields are pills, cards are 28px, menus 16px.
 */
export const base =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium outline-offset-2 transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-150 focus-visible:outline-2 focus-visible:outline-accent-text disabled:pointer-events-none disabled:opacity-40";

export const SIZES = {
  /** The default. 36px with 13px text, and 44px with 15px text on a touch screen. */
  md: "min-h-9 px-4 text-[13px] [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:px-5 [@media(pointer:coarse)]:text-[15px]",
  /** For the places that carry more weight: sign in, dialogs, the landing page. 44px with 15px text. */
  lg: "min-h-11 px-6 text-[15px]",
} as const;

const EDGE = "border-[color-mix(in_srgb,var(--text)_15%,var(--bg))]";
export const VARIANTS = {
  /** The one thing a screen is for. A solid accent key. At most one per screen. */
  primary:
    "border border-[color-mix(in_srgb,var(--accent)_70%,#fff_30%)] bg-accent font-bold text-on-accent shadow-[inset_0_1px_0_rgba(255,255,255,.22),0_1px_2px_var(--key-shadow)] hover:bg-[color-mix(in_srgb,var(--accent)_86%,#fff_14%)] active:translate-y-px active:shadow-[inset_0_1px_3px_rgba(0,0,0,.5)]",
  /** A real alternative. A matte key, a step lighter than the panel. */
  secondary: `border ${EDGE} bg-[color-mix(in_srgb,var(--text)_8%,var(--bg))] text-ink shadow-[inset_0_1px_0_var(--key-hi),0_1px_2px_var(--key-shadow)] hover:border-[color-mix(in_srgb,var(--text)_26%,var(--bg))] hover:bg-[color-mix(in_srgb,var(--text)_13%,var(--bg))] active:translate-y-px active:shadow-[inset_0_1px_3px_rgba(0,0,0,.5)]`,
  /** Low stakes, or the way out: cancel, discard, show more. Text until hovered. */
  quiet: "text-muted hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:text-ink active:scale-[0.97]",
  /** Anything destructive, kept apart from the rest. */
  danger:
    "border border-[color-mix(in_srgb,var(--danger)_34%,var(--bg))] bg-[color-mix(in_srgb,var(--danger)_14%,var(--bg))] text-danger shadow-[inset_0_1px_0_var(--key-hi),0_1px_2px_var(--key-shadow)] hover:bg-[color-mix(in_srgb,var(--danger)_22%,var(--bg))] active:translate-y-px",
  /** The confirm step of a destructive action. */
  dangerSolid: "bg-danger font-bold text-bg active:scale-[0.97]",
  /** Only for a control that floats over art or the timeline, where there is something to see through. A handful per screen at most. */
  glass:
    "border border-[color-mix(in_srgb,var(--text)_24%,transparent)] bg-[color-mix(in_srgb,var(--text)_9%,transparent)] text-ink shadow-[inset_0_1px_0_var(--glass-hi),0_8px_28px_var(--glass-shadow)] backdrop-blur-[14px] backdrop-saturate-[1.7] hover:scale-[1.03] hover:bg-[color-mix(in_srgb,var(--text)_15%,transparent)] active:scale-[0.98]",
} as const;

export type Variant = keyof typeof VARIANTS;
export type Size = keyof typeof SIZES;

export const std = (variant: Variant = "secondary", size: Size = "md") => `${base} ${VARIANTS[variant]} ${SIZES[size]}`;

/** A square button for a single icon. */
export const stdIcon = (size: Size = "md") => `${base} ${VARIANTS.quiet} ${size === "md" ? "size-9 [@media(pointer:coarse)]:size-11" : "size-11"}`;

/** A read-only label, a status, and a count. Never clickable. */
export const STD_TAG = {
  plain: "inline-flex items-center rounded-full border border-line px-3 py-1 text-[13px] text-muted",
  accent: "inline-flex items-center rounded-full border border-accent-text px-3 py-1 text-[13px] text-accent-text",
  add: "inline-flex items-center rounded-full border border-add-line px-3 py-1 text-[13px] text-add-text",
  danger: "inline-flex items-center rounded-full border border-danger-line px-3 py-1 text-[13px] text-danger",
  count: "inline-flex min-w-6 items-center justify-center rounded-full bg-surface px-2 py-0.5 font-mono text-xs text-ink",
} as const;

/** Text fields and selects: a pill, in the same two sizes as the buttons, so a form row lines up. */
export const STD_FIELD = {
  md: "min-h-9 w-full rounded-full border border-line bg-surface px-4 text-[13px] text-ink placeholder:text-muted focus:border-ink focus:outline-none [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:px-5 [@media(pointer:coarse)]:text-[15px]",
  lg: "min-h-11 w-full rounded-full border border-line bg-surface px-5 text-[15px] text-ink placeholder:text-muted focus:border-ink focus:outline-none",
} as const;

export const btn = {
  primary: std("primary"),
  secondary: std("secondary"),
  quiet: std("quiet"),
  danger: std("danger"),
  dangerSolid: std("dangerSolid"),
  glass: std("glass"),
  /** The weighty versions, 44px on every screen. */
  large: {
    primary: std("primary", "lg"),
    secondary: std("secondary", "lg"),
    danger: std("danger", "lg"),
    dangerSolid: std("dangerSolid", "lg"),
    quiet: std("quiet", "lg"),
  },
} as const;

/** Small read-only label, for facts about a deck (format, branch). Not clickable. */
export const tag = STD_TAG.plain;
export const field = STD_FIELD;
