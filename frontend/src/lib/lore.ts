import type { LoreCharacter, LoreColor, LoreCosmology, LoreDoc, LoreGroup } from "./types";

export type LoreSectionKey = "cosmology" | "groups" | "tales" | "colors" | "characters" | "naming" | "gaps";

/** A fresh id for a list item, kept so the editor can reorder and delete without index churn. */
export function newLoreId(): string {
  const crypto = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (crypto?.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function emptyCosmology(): LoreCosmology {
  return { overview: "", forces: [] };
}

export function blankGroup(): LoreGroup {
  return { id: newLoreId(), name: "", description: "", traits: "" };
}

export function blankColor(): LoreColor {
  return { id: newLoreId(), faction: "", color: "", meaning: "" };
}

export function blankCharacter(): LoreCharacter {
  return { id: newLoreId(), name: "", group: "", race: "", role: "", signature: "" };
}

export function emptyLoreDoc(): LoreDoc {
  return { cosmology: emptyCosmology(), groups: [], tales: [], colors: [], characters: [], naming: "", gaps: [], canonSource: null };
}

/** Trims every field and drops blank items, so a save never stores empty rows the editor would have to re-filter. */
export function trimLoreDoc(doc: LoreDoc): LoreDoc {
  const text = (value: string | null | undefined) => (value ?? "").trim();
  return {
    cosmology: {
      overview: text(doc.cosmology?.overview),
      forces: (doc.cosmology?.forces ?? []).map(text).filter(Boolean),
    },
    groups: (doc.groups ?? [])
      .filter((g) => text(g.name).length > 0)
      .map((g) => ({ ...g, name: text(g.name), description: text(g.description), traits: text(g.traits) })),
    tales: (doc.tales ?? []).map(text).filter(Boolean),
    colors: (doc.colors ?? [])
      .filter((c) => text(c.faction).length > 0 || text(c.color).length > 0)
      .map((c) => ({ ...c, faction: text(c.faction), color: text(c.color), meaning: text(c.meaning) })),
    characters: (doc.characters ?? [])
      .filter((c) => text(c.name).length > 0)
      .map((c) => ({
        ...c,
        name: text(c.name),
        group: text(c.group),
        race: text(c.race),
        role: text(c.role),
        signature: text(c.signature),
      })),
    naming: text(doc.naming),
    gaps: (doc.gaps ?? []).map(text).filter(Boolean),
    canonSource: text(doc.canonSource) || null,
  };
}

const SECTION_KEYS: LoreSectionKey[] = ["cosmology", "groups", "tales", "colors", "characters", "naming", "gaps"];

function withoutIds<T extends { id: string }>(items: T[]): Omit<T, "id">[] {
  return items.map(({ id: _id, ...rest }) => rest);
}

/** A per-section fingerprint, ignoring regenerated ids, used to tell which parts of the document a turn changed. */
export function sectionDigests(doc: LoreDoc): Record<LoreSectionKey, string> {
  return {
    cosmology: JSON.stringify({ ...doc.cosmology, canonSource: doc.canonSource }),
    groups: JSON.stringify(withoutIds(doc.groups)),
    tales: JSON.stringify(doc.tales),
    colors: JSON.stringify(withoutIds(doc.colors)),
    characters: JSON.stringify(withoutIds(doc.characters)),
    naming: JSON.stringify(doc.naming),
    gaps: JSON.stringify(doc.gaps),
  };
}

/** The sections whose digest differs between two snapshots, e.g. before and after a turn. */
export function changedSections(before: Record<LoreSectionKey, string>, after: Record<LoreSectionKey, string>): Set<LoreSectionKey> {
  const changed = new Set<LoreSectionKey>();
  for (const key of SECTION_KEYS) {
    if (before[key] !== after[key]) changed.add(key);
  }
  return changed;
}
