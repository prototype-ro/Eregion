"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog } from "@/components/Dialog";
import { ApiError } from "@/lib/api";
import { blankCharacter, blankColor, blankGroup, changedSections, emptyLoreDoc, sectionDigests, trimLoreDoc } from "@/lib/lore";
import type { LoreSectionKey } from "@/lib/lore";
import type { LoreCharacter, LoreColor, LoreDoc, LoreGroup, LoreTurnMessage } from "@/lib/types";
import { btn } from "@/lib/ui";
import { useLore } from "@/lib/useLore";

interface Props {
  open: boolean;
  onClose: () => void;
  deckId: string;
  commanderName: string | null;
}

const LABEL = "text-sm text-muted";
const INPUT =
  "min-h-9 w-full rounded-full border border-line bg-surface px-4 text-[13px] text-ink placeholder:text-muted focus:border-ink focus:outline-none [@media(pointer:coarse)]:min-h-11";
const AREA =
  "w-full resize-y rounded-3xl border border-line bg-surface px-5 py-4 text-[15px] leading-relaxed text-ink placeholder:text-muted focus:border-ink focus:outline-none";
const FLASH = "transition-colors duration-700 motion-reduce:transition-none";

const SUGGESTIONS = ["invent a second, rival faction", "add a tale about how this all began", "make the naming convention harsher"];

function autoDraftInstruction(commanderName: string): string {
  return (
    `Draft the opening setting for the commander ${commanderName}. If this is a recognizable character from an ` +
    "existing franchise, write canon-accurate lore about them and set canonSource to that franchise's name. " +
    "Otherwise invent the whole setting from scratch and leave canonSource null."
  );
}

/** The lore editor, opened from the commander's card menu. Auto-drafts on first open; nothing is saved until Save is pressed. */
export function LoreDialog({ open, onClose, deckId, commanderName }: Props) {
  return (
    <Dialog open={open} onClose={onClose} label="Lore" size="lg">
      {open && <Body deckId={deckId} commanderName={commanderName} />}
    </Dialog>
  );
}

function Body({ deckId, commanderName }: { deckId: string; commanderName: string | null }) {
  const lore = useLore(deckId);
  const [draft, setDraft] = useState<LoreDoc>(emptyLoreDoc());
  const touched = useRef(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState(false);

  const [history, setHistory] = useState<LoreTurnMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [autoDrafting, setAutoDrafting] = useState(false);
  const autoDrafted = useRef(false);

  const [flashed, setFlashed] = useState<Set<LoreSectionKey>>(new Set());
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (lore.loaded && !touched.current) {
      setDraft(lore.doc);
    }
  }, [lore.loaded, lore.doc]);

  useEffect(() => {
    if (!lore.loaded || autoDrafted.current || !commanderName) return;
    const isEmpty = JSON.stringify(trimLoreDoc(lore.doc)) === JSON.stringify(emptyLoreDoc());
    if (!isEmpty) return;
    autoDrafted.current = true;
    let cancelled = false;
    setAutoDrafting(true);
    const before = sectionDigests(draft);
    const instruction = autoDraftInstruction(commanderName);
    void lore
      .turn(draft, [], instruction)
      .then(({ reply, doc }) => {
        if (cancelled) return;
        touched.current = true;
        setDraft(doc);
        setHistory((h) => [...h, { role: "user", text: instruction }, { role: "assistant", text: reply }]);
        flash(changedSections(before, sectionDigests(doc)));
      })
      .catch((err) => {
        if (cancelled) return;
        setChatError(err instanceof ApiError ? err.message : "Could not reach the AI");
      })
      .finally(() => {
        if (!cancelled) setAutoDrafting(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lore.loaded, lore.doc, commanderName]);

  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    [],
  );

  const update = (fn: (doc: LoreDoc) => LoreDoc) => {
    touched.current = true;
    setDraft(fn);
  };

  const dirty = JSON.stringify(trimLoreDoc(draft)) !== JSON.stringify(lore.doc);

  async function save() {
    setSaving(true);
    try {
      const clean = trimLoreDoc(draft);
      await lore.save(clean);
      setDraft(clean);
      setMessage("Saved");
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  function flash(sections: Set<LoreSectionKey>) {
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setFlashed(sections);
    flashTimer.current = setTimeout(() => setFlashed(new Set()), 1200);
  }

  async function sendText(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setChatError(null);
    setInput("");
    const before = sectionDigests(draft);
    try {
      const { reply, doc } = await lore.turn(draft, history.slice(-20), trimmed);
      touched.current = true;
      setDraft(doc);
      setHistory((h) => [...h, { role: "user", text: trimmed }, { role: "assistant", text: reply }]);
      flash(changedSections(before, sectionDigests(doc)));
    } catch (err) {
      setChatError(err instanceof ApiError ? err.message : "Could not reach the AI");
    } finally {
      setSending(false);
    }
  }

  const cardClass = (section: LoreSectionKey) =>
    `flex flex-col gap-3 rounded-card border border-line bg-surface/60 p-5 ${FLASH} ${flashed.has(section) ? "bg-accent/10" : ""}`;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-display text-[44px] leading-none">Lore</h2>
        {commanderName && <p className="mt-1 text-sm text-muted">Built around {commanderName}</p>}
      </div>

      {lore.loadError && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border border-danger-line bg-danger/10 px-4 py-3 text-sm text-ink">
          <span className="min-w-0 flex-1">{lore.loadError}</span>
          <button type="button" className={btn.secondary} onClick={() => void lore.retry()}>
            Retry
          </button>
        </div>
      )}

      {autoDrafting && commanderName && <p className="text-sm text-muted">Drafting {commanderName}&rsquo;s setting…</p>}

      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[2fr_3fr] lg:items-start">
        <div className="flex flex-col gap-3 rounded-card border border-line bg-surface/60 p-5 lg:sticky lg:top-6">
          <div>
            <h3 className="font-display text-xl">Talk to the AI</h3>
            <p className={LABEL}>Describe what to change. The document on the right fills in as you talk.</p>
          </div>
          <div className="flex max-h-[480px] flex-col gap-2 overflow-y-auto" aria-live="polite">
            {lore.loaded && history.length === 0 && !autoDrafting && (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-muted">Try:</p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} type="button" className={btn.quiet} disabled={!lore.loaded || sending} onClick={() => void sendText(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {history.map((m, i) => (
              <div
                key={i}
                className={
                  m.role === "user"
                    ? "max-w-[85%] self-end rounded-3xl bg-accent/20 px-4 py-2 text-[13px] text-ink"
                    : "max-w-[85%] self-start rounded-3xl border border-line bg-surface px-4 py-2 text-[13px] text-ink"
                }
              >
                {m.text}
              </div>
            ))}
            {sending && <div className="self-start text-sm text-muted">Thinking…</div>}
          </div>
          {chatError && <span className="text-sm text-danger">{chatError}</span>}
          <form
            className="flex items-center gap-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              void sendText(input);
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Tell the AI what to change…"
              aria-label="Message"
              className={INPUT}
              disabled={!lore.loaded || sending}
            />
            <button type="submit" className={btn.secondary} disabled={!lore.loaded || sending || !input.trim()}>
              Send
            </button>
          </form>
        </div>

        <div className="flex flex-col gap-6">
          <div className={cardClass("cosmology")}>
            <h3 className="font-display text-xl">Cosmology</h3>
            {draft.canonSource && <p className="text-sm text-accent-text">Canon source: {draft.canonSource}</p>}
            <p className="text-sm">{draft.cosmology.overview || "Nothing drafted yet."}</p>
            {draft.cosmology.forces.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {draft.cosmology.forces.map((f) => (
                  <span key={f} className="rounded-full border border-line px-2.5 py-0.5 text-xs text-muted">
                    {f}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className={cardClass("groups")}>
            <h3 className="font-display text-xl">Races, tribes &amp; factions</h3>
            <div className="flex flex-col gap-2">
              {draft.groups.map((g) => (
                <div key={g.id} className="rounded-2xl border border-line bg-surface px-3.5 py-2.5 text-sm">
                  <span className="font-medium">{g.name}</span>
                  {g.description && <span className="text-muted">: {g.description}</span>}
                </div>
              ))}
              {draft.groups.length === 0 && <p className="text-sm text-muted">Nothing drafted yet.</p>}
            </div>
          </div>

          <div className={cardClass("tales")}>
            <h3 className="font-display text-xl">Tales</h3>
            <ul className="flex flex-col gap-1.5 text-sm text-muted">
              {draft.tales.map((t, i) => (
                <li key={i}>• {t}</li>
              ))}
              {draft.tales.length === 0 && <li>Nothing drafted yet.</li>}
            </ul>
          </div>

          <div className={cardClass("colors")}>
            <h3 className="font-display text-xl">Signature colours</h3>
            <div className="flex flex-wrap gap-2">
              {draft.colors.map((c) => (
                <span key={c.id} className="rounded-full border border-line px-3 py-1 text-xs">
                  {c.faction} · {c.color}
                </span>
              ))}
              {draft.colors.length === 0 && <p className="text-sm text-muted">No colours locked yet.</p>}
            </div>
          </div>

          <div className={cardClass("characters")}>
            <h3 className="font-display text-xl">Named characters</h3>
            <div className="flex flex-col gap-2">
              {draft.characters.map((c) => (
                <div key={c.id} className="rounded-2xl border border-line bg-surface px-3.5 py-2.5 text-sm">
                  <span className="font-medium">{c.name}</span> <span className="text-muted">({c.role})</span>
                </div>
              ))}
              {draft.characters.length === 0 && <p className="text-sm text-muted">No named characters yet.</p>}
            </div>
          </div>

          <button type="button" className={btn.quiet} onClick={() => setAdvanced((v) => !v)}>
            {advanced ? "Hide advanced editing" : "Advanced editing"}
          </button>

          {advanced && (
            <div className="flex flex-col gap-6 border-t border-line pt-6">
              <div className={cardClass("cosmology")}>
                <h3 className="font-display text-xl">Cosmology</h3>
                <Field
                  label="Canon source"
                  value={draft.canonSource ?? ""}
                  onChange={(v) => update((d) => ({ ...d, canonSource: v }))}
                  placeholder="Leave empty for an invented setting"
                />
                <label className="flex flex-col gap-1.5">
                  <span className={LABEL}>Overview</span>
                  <textarea
                    className={AREA}
                    rows={3}
                    value={draft.cosmology.overview}
                    onChange={(e) => update((d) => ({ ...d, cosmology: { ...d.cosmology, overview: e.target.value } }))}
                  />
                </label>
                <StringList
                  label="Forces"
                  values={draft.cosmology.forces}
                  placeholder="A foundational power"
                  onChange={(forces) => update((d) => ({ ...d, cosmology: { ...d.cosmology, forces } }))}
                />
              </div>

              <div className={cardClass("groups")}>
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-xl">Races, tribes &amp; factions</h3>
                  <button type="button" className={btn.secondary} onClick={() => update((d) => ({ ...d, groups: [...d.groups, blankGroup()] }))}>
                    Add group
                  </button>
                </div>
                {draft.groups.map((group, index) => (
                  <GroupEditor
                    key={group.id}
                    group={group}
                    index={index}
                    count={draft.groups.length}
                    onChange={(next) => update((d) => ({ ...d, groups: d.groups.map((g) => (g.id === group.id ? next : g)) }))}
                    onRemove={() => update((d) => ({ ...d, groups: d.groups.filter((g) => g.id !== group.id) }))}
                    onMove={(by) =>
                      update((d) => {
                        const next = [...d.groups];
                        const j = index + by;
                        if (j < 0 || j >= next.length) return d;
                        [next[index], next[j]] = [next[j], next[index]];
                        return { ...d, groups: next };
                      })
                    }
                  />
                ))}
              </div>

              <div className={cardClass("tales")}>
                <h3 className="font-display text-xl">Tales</h3>
                <StringList label="Tales" values={draft.tales} placeholder="A myth, legend or past event" onChange={(tales) => update((d) => ({ ...d, tales }))} />
              </div>

              <div className={cardClass("colors")}>
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-xl">Signature colours</h3>
                  <button type="button" className={btn.secondary} onClick={() => update((d) => ({ ...d, colors: [...d.colors, blankColor()] }))}>
                    Add colour
                  </button>
                </div>
                {draft.colors.map((color) => (
                  <ColorEditor
                    key={color.id}
                    color={color}
                    onChange={(next) => update((d) => ({ ...d, colors: d.colors.map((c) => (c.id === color.id ? next : c)) }))}
                    onRemove={() => update((d) => ({ ...d, colors: d.colors.filter((c) => c.id !== color.id) }))}
                  />
                ))}
              </div>

              <div className={cardClass("characters")}>
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-xl">Named characters</h3>
                  <button type="button" className={btn.secondary} onClick={() => update((d) => ({ ...d, characters: [...d.characters, blankCharacter()] }))}>
                    Add character
                  </button>
                </div>
                {draft.characters.map((character) => (
                  <CharacterEditor
                    key={character.id}
                    character={character}
                    onChange={(next) => update((d) => ({ ...d, characters: d.characters.map((c) => (c.id === character.id ? next : c)) }))}
                    onRemove={() => update((d) => ({ ...d, characters: d.characters.filter((c) => c.id !== character.id) }))}
                  />
                ))}
              </div>

              <div className={cardClass("naming")}>
                <h3 className="font-display text-xl">Naming conventions</h3>
                <textarea
                  className={AREA}
                  rows={3}
                  value={draft.naming}
                  onChange={(e) => update((d) => ({ ...d, naming: e.target.value }))}
                  placeholder="Suffix patterns, a shared phonetic family…"
                />
              </div>

              <div className={cardClass("gaps")}>
                <h3 className="font-display text-xl">Open gaps</h3>
                <StringList label="Open gaps" values={draft.gaps} placeholder="Something still undecided" onChange={(gaps) => update((d) => ({ ...d, gaps }))} />
              </div>
            </div>
          )}

          <div className="flex items-center gap-2.5">
            <button type="button" className={btn.primary} disabled={!lore.loaded || !dirty || saving} onClick={() => void save()}>
              Save lore
            </button>
            {message && !dirty && <span className="text-sm text-muted">{message}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className={LABEL}>{label}</span>
      <input className={INPUT} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </label>
  );
}

function StringList({ label, values, onChange, placeholder }: { label: string; values: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <span className={LABEL}>{label}</span>
      {values.map((value, index) => (
        <div key={index} className="flex items-center gap-2">
          <input
            className={INPUT}
            value={value}
            placeholder={placeholder}
            onChange={(e) => onChange(values.map((v, i) => (i === index ? e.target.value : v)))}
          />
          <button type="button" className={btn.quiet} aria-label={`Remove ${value || "entry"}`} onClick={() => onChange(values.filter((_, i) => i !== index))}>
            Remove
          </button>
        </div>
      ))}
      <button type="button" className={btn.quiet} onClick={() => onChange([...values, ""])}>
        + Add
      </button>
    </div>
  );
}

function GroupEditor({
  group,
  index,
  count,
  onChange,
  onRemove,
  onMove,
}: {
  group: LoreGroup;
  index: number;
  count: number;
  onChange: (g: LoreGroup) => void;
  onRemove: () => void;
  onMove: (by: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-3xl border border-line bg-surface p-4">
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-muted">{index + 1}</span>
        <input className={INPUT} value={group.name} aria-label="Group name" placeholder="Group name" onChange={(e) => onChange({ ...group, name: e.target.value })} />
      </div>
      <input
        className={INPUT}
        value={group.description}
        aria-label="Description"
        placeholder="One line: what makes this group distinct"
        onChange={(e) => onChange({ ...group, description: e.target.value })}
      />
      <textarea
        className={AREA}
        rows={2}
        value={group.traits}
        aria-label="Traits"
        placeholder="Visual or behavioural traits"
        onChange={(e) => onChange({ ...group, traits: e.target.value })}
      />
      <div className="flex items-center gap-2">
        <button type="button" className={btn.quiet} disabled={index === 0} onClick={() => onMove(-1)} aria-label="Move group up">
          ↑
        </button>
        <button type="button" className={btn.quiet} disabled={index === count - 1} onClick={() => onMove(1)} aria-label="Move group down">
          ↓
        </button>
        <button type="button" className={btn.quiet} onClick={onRemove}>
          Remove
        </button>
      </div>
    </div>
  );
}

function ColorEditor({ color, onChange, onRemove }: { color: LoreColor; onChange: (c: LoreColor) => void; onRemove: () => void }) {
  return (
    <div className="flex flex-col gap-2 rounded-3xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <input className={`${INPUT} max-w-40`} value={color.faction} aria-label="Faction" placeholder="Faction" onChange={(e) => onChange({ ...color, faction: e.target.value })} />
        <input className={`${INPUT} max-w-40`} value={color.color} aria-label="Colour" placeholder="Colour" onChange={(e) => onChange({ ...color, color: e.target.value })} />
        <input className={`${INPUT} flex-1`} value={color.meaning} aria-label="What it marks" placeholder="What it marks" onChange={(e) => onChange({ ...color, meaning: e.target.value })} />
        <button type="button" className={btn.quiet} onClick={onRemove} aria-label="Remove colour">
          Remove
        </button>
      </div>
    </div>
  );
}

function CharacterEditor({ character, onChange, onRemove }: { character: LoreCharacter; onChange: (c: LoreCharacter) => void; onRemove: () => void }) {
  return (
    <div className="flex flex-col gap-2 rounded-3xl border border-line bg-surface p-4">
      <div className="flex flex-wrap gap-2">
        <input className={`${INPUT} flex-1`} value={character.name} aria-label="Name" placeholder="Name" onChange={(e) => onChange({ ...character, name: e.target.value })} />
        <input className={`${INPUT} max-w-40`} value={character.group} aria-label="Group" placeholder="Group" onChange={(e) => onChange({ ...character, group: e.target.value })} />
        <input className={`${INPUT} max-w-40`} value={character.race} aria-label="Race" placeholder="Race" onChange={(e) => onChange({ ...character, race: e.target.value })} />
      </div>
      <input className={INPUT} value={character.role} aria-label="Role" placeholder="Role" onChange={(e) => onChange({ ...character, role: e.target.value })} />
      <input className={INPUT} value={character.signature} aria-label="Signature detail" placeholder="Signature visual detail" onChange={(e) => onChange({ ...character, signature: e.target.value })} />
      <div className="flex items-center gap-2">
        <button type="button" className={btn.quiet} onClick={onRemove}>
          Remove
        </button>
      </div>
    </div>
  );
}
