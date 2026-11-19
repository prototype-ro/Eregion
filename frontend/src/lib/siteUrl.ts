/** The public address of the site, for absolute links in the sitemap and robots file. Set SITE_URL in production. */
export function siteUrl(): string {
  return (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}
