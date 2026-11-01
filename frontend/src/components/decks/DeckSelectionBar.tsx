"use client";

import { plural } from "@/lib/deckfilter";
import { btn } from "@/lib/ui";

interface Props {
  shownCount: number;
  selectedCount: number;
  allSelected: boolean;
  onSelectAll: (checked: boolean) => void;
  onDelete: () => void;
  onCancel: () => void;
}

/** Replaces the normal filter/sort toolbar while bulk-selecting decks. */
export function DeckSelectionBar({ shownCount, selectedCount, allSelected, onSelectAll, onDelete, onCancel }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-4 border-t border-line py-6">
      <label className="flex items-center gap-2 text-[15px]">
        <input type="checkbox" checked={allSelected} onChange={(event) => onSelectAll(event.target.checked)} className="h-4 w-4 accent-accent" />
        Select all ({shownCount})
      </label>
      <p className="text-[15px] text-muted">{plural(selectedCount, "deck")} selected</p>
      <button type="button" disabled={selectedCount === 0} onClick={onDelete} className={btn.dangerSolid}>
        Delete{selectedCount > 0 ? ` (${selectedCount})` : ""}
      </button>
      <button type="button" onClick={onCancel} className={btn.secondary}>
        Cancel
      </button>
    </div>
  );
}
