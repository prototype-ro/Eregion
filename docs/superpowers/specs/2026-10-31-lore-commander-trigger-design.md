# Lore Creator: commander-triggered, canon-aware auto-draft

## Why

The Lore Creator currently lives as a standalone tab, starts blank, and its document schema (`cosmology.maker/corruptor/spirits`, `tiers` with an `ADDITION`/`ERASURE` mechanism) is hardcoded to one specific theme — a corruption spectrum. That fit the one real deck it was built against (Kaalia, an original character), but it doesn't fit a commander who is an existing IP character (Marvel, Lord of the Rings, etc.), and it forces every setting through a mutation/erasure lens whether or not that's the story.

This reworks the trigger and the schema:

- Lore starts from the commander's card menu ("Set Lore"), not a standalone tab.
- The moment it opens, the AI drafts a complete opening setting with no typing required — canon-accurate if the commander is a recognizable existing-IP character, invented from scratch otherwise.
- The document schema generalizes from a corruption spectrum to generic races/tribes/factions, tales, and cosmology, so it fits either case.
- Editing after the draft stays conversational (the existing `turn` endpoint), with an "Advanced" toggle exposing hand-editable fields for fine control.

## Scope

In scope: the trigger (commander card menu → dialog), the auto-draft instruction, the generalized schema (backend DTOs, prompt, digest renderer, frontend types/lib/component), a migration for the one existing real deck's lore (Kaalia), and removing the standalone Lore section in favor of the dialog.

Out of scope (explicitly deferred, per the approved design): per-item "regenerate this race" buttons (chat already does targeted edits — "regenerate just the Bent Court, keep the rest"); any change to the Proxy Creator's own `Character.tier` field (a separate, already-free-text field, untouched by this rename); the floating glass dock built in the prior round (dropped in favor of the centered dialog, consistent with every other per-card popup in this app).

## 1. Schema generalization

Current `LoreDoc` (backend `LoreDtos.java`, frontend `types.ts`):

```
cosmology: { maker: string, spirits: string[], corruptor: string }
tiers: [{ id, name, definition, mechanism: ADDITION|ERASURE, vocabulary }]
colors: [{ id, faction, color, meaning }]
characters: [{ id, name, tier, race, role, signature }]
naming: string
gaps: string[]
```

New shape:

```
cosmology: { overview: string, forces: string[] }
groups: [{ id, name, description, traits }]
tales: string[]
colors: [{ id, faction, color, meaning }]            // unchanged
characters: [{ id, name, group, race, role, signature }]   // "tier" renamed to "group"
naming: string                                        // unchanged
gaps: string[]                                        // unchanged
canonSource: string | null                            // new
```

- `cosmology.overview` replaces the maker/corruptor split with one free-text paragraph (how this world or universe began and operates); `forces` replaces `spirits` as a generic list of foundational powers or notable cosmic entities — neither role is forced into existing/opposing-pole language.
- `groups` replaces `tiers`. The `mechanism` enum (`ADDITION`/`ERASURE`) is dropped entirely — a group is just `{ id, name, description, traits }`, ordered narratively but not forced into a spectrum. `traits` replaces `vocabulary` (visual/behavioural notes).
- `tales` is new: a flat list of short myths, legends, or key past events. Addresses "tales" from the brief, which the old schema had no field for at all.
- `canonSource` is new: `null` for an invented setting, or a short string naming the franchise (e.g. `"Marvel Comics"`, `"The Lord of the Rings"`) when the commander is a recognizable existing character and the draft leans on real canon.
- `colors` is unchanged.
- `characters.tier` is renamed to `characters.group`, matching the renamed document-level field. `race`, `role`, `signature` are unchanged.

### Backend files touched

- **`LoreDtos.java`**: drop `Mechanism` enum. `Cosmology(String overview, List<String> forces)`. Rename `Tier` → `Group(String id, @NotBlank String name, String description, String traits)`. `NamedCharacter(String id, String name, String group, String race, String role, String signature)`. `LoreDoc` gains `String canonSource` (nullable), field `tiers` renamed to `groups`. Update the Javadoc on the class and `LoreDoc.empty()`.
- **`LorePromptService.java`**: `docFrom` rebuilt for the new field names (drop the `mechanism(...)` helper entirely); the documented JSON shape in the `turn`/`draft` prompts and in `lore-rules.md` updated to match. New auto-draft instruction text is composed by the frontend and sent through the existing `draft` call — no new backend method.
- **`LoreService.renderDigest`**: rewritten section by section — `# Cosmology` renders `overview` and `forces`; `# Spectrum (ordered...)` becomes `# Groups` with no addition/erasure suffix; a new `# Tales` section lists `tales` when non-empty; `# Named characters` reads `character.group()` instead of `character.tier()`; a new line renders `canonSource` under `# Cosmology` when non-null (e.g. `Canon source: Marvel Comics`).
- **`lore-rules.md`**: rewritten. Rules 1–2 (structural borrowing, corruption spectrum) are replaced with: (a) a canon-detection rule — if the commander named in the draft instruction is a recognizable character from an existing franchise, write canon-accurate lore about them and set `canonSource` to that franchise's name; otherwise invent every element from scratch and leave `canonSource` null; (b) a generic worldbuilding rule covering cosmology, groups (races/tribes/factions — ordered when the setting calls for an ordered spectrum, unordered otherwise), and tales. Rules 3–8 (locked colours, named characters only where it makes sense, don't force every card into the structure, reuse printed flavour text, persist decisions, track gaps) carry over with field names updated. The documented JSON shape at the bottom is updated to the new schema.
- **No change** to `LoreController.java`, `LoreRepository.java` (JSON blob in, JSON blob out — Jackson maps the new record shape automatically), or `ProxyPromptService.java`/`ProxyDtos.java` (`Character.tier` there is an independent, already-free-text field on the per-card proxy treatment, not coupled to `LoreDtos`).

### Frontend files touched

- **`types.ts`**: mirror the renames — `LoreCosmology { overview, forces }`, `LoreGroup { id, name, description, traits }` (replaces `LoreTier`; drop `LoreMechanism`), `LoreCharacter.group` (was `tier`), `LoreDoc.groups` (was `tiers`), `LoreDoc.tales: string[]` (new), `LoreDoc.canonSource: string | null` (new).
- **`lore.ts`**: `emptyCosmology`, `blankTier`→`blankGroup`, `emptyLoreDoc`, `trimLoreDoc` updated for the new fields (`tales` trimmed like `gaps`; `canonSource` passed through as-is, trimmed to `null` if blank). `LoreSectionKey` gains `"tales"`; drops nothing (every old key except the renamed `tiers`→`groups` stays). `sectionDigests`/`changedSections` updated for the new keys.
- **`lore.test.ts`**: existing tests updated for the renamed fields; one new case for `tales` in `trimLoreDoc`.

## 2. Trigger: commander card menu → dialog

- **`CardMenu.tsx`**: new prop `onSetLore: (line: DeckCardLine) => void`. New menu item, shown only when `isCommander` (the existing `line.board === "commander"` check), placed next to `onProxy`'s "Proxy art prompt" item: `<button role="menuitem" className={item} onClick={act(() => onSetLore(line))}>Set Lore</button>`.
- **`DeckBuilder.tsx`**: new state `const [loreOpen, setLoreOpen] = useState(false)`, mirroring `proxyCardId`. Wire `onSetLore={() => setLoreOpen(true)}` on `<CardMenu>`. Replace the current `<LoreSection deckId={deck.id} />` (line ~1076) with `<LoreDialog open={loreOpen} onClose={() => setLoreOpen(false)} deckId={deck.id} commanderName={deck.commanderName} />`, mounted near `<ProxyPanel>` rather than inline on the page.
- The standalone Lore section is removed from the page; `LoreSection.tsx` is deleted (its document-rendering and manual-editor markup is carried into `LoreDialog.tsx`, see below). `LoreDock.tsx` and its mount in `LoreSection.tsx` from the prior round are deleted — the chosen shell is the centered dialog, not the floating dock.

## 3. The dialog: `LoreDialog.tsx`

A new component, built on the existing `Dialog` (the same primitive `ProxyPanel` and `CardPeek` use), size `lg` (1120px) to leave room for the document plus, when toggled, the full manual editors side by side.

- **Opening with no saved lore**: the moment the dialog opens (`open && lore.doc` is empty) it fires the auto-draft automatically — no typing required. The instruction sent to the existing `draft` call is built by the frontend, not typed by the player:

  > `Draft the opening setting for the commander {commanderName}. If this is a recognizable character from an existing franchise, write canon-accurate lore about them and set canonSource to that franchise's name. Otherwise invent the whole setting from scratch and leave canonSource null.`

  While this runs, the dialog shows a loading state (a short line, e.g. "Drafting {commanderName}'s setting…") rather than an empty document.
- **Opening with saved lore**: skips the auto-draft, shows the existing document immediately, chat ready for further turns.
- **Default view**: chat (unchanged `turn` flow, history, suggestions, flash-on-change — all carried over from the current `LoreSection`/`LoreDock` logic) alongside the document rendered as read-styled tiles (cosmology, groups, tales, colours, characters, naming, gaps — one tile per `LoreSectionKey`, flashing on change exactly as today).
- **Advanced toggle**: a button that reveals the existing hand-editable forms — add/remove/reorder groups, add/remove colours and characters, free-text fields for cosmology/naming/gaps/tales — reusing the `Field`, `StringList`, `GroupEditor` (renamed from `TierEditor`), `ColorEditor`, `CharacterEditor` helper components carried over from `LoreSection.tsx` essentially unchanged apart from the field renames. The Save button (unchanged dirty-check/save logic) lives here, visible whether or not Advanced is open.
- **Closing**: closing the dialog does not discard unsaved edits silently different from today — same `dirty` check and Save button behavior as the current `LoreSection`. (No new confirmation-on-close behavior is introduced; out of scope.)

## 4. Migrating Kaalia's existing lore

One real deck (`Kaalia`, id `631edd20-8dfc-4ce2-8d38-28a94a3d996c`) has a saved `lore_doc` under the current schema. A new Flyway migration (`V23__lore_doc_groups.sql`) rewrites that one row's JSON in place with a `jsonb`-building `UPDATE`:

- `cosmology.maker` + `cosmology.spirits` → folded into a new `cosmology.overview` sentence plus `cosmology.forces` (the old `spirits` array carried over as-is); `cosmology.corruptor` appended into `overview` as the setting's central antagonist.
- `tiers` → `groups`, each `{id, name, description: definition, traits: vocabulary}`, dropping `mechanism`.
- `colors` carried over unchanged.
- `characters`: each `tier` key renamed to `group`.
- `canonSource` set to `null`, `tales` set to `[]`.

Repository code is unchanged — `LoreRepository.loreDoc` already falls back to `LoreDoc.empty()` if a row fails to parse under the new record shape, which is exactly the failure this migration prevents for the one deck that has real data.

## Testing

- **Backend** (`LorePromptServiceTest`, `LoreServiceTest`): update existing tests for the renamed fields; add a case asserting `renderDigest` includes `canonSource` and `tales` when present and omits them when blank/empty; add a case for the auto-draft instruction format (a `LorePromptService.draft` call with a canon-style instruction returns a doc with `canonSource` set, using the existing fake `LlmClient`).
- **Backend migration**: a focused test (or a manual `./mvnw -o test` run plus a one-off query against the dev DB) confirming the Kaalia row's `lore_doc` parses into the new `LoreDoc` record after migration, and that no field silently became empty.
- **Frontend** (`lore.test.ts`): update renamed-field assertions; add a `tales` case to `trimLoreDoc`.
- **Manual/API smoke**: since there's still no working browser automation in this environment, verify via curl: open-dialog auto-draft behavior is simulated by calling `POST /lore-doc/draft` with the canon-style instruction for a known IP commander name and for an invented one, confirming `canonSource` comes back set in the first case and `null` in the second.

## Open gaps (left for later, not blocking this spec)

- Per-item "regenerate this race" quick actions (deferred per the approved design — chat handles targeted edits for now).
- Whether `canonSource` should feed into the Proxy Creator's own prompt (`ProxyPromptService`) to keep art on-model for canon settings — noted as a natural follow-up, not built here.
