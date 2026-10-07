/** One symbol from a mana cost or a rules text, such as "{2}", "{W/U}" or "{T}". */
export interface ManaToken {
  /** The text between the braces. */
  raw: string;
  /** The mana-font class that draws it, or null when the font has no such symbol. */
  icon: string | null;
  /** What a screen reader should say. */
  label: string;
}

const COLORS: Record<string, string> = { W: "white", U: "blue", B: "black", R: "red", G: "green", C: "colorless", S: "snow", X: "X", Y: "Y", Z: "Z" };
const SPECIAL: Record<string, [string, string]> = {
  T: ["tap", "tap"],
  Q: ["untap", "untap"],
  E: ["e", "energy"],
  CHAOS: ["chaos", "chaos"],
  PW: ["loyalty-up", "planeswalker"],
};

const colorName = (part: string) => COLORS[part] ?? part;

/** Reads one symbol. Hybrid ({W/U}), generic hybrid ({2/W}) and Phyrexian ({W/P}) symbols are understood. */
export function parseSymbol(raw: string): ManaToken {
  const upper = raw.toUpperCase();
  if (SPECIAL[upper]) return { raw, icon: `ms-${SPECIAL[upper][0]}`, label: SPECIAL[upper][1] };
  if (/^\d{1,2}$/.test(upper)) return { raw, icon: `ms-${Number(upper)}`, label: `${Number(upper)} generic` };

  const parts = upper.split("/");
  const known = parts.every((part) => part === "P" || /^\d$/.test(part) || COLORS[part] !== undefined);
  if (!known) return { raw, icon: null, label: raw };

  const icon = `ms-${parts.join("").toLowerCase()}`;
  const label = parts.map((part) => (part === "P" ? "2 life" : /^\d$/.test(part) ? `${part} generic` : colorName(part))).join(" or ");
  return { raw, icon, label };
}

export type ManaPiece = { kind: "text"; text: string } | { kind: "symbol"; token: ManaToken };

/** Splits text into plain text and mana symbols, in order. */
export function splitMana(text: string): ManaPiece[] {
  const pieces: ManaPiece[] = [];
  for (const part of text.split(/(\{[^}]+\})/)) {
    if (!part) continue;
    const match = /^\{([^}]+)\}$/.exec(part);
    pieces.push(match ? { kind: "symbol", token: parseSymbol(match[1]) } : { kind: "text", text: part });
  }
  return pieces;
}

/** A cost read aloud: "{2}{W}{U}" becomes "2 generic, white, blue". */
export function describeCost(cost: string): string {
  return splitMana(cost)
    .filter((piece): piece is Extract<ManaPiece, { kind: "symbol" }> => piece.kind === "symbol")
    .map((piece) => piece.token.label)
    .join(", ");
}
