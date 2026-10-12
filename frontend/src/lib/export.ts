import type { Board, DeckCardLine } from "./types";

export type ExportFormat = "plain" | "sets" | "arena" | "mtgo" | "csv";

export const EXPORT_FORMATS: Array<{ id: ExportFormat; label: string; hint: string; extension: "txt" | "csv" }> = [
  { id: "plain", label: "Plain list", hint: "Quantity and name, with section headings. Understood by almost every site.", extension: "txt" },
  { id: "sets", label: "With sets (Moxfield, Archidekt)", hint: "Adds the set and collector number, so the printing carries over.", extension: "txt" },
  { id: "arena", label: "MTG Arena", hint: "A Commander block and a Deck block. Maybe and considering cards are left out.", extension: "txt" },
  { id: "mtgo", label: "MTG Online", hint: "The deck, then the commander as the sideboard. Maybe and considering cards are left out.", extension: "txt" },
  { id: "csv", label: "Spreadsheet (CSV)", hint: "One row per card with board, set, tags and price.", extension: "csv" },
];

export interface ExportResult {
  text: string;
  filename: string;
  mime: string;
  /** Cards written out, counting copies. */
  cards: number;
}

const SECTION_TITLES: Array<[Board, string]> = [
  ["commander", "Commander"],
  ["main", "Deck"],
  ["maybe", "Maybeboard"],
  ["considering", "Considering"],
  ["tokens", "Tokens"],
];

const byName = (a: DeckCardLine, b: DeckCardLine) => a.name.localeCompare(b.name);

/** The printing of a line as "(SET) 123", or nothing for custom art, which no other site knows. */
function printing(line: DeckCardLine): string {
  if (line.customPrintingId || !line.setCode || line.setCode === "custom") return "";
  return ` (${line.setCode.toUpperCase()})${line.collectorNumber ? ` ${line.collectorNumber}` : ""}`;
}

const csvCell = (value: string | number) => {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "deck";

/**
 * Writes a deck in a format other sites and games read. Custom art is left out of the printing, since only
 * Eregion knows it. includeBench adds the maybeboard, considering and token cards to the formats that can hold them.
 */
export function exportDeck(lines: DeckCardLine[], format: ExportFormat, deckName: string, includeBench = false): ExportResult {
  const info = EXPORT_FORMATS.find((entry) => entry.id === format)!;
  const wanted = (board: Board) => board === "commander" || board === "main" || (includeBench && (board === "maybe" || board === "considering" || board === "tokens"));
  const of = (board: Board) => lines.filter((line) => line.board === board).sort(byName);
  const count = (list: DeckCardLine[]) => list.reduce((sum, line) => sum + line.quantity, 0);
  let text: string;
  let cards: number;

  if (format === "csv") {
    const rows = SECTION_TITLES.filter(([board]) => wanted(board)).flatMap(([board]) => of(board));
    text = [
      "Quantity,Name,Board,Set,Collector Number,Tags,Price USD",
      ...rows.map((line) =>
        [line.quantity, line.name, line.board, line.customPrintingId ? "" : line.setCode.toUpperCase(), line.customPrintingId ? "" : line.collectorNumber, line.tags.join("; "), line.priceUsd ?? ""].map(csvCell).join(","),
      ),
    ].join("\n");
    cards = count(rows);
  } else if (format === "mtgo") {
    const main = of("main");
    const sideboard = of("commander");
    text = [...main.map((line) => `${line.quantity} ${line.name}`), "", ...sideboard.map((line) => `SB: ${line.quantity} ${line.name}`)].join("\n").trim();
    cards = count(main) + count(sideboard);
  } else if (format === "arena") {
    const commander = of("commander");
    const main = of("main");
    const block = (title: string, list: DeckCardLine[]) => [title, ...list.map((line) => `${line.quantity} ${line.name}${printing(line)}`)].join("\n");
    text = [commander.length ? block("Commander", commander) : "", block("Deck", main)].filter(Boolean).join("\n\n");
    cards = count(commander) + count(main);
  } else {
    const withSets = format === "sets";
    const sections = SECTION_TITLES.filter(([board]) => wanted(board)).map(([board, title]) => ({ title, list: of(board) })).filter((section) => section.list.length > 0);
    text = sections.map(({ title, list }) => [title, ...list.map((line) => `${line.quantity} ${line.name}${withSets ? printing(line) : ""}`)].join("\n")).join("\n\n");
    cards = sections.reduce((sum, section) => sum + count(section.list), 0);
  }

  return {
    text,
    filename: `${slug(deckName)}.${info.extension}`,
    mime: info.extension === "csv" ? "text/csv;charset=utf-8" : "text/plain;charset=utf-8",
    cards,
  };
}
