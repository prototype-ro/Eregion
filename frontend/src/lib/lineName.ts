/**
 * How a line of versions is named to players. Every deck starts on one called "main", which reads as the main deck;
 * any other line is a variant and keeps the name its player gave it.
 */
export function lineName(name: string | null | undefined): string {
  if (!name || name === "main") return "main deck";
  return name;
}
