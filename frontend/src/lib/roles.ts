/**
 * The roles a card can have in a deck, from the highest priority down. This mirrors the category order in the backend's
 * functional-tags.json, which decides which role wins when a card could have several. It is only used here to put role
 * groups in a sensible order, so a role the server sends that is not listed still shows, after these.
 */
export const ROLE_ORDER = ["Win Condition", "Board Wipe", "Counterspell", "Removal", "Ramp", "Tutor", "Card Draw", "Protection", "Recursion", "Extra Combat", "Stax", "Tokens", "Lifegain"];

export const UNCATEGORIZED = "Uncategorized";

/** Roles of a stats object, in display order, without the uncategorized count. */
export function knownRoles(roles: Record<string, number> | undefined): Array<[string, number]> {
  return Object.entries(roles ?? {}).filter(([role]) => role !== UNCATEGORIZED);
}

export const OTHER = "Other";
/** A role that is not one of the main ones and has fewer cards than this in a deck is shown inside "Other". */
const FOLD_BELOW = 3;

/** Whether this role is one of the main ones, or Uncategorized, which are always shown as themselves. */
const isMain = (role: string) => ROLE_ORDER.includes(role) || role === UNCATEGORIZED;

/**
 * Small long tail roles (a Mill card, a single Blink card) would make a deck's role list long and ragged, so the ones with fewer than
 * three cards fold into "Other". Returns a function that gives a role's shown name, given how many cards each role has.
 */
export function roleFolder(counts: Record<string, number>): (role: string) => string {
  return (role) => (isMain(role) || (counts[role] ?? 0) >= FOLD_BELOW ? role : OTHER);
}

/** Role counts as they are shown: small long tail roles added together under "Other", which sits before Uncategorized. */
export function foldedRoleCounts(roles: Record<string, number>): Record<string, number> {
  const shown = roleFolder(roles);
  const folded: Record<string, number> = {};
  let other = 0;
  for (const [role, count] of Object.entries(roles)) {
    if (shown(role) === OTHER) other += count;
    else if (role !== UNCATEGORIZED) folded[role] = count;
  }
  if (other) folded[OTHER] = other;
  if (roles[UNCATEGORIZED]) folded[UNCATEGORIZED] = roles[UNCATEGORIZED];
  return folded;
}
