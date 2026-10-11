/**
 * The sandbox for /dev/components. The standard itself now lives in lib/ui.ts and the app uses it. This file re-exports it and
 * adds the helpers that compare the 36px and 44px heights side by side.
 */
import { SIZES, STD_FIELD, STD_TAG, VARIANTS, std, stdIcon, type Size, type Variant } from "@/lib/ui";

export { SIZES, STD_FIELD, STD_TAG, VARIANTS, std, stdIcon };
export type { Size, Variant };

/** The two control heights being compared on the showcase: 36 with smaller text, or 44 with the regular text. */
export type Height = 36 | 44;
const AT: Record<Height, { button: string; field: string; icon: string }> = {
  36: { button: "min-h-9 px-4 text-[13px]", field: "min-h-9 px-4 text-[13px]", icon: "size-9" },
  44: { button: "min-h-11 px-5 text-[15px]", field: "min-h-11 px-5 text-[15px]", icon: "size-11" },
};
export const stdAt = (variant: Variant, height: Height) => `${std(variant, "md").replace(SIZES.md, "")} ${AT[height].button}`;
export const fieldAt = (height: Height) => `w-full rounded-full border border-line bg-surface text-ink placeholder:text-muted focus:border-ink focus:outline-none ${AT[height].field}`;
export const iconAt = (height: Height) => `${std("quiet", "md").replace(SIZES.md, "")} ${AT[height].icon}`;
export const segAt = (height: Height, on: boolean) => `rounded-full transition-colors ${height === 36 ? "min-h-7 px-3 text-[13px]" : "min-h-9 px-4 text-[15px]"} ${on ? "bg-ink text-bg" : "text-muted hover:text-ink"}`;
