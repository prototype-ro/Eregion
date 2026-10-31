"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { blankCharacter, blankColor, blankTier, emptyLoreDoc, trimLoreDoc } from "@/lib/lore";
import type { LoreCharacter, LoreColor, LoreDoc, LoreMechanism, LoreTier } from "@/lib/types";
import { btn } from "@/lib/ui";
import { useLore } from "@/lib/useLore";

interface Props {
  deckId: string;
}

const LABEL = "text-sm text-muted";
const INPUT = "min-h-9 w-full rounded-full border border-line bg-surface px-4 text-[13px] text-ink placeholder:text-muted focus:border-ink focus:outline-none [@media(pointer:coarse)]:min-h-11";
const AREA =
  "w-full resize-y rounded-3xl border border-line bg-surface px-5 py-4 text-[15px] leading-relaxed text-ink placeholder:text-muted focus:border-ink focus:outline-none";

/** The deck's invented setting, edited as structure and drafted/checked by the Lore Creator model. */
export function LoreSection({ deckId }: Props) {
  const lore = useLore(deckId);
  const [draft, setDraft] = useState<LoreDoc>(emptyLoreDoc());
  const touched = useRef(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [instruction, setInstruction] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [proposal, setProposal] = useState<LoreDoc | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);

  useEffect(() => {
    if (lore.loaded && !touched.current) {
      setDraft(lore.doc);
    }
  }, [lore.loaded, lore.doc]);

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

  async function draftLore() {
    setDrafting(true);
    setDraftError(null);
    try {
      setProposal(await lore.draft(instruction));
    } catch (err) {
      setDraftError(err instanceof ApiError ? err.message : "Could not draft");
    } finally {
      setDrafting(false);
    }
  }

  return (
    <section aria-label="Lore" className="mt-16 flex flex-col gap-8">
      <h2 className="font-display text-[44px] leading-none">Lore</h2>

      {lore.loadError && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border border-danger-line bg-danger/10 px-4 py-3 text-sm text-ink">
          <span className="min-w-0 flex-1">{lore.loadError}</span>
          <button type="button" className={btn.secondary} onClick={() => void lore.retry()}>
            Retry
          </button>
        </div>
      )}

      {/* Cosmology */}
      <div className="flex flex-col gap-3 rounded-card border border-line bg-surface/60 p-5">
        <h3 className="font-display text-xl">Cosmology</h3>
        <p className={LABEL}>Structural borrowing, never name borrowing. Invent every proper noun from scratch.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Maker" value={draft.cosmology.maker} onChange={(v) => update((d) => ({ ...d, cosmology: { ...d.cosmology, maker: v } }))} placeholder="The supreme maker" />
          <Field label="Corruptor" value={draft.cosmology.corruptor} onChange={(v) => update((d) => ({ ...d, cosmology: { ...d.cosmology, corruptor: v } }))} placeholder="The one who rebels and corrupts" />
        </div>
        <StringList
          label="Lesser spirits"
          values={draft.cosmology.spirits}
          placeholder="A spirit's name"
          onChange={(spirits) => update((d) => ({ ...d, cosmology: { ...d.cosmology, spirits } }))}
        />
      </div>

      {/* Spectrum */}
      <div className="flex flex-col gap-3 rounded-card border border-line bg-surface/60 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display text-xl">Corruption spectrum</h3>
            <p className={LABEL}>Ordered from un-fallen to most-lost. Mutation keeps personhood; erasure loses name and face.</p>
          </div>
          <button type="button" className={btn.secondary} onClick={() => update((d) => ({ ...d, tiers: [...d.tiers, blankTier()] }))}>
            Add tier
          </button>
        </div>
        {draft.tiers.map((tier, index) => (
          <TierEditor
            key={tier.id}
            tier={tier}
            index={index}
            count={draft.tiers.length}
            onChange={(next) => update((d) => ({ ...d, tiers: d.tiers.map((t) => (t.id === tier.id ? next : t)) }))}
            onRemove={() => update((d) => ({ ...d, tiers: d.tiers.filter((t) => t.id !== tier.id) }))}
            onMove={(by) =>
              update((d) => {
                const next = [...d.tiers];
                const j = index + by;
                if (j < 0 || j >= next.length) return d;
                [next[index], next[j]] = [next[j], next[index]];
                return { ...d, tiers: next };
              })
            }
          />
        ))}
        {draft.tiers.length === 0 && <p className="text-sm text-muted">No tiers yet. A spectrum of several tiers, not a binary.</p>}
      </div>

      {/* Signature colours */}
      <div className="flex flex-col gap-3 rounded-card border border-line bg-surface/60 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display text-xl">Signature colours</h3>
            <p className={LABEL}>One colour locked to each faction, kept as its marker on every card.</p>
          </div>
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
        {draft.colors.length === 0 && <p className="text-sm text-muted">No colours locked yet.</p>}
      </div>

      {/* Named characters */}
      <div className="flex flex-col gap-3 rounded-card border border-line bg-surface/60 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display text-xl">Named characters</h3>
            <p className={LABEL}>Only tiers that keep personhood get names, in one consistent register.</p>
          </div>
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
        {draft.characters.length === 0 && <p className="text-sm text-muted">No named characters yet.</p>}
      </div>

      {/* Naming + gaps */}
      <div className="flex flex-col gap-3 rounded-card border border-line bg-surface/60 p-5">
        <h3 className="font-display text-xl">Naming conventions</h3>
        <textarea className={AREA} rows={3} value={draft.naming} onChange={(e) => update((d) => ({ ...d, naming: e.target.value }))} placeholder="Suffix patterns, a shared phonetic family…" />
        <StringList label="Open gaps" values={draft.gaps} placeholder="Something still undecided" onChange={(gaps) => update((d) => ({ ...d, gaps }))} />
      </div>

      {/* Lore Creator */}
      <div className="flex flex-col gap-3 rounded-card border border-line bg-surface/60 p-5">
        <div>
          <h3 className="font-display text-xl">Lore Creator</h3>
          <p className={LABEL}>Ask the model to draft the whole setting from the rules. You edit and save what you keep.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <input value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="Invent a Tolkien-shaped cosmology with a five-tier corruption spectrum" aria-label="Draft instruction" className={`${INPUT} max-w-xl`} />
          <button type="button" className={btn.primary} disabled={!lore.loaded || drafting || !instruction.trim()} onClick={() => void draftLore()}>
            Draft
          </button>
        </div>
        {drafting && <span className="text-sm text-muted">Thinking…</span>}
        {draftError && <span className="text-sm text-danger">{draftError}</span>}
        {proposal && (
          <div className="flex flex-col gap-3 rounded-3xl border border-line bg-surface p-5">
            <p className="text-sm text-muted">A draft is ready. Review it, then apply it to the editor above and edit before saving.</p>
            <ProposalSummary doc={proposal} />
            <div className="flex gap-2.5">
              <button
                type="button"
                className={btn.primary}
                onClick={() => {
                  touched.current = true;
                  setDraft(proposal);
                  setProposal(null);
                }}
              >
                Apply draft
              </button>
              <button type="button" className={btn.quiet} onClick={() => setProposal(null)}>
                Discard
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Save */}
      <div className="flex items-center gap-2.5">
        <button type="button" className={btn.primary} disabled={!lore.loaded || !dirty || saving} onClick={() => void save()}>
          Save lore
        </button>
        {message && !dirty && <span className="text-sm text-muted">{message}</span>}
      </div>
    </section>
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

function TierEditor({ tier, index, count, onChange, onRemove, onMove }: { tier: LoreTier; index: number; count: number; onChange: (t: LoreTier) => void; onRemove: () => void; onMove: (by: number) => void }) {
  return (
    <div className="flex flex-col gap-2 rounded-3xl border border-line bg-surface p-4">
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-muted">{index + 1}</span>
        <input className={INPUT} value={tier.name} aria-label="Tier name" placeholder="Tier name" onChange={(e) => onChange({ ...tier, name: e.target.value })} />
        <select
          className={INPUT}
          value={tier.mechanism}
          aria-label="Corruption mechanism"
          onChange={(e) => onChange({ ...tier, mechanism: e.target.value as LoreMechanism })}
        >
          <option value="ADDITION">mutation — keeps personhood</option>
          <option value="ERASURE">erasure — loses name, face</option>
        </select>
      </div>
      <input className={INPUT} value={tier.definition} aria-label="Definition" placeholder="One line: what makes this tier structurally different" onChange={(e) => onChange({ ...tier, definition: e.target.value })} />
      <textarea className={AREA} rows={2} value={tier.vocabulary} aria-label="Visual vocabulary" placeholder="Visual-material vocabulary (fused bone, cracked stone… or fraying to smoke, no face)" onChange={(e) => onChange({ ...tier, vocabulary: e.target.value })} />
      <div className="flex items-center gap-2">
        <button type="button" className={btn.quiet} disabled={index === 0} onClick={() => onMove(-1)} aria-label="Move tier up">
          ↑
        </button>
        <button type="button" className={btn.quiet} disabled={index === count - 1} onClick={() => onMove(1)} aria-label="Move tier down">
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
    <div className="flex flex-wrap items-center gap-2">
      <input className={`${INPUT} max-w-40`} value={color.faction} aria-label="Faction" placeholder="Faction" onChange={(e) => onChange({ ...color, faction: e.target.value })} />
      <input className={`${INPUT} max-w-40`} value={color.color} aria-label="Colour" placeholder="Colour" onChange={(e) => onChange({ ...color, color: e.target.value })} />
      <input className={`${INPUT} flex-1`} value={color.meaning} aria-label="What it marks" placeholder="What it marks" onChange={(e) => onChange({ ...color, meaning: e.target.value })} />
      <button type="button" className={btn.quiet} onClick={onRemove} aria-label="Remove colour">
        Remove
      </button>
    </div>
  );
}

function CharacterEditor({ character, onChange, onRemove }: { character: LoreCharacter; onChange: (c: LoreCharacter) => void; onRemove: () => void }) {
  return (
    <div className="flex flex-col gap-2 rounded-3xl border border-line bg-surface p-4">
      <div className="flex flex-wrap gap-2">
        <input className={`${INPUT} flex-1`} value={character.name} aria-label="Name" placeholder="Name" onChange={(e) => onChange({ ...character, name: e.target.value })} />
        <input className={`${INPUT} max-w-40`} value={character.tier} aria-label="Tier" placeholder="Tier" onChange={(e) => onChange({ ...character, tier: e.target.value })} />
        <input className={`${INPUT} max-w-40`} value={character.race} aria-label="Race" placeholder="Race" onChange={(e) => onChange({ ...character, race: e.target.value })} />
      </div>
      <input className={INPUT} value={character.role} aria-label="Role" placeholder="Role" onChange={(e) => onChange({ ...character, role: e.target.value })} />
      <input className={INPUT} value={character.signature} aria-label="Signature detail" placeholder="Signature visual detail" onChange={(e) => onChange({ ...character, signature: e.target.value })} />
      <div>
        <button type="button" className={btn.quiet} onClick={onRemove}>
          Remove
        </button>
      </div>
    </div>
  );
}

function ProposalSummary({ doc }: { doc: LoreDoc }) {
  return (
    <div className="flex flex-col gap-1.5 text-sm text-ink">
      {doc.cosmology?.maker && <div>Maker: <span className="text-muted">{doc.cosmology.maker}</span></div>}
      {doc.cosmology?.corruptor && <div>Corruptor: <span className="text-muted">{doc.cosmology.corruptor}</span></div>}
      {doc.tiers.length > 0 && <div>Tiers: <span className="text-muted">{doc.tiers.map((t) => t.name).filter(Boolean).join(", ")}</span></div>}
      {doc.colors.length > 0 && <div>Colours: <span className="text-muted">{doc.colors.map((c) => `${c.color}${c.faction ? " = " + c.faction : ""}`).join(", ")}</span></div>}
      {doc.characters.length > 0 && <div>Characters: <span className="text-muted">{doc.characters.map((c) => c.name).join(", ")}</span></div>}
      {doc.gaps.length > 0 && <div>Open gaps: <span className="text-muted">{doc.gaps.length}</span></div>}
    </div>
  );
}
