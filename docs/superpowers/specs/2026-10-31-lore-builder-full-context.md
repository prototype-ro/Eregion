# Lore builder: full context

Date: 2026-10-31. This is the complete, current picture of the deck-lore builder — backend and frontend — plus the planned conversational turn.

---

## 1. What it is

Every deck carries an invented setting ("lore") used to reskin the deck's cards with custom art. The **Lore Creator** turns that setting into a *structured* document instead of one free-text blob, so the interface can be AI-filled and the proxy prompt can read a consistent digest.

The structure is fixed: cosmology, a corruption spectrum (tiers), signature colours, named characters, naming conventions, and open gaps.

---

## 2. Data model

### Database (Postgres / Flyway)

- `decks.lore` — `TEXT`, nullable. The free-text digest the proxy prompt reads. Added in `V19__proxy_treatments.sql`.
- `decks.lore_doc` — `JSONB`, nullable. The structured document. Added in `V22__lore_doc.sql`.

On every save the structured document is written to `lore_doc`, and its rendered text digest is written to `lore` in the same `UPDATE`, so the two never drift.

### The structured document (`LoreDtos.LoreDoc`)

```
cosmology   { maker: string, spirits: string[], corruptor: string }
tiers[]     { id, name, definition, mechanism: ADDITION|ERASURE, vocabulary }
colors[]    { id, faction, color, meaning }
characters[] { id, name, tier, race, role, signature }
naming      string
gaps[]      string[]
```

- `tiers` are ordered un-fallen → most-lost. `ADDITION` = mutation that keeps personhood/agency; `ERASURE` = subtraction until the subject loses name and face (title/function only).
- `colors` lock one colour to each faction as a persistent marker.
- `characters` only belong to tiers that keep personhood; the most-lost tier gets titles, never names.
- `id` fields are opaque (random UUIDs) so the editor can reorder and delete without index churn.

---

## 3. Backend — package `io.eregion.proxy`

### Files

| File | Role |
| --- | --- |
| `LlmClient` | Interface: `String complete(String system, String user)`, `String modelName()`. Swappable for tests. |
| `DeepSeekClient` | `LlmClient` over the DeepSeek chat-completions API. Key from `EREGION_LLM_API_KEY` (read from `.env` via `DotEnvEnvironmentPostProcessor`); optional `EREGION_LLM_MODEL`, `EREGION_LLM_URL`. No key set → generation answers a problem detail naming the variable. |
| `LoreDtos` | Records: `LoreDoc`, `Cosmology`, `Tier`, `SignatureColor`, `NamedCharacter`, `Mechanism`, `DraftRequest`, `RefineRequest`, `CheckRequest`, `Problem`, `Verdict`. |
| `LoreRepository` | SQL for the document: `ownsDeck`, `loreDoc`, `saveLoreDoc`, and `readDoc` (JSON parse with a safe `LoreDoc.empty()` fallback). |
| `LorePromptService` | Builds the model request and parses the JSON reply: `draft`, `refine`, `check`, plus `parseDoc`, `parseVerdict`. System text from `lore-rules.md`. |
| `LoreService` | Ownership + orchestration + the digest renderer: `lore`, `save`, `draft`, `refine`, `check`, `renderDigest`. |
| `LoreController` | REST endpoints under `/api/decks/{deckId}/lore-doc`. |

### Endpoints (all owner-only; a stranger gets 404)

| Method & path | Body | Returns | Notes |
| --- | --- | --- | --- |
| `GET /lore-doc` | — | `LoreDoc` | Saved document, or `empty()` when none. |
| `PUT /lore-doc` | `LoreDoc` | `LoreDoc` | Saves the doc and its rendered digest together. Refuses docs over `MAX_DOC_CHARS` (60000). |
| `POST /lore-doc/draft` | `{ instruction }` | `LoreDoc` | Drafts the whole setting from the current lore + instruction. Rate-limited (`limits.lore`). |
| `POST /lore-doc/refine` | `{ doc, target, instruction }` | `LoreDoc` | Targeted edit to one part of the *working* doc (client sends it, unsaved edits included). Rate-limited. |
| `POST /lore-doc/check` | `{ cardId }` | `Verdict` | Checks one card against the locked lore. Rate-limited. |

### Prompt assembly (`LorePromptService`)

- **System** = `lore-rules.md` (resource file, editable without code changes). Holds the eight worldbuilding rules: structural-not-name borrowing; a spectrum not a binary; one signature colour per faction; named characters only where the tier allows; don't force every card into the spectrum; use the card's own flavour text; persist decisions; track open gaps. Also specifies the two JSON reply shapes (document, verdict).
- **Draft** user text: `# Current lore` (rendered digest) + `# What to draft` (instruction), asking for the whole document as one JSON object.
- **Refine** user text: `# Current lore` (digest) + `# Part to refine` (target) + `# Instruction`, asking to change only the requested part and return the whole document.
- **Check** user text: `# Locked lore` + `# Card` (name, type, colours, rules text) + the card's current treatment when it has one, asking for `{fits, problems[]}`.
- **Parsing**: `parseDoc` reads every section and assigns fresh UUIDs; drops blank tiers/characters/colours; accepts a code fence. `parseVerdict` reads `fits` and `problems`. A malformed reply is retried once, then the turn fails and nothing is saved.

### Digest renderer (`LoreService.renderDigest`)

Turns a `LoreDoc` into the human-readable text that both the proxy prompt and the model requests read. Emits `# Cosmology`, `# Spectrum` (ordered tiers with `(addition)`/`(erasure)` and vocabulary), `# Signature colours`, `# Named characters`, `# Naming conventions`, `# Open gaps`. Empty doc → empty string.

### Rate limiting

`RateLimits.lore(userId)` — one per-minute bucket, shared by draft, refine and check ("each is a paid model call"). Returns 429 with a retry time.

---

## 4. Frontend

### Files

| File | Role |
| --- | --- |
| `src/lib/types.ts` | `LoreDoc`, `LoreCosmology`, `LoreTier`, `LoreColor`, `LoreCharacter`, `LoreMechanism`, `LoreVerdict`, `LoreProblem` (plus `DeckLore` for the proxy feature). |
| `src/lib/lore.ts` | `emptyLoreDoc`, `blankTier`, `blankColor`, `blankCharacter`, `newLoreId`, `trimLoreDoc` (trims every field and drops blank rows before save). |
| `src/lib/useLore.ts` | Hook: `doc`, `loaded`, `loadError`, `retry`, `save`, `draft`, `refine`, `check`. |
| `src/components/builder/LoreSection.tsx` | The editor UI. |
| `src/components/builder/DeckBuilder.tsx` | Mounts `<LoreSection deckId={deck.id} />` (line ~1076), right above the Proxies section. |

### Current editor (`LoreSection`)

A single "Lore" section made of cards, top to bottom:

1. **Draft the setting** — one instruction input; "Draft lore" fills the whole document.
2. **Cosmology** — maker, corruptor, lesser-spirits list; a "Refine" box.
3. **Corruption spectrum** — ordered tiers with add/move/remove; a "Refine" box.
4. **Signature colours** — faction/colour/meaning rows; a "Refine" box.
5. **Named characters** — name/tier/race/role/signature rows; a "Refine" box.
6. **Naming conventions + open gaps** — a textarea + a string list; a "Refine" box.
7. **Save lore** — primary button with a dirty indicator.

Every field is inline-editable. Each section's "Refine" box (a collapsed button that expands to an instruction input) calls `refine(target, instruction)` and replaces the working doc with the model's reply, leaving the rest alone.

State: a local working `LoreDoc` (`draft`) mirrors the saved doc until the player edits; `touched` prevents a reload from clobbering edits; `trimLoreDoc(draft)` vs the saved doc drives the dirty flag.

---

## 5. Planned — the conversational co-builder

Design doc: `docs/superpowers/specs/2026-10-31-lore-builder-design.md`. The current form/buttons are being replaced by a conversation that builds the document.

### Backend

- `POST /api/decks/{deckId}/lore-doc/turn`
  - Request `{ doc, history, message }` — the working doc (unsaved edits included), the last ~20 `{role,text}` turns, and the player's message.
  - Response `{ reply, doc }` — a one-two sentence "what I changed" plus the full updated document.
  - Same `lore-rules.md` system prompt; reuses `parseDoc`; one retry on malformed JSON; rate-limited per turn.
  - `draft`/`refine` become special cases of `turn` (empty doc = draft; a message targeting one part = refine) and can be removed once the chat UI lands.

### Frontend

- Two-pane view replacing `LoreSection`: **chat** (left) + **live document** (right), stacked on narrow screens.
- Chat: message bubbles, an input ("Tell the AI what to build or change…"), suggestion chips on empty, a thinking indicator. Each turn appends the assistant `reply`.
- Document: the same structured cards, all fields inline-editable, with a brief flash on the sections the AI just changed (detected by comparing per-section rendered digests before/after).
- `useLore` gains `turn(doc, history, message) → { reply, doc }`.
- The conversation lives in the browser tab for now (not persisted).

---

## 6. LLM key configuration

`EREGION_LLM_API_KEY` is read from `.env` at the repo root by `DotEnvEnvironmentPostProcessor` (registered via `backend/src/main/resources/META-INF/spring.factories`). Without it, `draft`/`refine`/`check`/`turn` answer 503 with a message naming `EREGION_LLM_API_KEY`. `.env.example` documents it. The key never reaches the browser or the database.

---

## 7. Testing

Backend (with a fake `LlmClient`, `LorePromptServiceTest` + `LoreServiceTest`):
- Prompt assembly for draft, refine, check (lore + instruction/target/card carried into the request).
- `parseDoc` reads every section, drops blanks, assigns unique ids, accepts code fences; `parseVerdict` reads `fits`/`problems`.
- Malformed reply retried once, then an error with nothing saved.
- `renderDigest` covers every section and is empty for an empty doc.
- Owner-only on every path; a stranger gets 404. Oversized doc refused.

Frontend:
- `src/lib/lore.test.ts` covers `trimLoreDoc`, `emptyLoreDoc`, `newLoreId`, blanks.

No automated test calls the real model. Manual check uses the player's own Vast Accord lore loaded into a test deck.
