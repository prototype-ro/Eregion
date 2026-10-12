/**
 * The advanced search form, and how it becomes a search in Scryfall's syntax. The form is a friendlier way to write that syntax:
 * what it builds is shown to the person and can be edited by hand before searching.
 *
 * Only the filters live here. Whether to keep to Commander-legal cards, which role, and the order are sent beside the text.
 */

export const COLORS = ["W", "U", "B", "R", "G", "C"] as const;
export type Color = (typeof COLORS)[number];
export type ColorMode = "all" | "any" | "exact";
export type IdentityMode = "within" | "includes" | "exact";
export type Compare = "=" | "<" | "<=" | ">" | ">=" | "!=";
export const COMPARES: Compare[] = ["=", "<", "<=", ">", ">=", "!="];
export const RARITIES = ["common", "uncommon", "rare", "mythic"] as const;

export interface Numeric {
  op: Compare;
  value: string;
}

export interface SearchForm {
  name: string;
  set: string;
  text: string;
  type: string;
  colors: Color[];
  colorMode: ColorMode;
  identity: Color[];
  identityMode: IdentityMode;
  manaValue: Numeric;
  manaCost: string;
  power: Numeric;
  toughness: Numeric;
  loyalty: Numeric;
  price: Numeric;
  rarity: string[];
}

const blank = (op: Compare = "="): Numeric => ({ op, value: "" });

export function emptyForm(): SearchForm {
  return {
    name: "",
    set: "",
    text: "",
    type: "",
    colors: [],
    colorMode: "all",
    identity: [],
    identityMode: "within",
    manaValue: blank(),
    manaCost: "",
    power: blank(">="),
    toughness: blank(">="),
    loyalty: blank(),
    price: blank("<="),
    rarity: [],
  };
}

const WORD = /^[\p{L}\p{N}_-]+$/u;

/**
 * Words and "quoted phrases" as filters on one field. A word stays bare when it is plain, and is quoted when it has anything
 * Scryfall could read as syntax. A leading minus means "without".
 */
export function terms(field: string, input: string): string[] {
  const out: string[] = [];
  for (const match of input.matchAll(/(-?)(?:"([^"]*)"|(\S+))/g)) {
    const negate = match[1] ? "-" : "";
    const phrase = match[2] !== undefined ? match[2] : match[3];
    const text = phrase.replaceAll('"', "").trim();
    if (!text) continue;
    out.push(`${negate}${field}:${WORD.test(text) ? text : `"${text}"`}`);
  }
  return out;
}

const NUMBER = /^-?\d+(\.\d+)?$/;

function numeric(key: string, { op, value }: Numeric): string[] {
  const trimmed = value.trim();
  return NUMBER.test(trimmed) ? [`${key}${op}${trimmed}`] : [];
}

/** Mana symbols as Scryfall writes them. "2G" and "{2}{G}" both work; anything that is not a symbol is dropped. */
export function manaSymbols(input: string): string {
  if (input.includes("{")) return (input.match(/\{[0-9WUBRGCXPSwubrgcxps/]+\}/g) ?? []).join("").toUpperCase();
  return (input.match(/\d+|[WUBRGCXSwubrgcxs]/g) ?? []).map((symbol) => `{${symbol.toUpperCase()}}`).join("");
}

function colorFilter(key: "c" | "id", picked: Color[], mode: "all" | "any" | "exact" | "within" | "includes"): string[] {
  if (picked.length === 0) return [];
  const colored = picked.filter((color) => color !== "C");
  // Colorless is its own answer, not a color to combine with others.
  if (colored.length === 0) return [`${key}=c`];
  const letters = colored.join("").toLowerCase();
  if (mode === "any") {
    return [colored.length === 1 ? `${key}:${letters}` : `(${colored.map((color) => `${key}:${color.toLowerCase()}`).join(" or ")})`];
  }
  const operator = mode === "exact" ? "=" : mode === "within" ? "<=" : ">=";
  return [`${key}${operator}${letters}`];
}

/** The Scryfall search the form stands for. Empty when nothing is filled in. */
export function buildQuery(form: SearchForm): string {
  const parts: string[] = [
    ...terms("name", form.name),
    ...terms("t", form.type),
    ...terms("o", form.text),
    ...(/^[a-z0-9]{2,6}$/i.test(form.set.trim()) ? [`s:${form.set.trim().toLowerCase()}`] : []),
    ...colorFilter("c", form.colors, form.colorMode),
    ...colorFilter("id", form.identity, form.identityMode),
    ...numeric("mv", form.manaValue),
    ...(manaSymbols(form.manaCost) ? [`m:${manaSymbols(form.manaCost)}`] : []),
    ...numeric("pow", form.power),
    ...numeric("tou", form.toughness),
    ...numeric("loy", form.loyalty),
    ...numeric("usd", form.price),
    ...(form.rarity.length === 1 ? [`r:${form.rarity[0]}`] : form.rarity.length > 1 ? [`(${form.rarity.map((rarity) => `r:${rarity}`).join(" or ")})`] : []),
  ];
  return parts.join(" ");
}

/** The colors of a card's identity string ("WUB") as picks for the form. A colorless commander picks the colorless symbol. */
export function identityPicks(identity: string): Color[] {
  const letters = identity.toUpperCase().split("").filter((letter): letter is Color => COLORS.includes(letter as Color) && letter !== "C");
  return letters.length ? letters : ["C"];
}
