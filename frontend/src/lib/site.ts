/**
 * Who runs the site and how to reach them, shown in the footer and the legal pages. Fill these in before going
 * live: the privacy policy needs a named controller and a contact address (LGPD and GDPR both require one).
 */
export const SITE = {
  name: "Eregion",
  /** The person or company responsible for the site and its data. */
  operator: "Rodrigo Lage",
  /** Where people write about privacy requests, copyright claims and anything else. */
  contactEmail: "rodrigo.lage.2@gmail.com",
  /**
   * Where people can chip in for hosting (Ko-fi, Patreon, GitHub Sponsors). Wizards' Fan Content Policy allows
   * donations as long as nothing on the site is held back for them. Blank hides the link.
   */
  donateUrl: "",
  /** Minimum age to create an account. */
  minimumAge: 16,
  /** The date the privacy policy and terms last changed, shown at the top of each. */
  legalUpdated: "2026-11-19",
} as const;

/** True while the operator or contact address is still blank, so the legal pages can say so instead of pretending. */
export const SITE_INCOMPLETE = !SITE.operator || !SITE.contactEmail;
