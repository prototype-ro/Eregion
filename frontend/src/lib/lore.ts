import type { LoreCharacter, LoreColor, LoreCosmology, LoreDoc, LoreMechanism, LoreTier } from "./types";

/** A fresh id for a list item, kept so the editor can reorder and delete without index churn. */
export function newLoreId(): string {
  const crypto = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (crypto?.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function emptyCosmology(): LoreCosmology {
  return { maker: "", spirits: [], corruptor: "" };
}

export function blankTier(mechanism: LoreMechanism = "ADDITION"): LoreTier {
  return { id: newLoreId(), name: "", definition: "", mechanism, vocabulary: "" };
}

export function blankColor(): LoreColor {
  return { id: newLoreId(), faction: "", color: "", meaning: "" };
}

export function blankCharacter(): LoreCharacter {
  return { id: newLoreId(), name: "", tier: "", race: "", role: "", signature: "" };
}

export function emptyLoreDoc(): LoreDoc {
  return { cosmology: emptyCosmology(), tiers: [], colors: [], characters: [], naming: "", gaps: [] };
}

/** Trims every field and drops blank items, so a save never stores empty rows the editor would have to re-filter. */
export function trimLoreDoc(doc: LoreDoc): LoreDoc {
  const text = (value: string | null | undefined) => (value ?? "").trim();
  return {
    cosmology: {
      maker: text(doc.cosmology?.maker),
      spirits: (doc.cosmology?.spirits ?? []).map(text).filter(Boolean),
      corruptor: text(doc.cosmology?.corruptor),
    },
    tiers: (doc.tiers ?? [])
      .filter((t) => text(t.name).length > 0)
      .map((t) => ({ ...t, name: text(t.name), definition: text(t.definition), vocabulary: text(t.vocabulary) })),
    colors: (doc.colors ?? [])
      .filter((c) => text(c.faction).length > 0 || text(c.color).length > 0)
      .map((c) => ({ ...c, faction: text(c.faction), color: text(c.color), meaning: text(c.meaning) })),
    characters: (doc.characters ?? [])
      .filter((c) => text(c.name).length > 0)
      .map((c) => ({
        ...c,
        name: text(c.name),
        tier: text(c.tier),
        race: text(c.race),
        role: text(c.role),
        signature: text(c.signature),
      })),
    naming: text(doc.naming),
    gaps: (doc.gaps ?? []).map(text).filter(Boolean),
  };
}
