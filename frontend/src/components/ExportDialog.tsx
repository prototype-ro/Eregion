"use client";

import { useMemo, useRef, useState } from "react";
import { Dialog } from "@/components/Dialog";
import { EXPORT_FORMATS, exportDeck, type ExportFormat } from "@/lib/export";
import type { DeckCardLine } from "@/lib/types";
import { btn, field } from "@/lib/ui";

const FORMAT_KEY = "eregion-export-format";

interface Props {
  open: boolean;
  onClose: () => void;
  deckName: string;
  lines: DeckCardLine[];
}

/** Copy or download a deck in a format other sites and games read. */
export function ExportDialog(props: Props) {
  return (
    <Dialog open={props.open} onClose={props.onClose} label="Export deck" size="md">
      <Body {...props} />
    </Dialog>
  );
}

function Body({ onClose, deckName, lines }: Props) {
  const [format, setFormat] = useState<ExportFormat>(() => {
    try {
      const stored = localStorage.getItem(FORMAT_KEY);
      return EXPORT_FORMATS.some((entry) => entry.id === stored) ? (stored as ExportFormat) : "plain";
    } catch {
      return "plain";
    }
  });
  const [bench, setBench] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  const result = useMemo(() => exportDeck(lines, format, deckName, bench), [lines, format, deckName, bench]);
  const info = EXPORT_FORMATS.find((entry) => entry.id === format)!;
  const hasBench = lines.some((line) => line.board === "maybe" || line.board === "considering");
  const benchApplies = format === "plain" || format === "sets" || format === "csv";

  function choose(next: ExportFormat) {
    setFormat(next);
    setMessage(null);
    try {
      localStorage.setItem(FORMAT_KEY, next);
    } catch {
      // The choice just is not remembered.
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(result.text);
      setMessage("Copied. Paste it into the other site.");
    } catch {
      // Without clipboard access, select the text so the person can copy it by hand.
      area.current?.select();
      setMessage("Could not copy by itself. The text is selected, so press Ctrl or Cmd and C.");
    }
  }

  function download() {
    const url = URL.createObjectURL(new Blob([result.text], { type: result.mime }));
    const link = document.createElement("a");
    link.href = url;
    link.download = result.filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage(`Saved as ${result.filename}.`);
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 className="font-display text-[44px] leading-none">Export deck</h2>

      <div className="flex flex-col gap-2">
        <label htmlFor="export-format" className="text-sm text-muted">
          Format
        </label>
        <select id="export-format" value={format} onChange={(event) => choose(event.target.value as ExportFormat)} className={field.lg}>
          {EXPORT_FORMATS.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label}
            </option>
          ))}
        </select>
        <p className="text-sm leading-snug text-muted">{info.hint}</p>
      </div>

      {hasBench && benchApplies && (
        <label className="flex items-center gap-3 text-[15px]">
          <input type="checkbox" checked={bench} onChange={(event) => setBench(event.target.checked)} className="h-5 w-5 accent-[var(--accent-text)]" />
          Include the maybeboard and considering cards
        </label>
      )}

      <div className="flex flex-col gap-2">
        <label htmlFor="export-text" className="text-sm text-muted">
          {result.cards} {result.cards === 1 ? "card" : "cards"}
        </label>
        <textarea
          id="export-text"
          ref={area}
          readOnly
          rows={12}
          value={result.text}
          onFocus={(event) => event.currentTarget.select()}
          className="w-full resize-y rounded-3xl border border-line bg-surface px-5 py-4 font-mono text-sm leading-relaxed text-ink focus:border-ink focus:outline-none"
        />
      </div>

      {message && (
        <p role="status" className="text-sm text-accent-text">
          {message}
        </p>
      )}

      <div className="flex flex-wrap gap-2.5">
        <button type="button" onClick={() => void copy()} disabled={result.text === ""} className={btn.large.primary}>
          Copy
        </button>
        <button type="button" onClick={download} disabled={result.text === ""} className={btn.large.secondary}>
          Download {info.extension === "csv" ? ".csv" : ".txt"}
        </button>
        <button type="button" onClick={onClose} className={btn.large.secondary}>
          Close
        </button>
      </div>
    </div>
  );
}
