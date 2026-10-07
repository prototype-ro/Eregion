import type { Board } from "./types";

export interface ParsedEntry {
  quantity: number;
  name: string;
  board: Board;
}

export interface ParseResult {
  entries: ParsedEntry[];
  /** Lines that looked like cards but could not be read. */
  ignored: string[];
}

const SECTIONS: Array<[RegExp, Board]> = [
  [/^(commanders?|command zone)\s*:?$/i, "commander"],
  [/^(main(board)?|deck|maindeck)\s*:?$/i, "main"],
  [/^(side(board)?|maybe(board)?)\s*:?$/i, "maybe"],
  [/^(considering|consider)\s*:?$/i, "considering"],
];

// "1 Sol Ring", "1x Sol Ring", "4 Island (UNF) 280", "1 Sol Ring *F*"
const PLAIN = /^(\d{1,3})\s*[xX]?\s+(.+)$/;
// " (SET) 123" and the foil marker, which only describe a printing
const PRINTING_SUFFIX = /\s+\([A-Za-z0-9]{2,8}\)(?:\s+[\w★-]+)?(?:\s+\*[A-Za-z]+\*)?\s*$/;
const FOIL_SUFFIX = /\s+\*[A-Za-z]+\*\s*$/;
const HEADER_ROW = /^"?(quantity|count|qty)"?\s*,/i;

/** Splits one CSV line into fields, honoring quotes so "Atraxa, Praetors' Voice" stays one field. */
export function splitCsv(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      fields.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current.trim());
  return fields;
}

/** Cleans a card name from the ways other sites decorate it. */
export function cleanName(raw: string): string {
  return raw
    .trim()
    .replace(/^"+|"+$/g, "")
    .replace(PRINTING_SUFFIX, "")
    .replace(FOIL_SUFFIX, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Reads a decklist pasted or loaded from a file. It understands the plain "1 Card Name"
 * format used by Moxfield, Archidekt, MTG Arena and MTGO, section headings such as
 * "Commander" and "Sideboard", "SB:" lines, set suffixes like "(CMM) 400", and simple CSV.
 * Lines that are only a name count as one copy.
 */
export function parseDecklist(text: string): ParseResult {
  const entries: ParsedEntry[] = [];
  const ignored: string[] = [];
  let board: Board = "main";
  let sawCommanderSection = false;

  for (const rawLine of text.split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line || line.startsWith("//") || line.startsWith("#") || HEADER_ROW.test(line)) continue;

    const section = SECTIONS.find(([pattern]) => pattern.test(line));
    if (section) {
      board = section[1];
      if (board === "commander") sawCommanderSection = true;
      continue;
    }

    let target: Board = board;
    if (/^SB:\s*/i.test(line)) {
      target = "maybe";
      line = line.replace(/^SB:\s*/i, "");
    }

    let quantity = 1;
    let name: string | null = null;
    const plain = PLAIN.exec(line);
    const fields = plain || !line.includes(",") ? null : splitCsv(line);
    if (plain) {
      quantity = Number(plain[1]);
      name = plain[2];
    } else if (fields && /^\d{1,3}$/.test(fields[0]) && fields[1]) {
      quantity = Number(fields[0]);
      name = fields[1];
    } else if (!/^\d/.test(line)) {
      name = line;
    }

    const cleaned = name === null ? "" : cleanName(name);
    if (!cleaned || quantity < 1) {
      ignored.push(rawLine.trim());
      continue;
    }
    entries.push({ quantity: Math.min(quantity, 99), name: cleaned, board: target });
  }

  // A commander section lists exactly one card, so anything extra there goes to the main board.
  if (sawCommanderSection) {
    let seen = false;
    for (const entry of entries) {
      if (entry.board !== "commander") continue;
      if (seen || entry.quantity > 1) entry.board = "main";
      else seen = true;
    }
  }
  return { entries, ignored };
}
