import { groupLines } from "@/lib/groups";
import type { DeckCardLine } from "@/lib/types";

/**
 * A checklist of the deck for paper: every card with a box to tick while sleeving or pulling cards from binders,
 * grouped by type, with what the player owns marked when known. Hidden on screen; the browser's print shows only this.
 */
export function PrintChecklist({ name, subtitle, lines, showOwned = false }: { name: string; subtitle: string; lines: DeckCardLine[]; showOwned?: boolean }) {
  const counted = lines.filter((line) => line.board === "commander" || line.board === "main");
  const groups = groupLines(counted, "type");
  const total = counted.reduce((sum, line) => sum + line.quantity, 0);
  return (
    <div className="print-sheet hidden" aria-hidden="true">
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>{name}</h1>
      <p style={{ fontSize: 11, marginBottom: 10 }}>
        {subtitle} · {total} cards
      </p>
      <div style={{ columnCount: 3, columnGap: 18, fontSize: 10, lineHeight: 1.45 }}>
        {groups.map((group) => (
          <div key={group.title} style={{ breakInside: "avoid", marginBottom: 8 }}>
            <p style={{ fontWeight: 700 }}>
              {group.title} ({group.lines.reduce((sum, line) => sum + line.quantity, 0)})
            </p>
            {group.lines.map((line) => (
              <p key={`${line.cardId}-${line.board}`}>
                ☐ {line.quantity} {line.name}
                {showOwned && line.owned < line.quantity ? `  (need ${line.quantity - line.owned})` : ""}
              </p>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
