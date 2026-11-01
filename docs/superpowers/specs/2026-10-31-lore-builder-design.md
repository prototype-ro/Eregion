# Lore builder: design

Date: 2026-10-31. Status: draft for review.

## Goal

A deck's lore is built **in conversation** with the AI, not by filling a form. The player writes what they want in plain language; the AI drafts and edits a structured lore document; the document fills in live, and the player can hand-tweak any field. The AI does the heavy lifting; the player steers by talking and polishes by hand.

## The interaction

The player and the AI share one thread. A turn is:

1. The player writes a message: *"invent a Tolkien-shaped world with a five-tier corruption spectrum"*, then later *"make the corruptor a serpent of cold ash"*, *"the second tier should lose their name, not their face"*.
2. The AI replies in one or two sentences saying what it changed.
3. The structured lore document updates in place, and the changed sections flash briefly so the player sees what moved.
4. The player can keep talking, or click any field and type directly for the final fine-tune.
5. Nothing is saved until the player presses Save.

The thread is the interaction, the live document is the interface the AI fills, and tailoring is done both by talking and by hand-editing.

## Non-goals (deferred)

- Streaming the reply word-by-word. First version returns the whole reply + document in one call.
- Persisting the conversation across reloads. The document is the source of truth; the thread lives in the browser tab for now.
- Per-field diff animation. First version flashes the whole section that changed.
- A history/undo of turns. Hand-editing plus re-talking covers it for now.

## Data

No new tables. The document is the existing `LoreDoc` (see `LoreDtos`), stored as `lore_doc jsonb` on the deck, with a rendered text digest in `lore` for the proxy prompt.

- `cosmology`: `maker`, `spirits[]`, `corruptor`.
- `tiers[]`: `name`, `definition`, `mechanism` (`ADDITION` | `ERASURE`), `vocabulary` — ordered un-fallen to most-lost.
- `colors[]`: `faction`, `color`, `meaning`.
- `characters[]`: `name`, `tier`, `race`, `role`, `signature`.
- `naming`, `gaps[]`.

The conversation is not stored server-side. The client sends the working document and recent history with every turn, so the model can resolve "it", "that tier", "make it harsher".

## Backend

Package `io.eregion.proxy`. One new endpoint, owner-only, under `/api/decks/{id}`:

- `POST /lore-doc/turn` — the whole interaction.

Request body:

```json
{
  "doc": { "…": "the client's working LoreDoc, including unsaved edits" },
  "history": [
    { "role": "user", "text": "invent a five-tier spectrum" },
    { "role": "assistant", "text": "Done — I sketched five tiers…" }
  ],
  "message": "make the corruptor a serpent of cold ash"
}
```

Response body:

```json
{
  "reply": "I made the corruptor a serpent of cold ash instead of the fire-something.",
  "doc": { "…": "the full updated LoreDoc" }
}
```

Details:

- `doc` is the source of truth for the current state; the server never reads the saved row to answer a turn. Unsaved edits survive because the client sends them.
- `history` is bounded (the client sends the last ~20 messages). The prompt only needs enough to resolve references, not the whole thread.
- **Prompt** (`LorePromptService.turn`): system text is `lore-rules.md` (unchanged). User text carries, in order: the current lore as the rendered digest (so no opaque ids reach the model), the conversation so far, and the new message, then the instruction to edit only what was asked and return JSON.
- **Reply contract**: the model returns one JSON object `{"reply": string, "doc": { …full document shape… }}`. `reply` is the human-facing sentence; `doc` is the whole document with only the requested change applied. Parsing reuses `parseDoc` for the `doc` field; a malformed reply is retried once, then an error, and nothing is saved.
- **Ids are not trusted.** `parseDoc` assigns fresh ids on every turn. The client reconciles by position and name to keep React keys stable and to flash the changed sections.
- **Rate limit**: each turn is a paid model call, so `limits.lore(userId)`, the same bucket as draft/check.
- `draft` and `refine` become redundant: a draft is a turn with an empty document and empty history; a refine is a turn whose message targets one part. They can be removed once the chat UI lands, or kept as thin wrappers.

## Frontend

Replace the current `LoreSection` with a single "Lore" section that is a **two-pane co-builder**. On wide screens: chat left (~40%), document right (~60%). On narrow screens they stack.

### Chat pane

- A message list: player bubbles on one side, assistant bubbles on the other. Assistant bubbles show the model's `reply` text.
- An input at the bottom — *"Tell the AI what to build or change…"* — with a send button; Enter sends. Disabled while a turn is in flight.
- A "…" thinking indicator while waiting.
- Empty state: one welcome line plus a few suggestion chips ("invent a five-tier corruption spectrum", "make it feel like an alternate Tolkien world", "rename the corruptor to something harsher").

### Document pane

- The structured lore rendered as the same readable cards as today: cosmology, corruption spectrum, signature colours, named characters, naming conventions, open gaps.
- Every field is inline-editable (inputs, textarea, the mechanism select, add/remove/reorder on lists). Hand edits mark the document dirty.
- After each turn, sections whose rendered digest changed flash briefly (a background highlight that fades), so the player sees what the AI touched.
- A Save button persists the document; a dirty indicator and a saved confirmation, as today.

### State and hook

- `useLore` gains one call: `turn(doc, history, message) → { reply, doc }`.
- The component holds the working `LoreDoc` (already in `useLore`) plus a local conversation history `{ role, text }[]`, appended to on each turn.
- Change detection for the flash compares each section's rendered digest before and after a turn; a changed section flashes. No server round-trip for this.

## Errors

- No `EREGION_LLM_API_KEY`: a problem detail naming the variable (existing behaviour).
- Provider timeout, 429, or malformed JSON after one retry: the turn fails with a message in the chat; the document is unchanged.
- Rate limit: the existing `lore` bucket answers 429 with a retry time.
- Nothing is written to the deck until the player presses Save.

## Testing

Backend, with a fake `LlmClient`:

- `turn` sends the digest, the history and the message; parses `reply` and `doc`.
- A malformed reply is retried once, then fails; the second reply is used when the first is bad.
- Owner-only: a stranger gets 404 on `turn`.
- The digest sent is the render of the client's document, not the saved row.

Frontend:

- The `turn` hook wiring and the history append logic.
- Section change detection for the flash (pure logic, like `src/lib/*.test.ts`).
- Existing `lore.ts` trim tests keep passing.

No automated test calls the language model.

Manual check with the Vast Accord lore in a test deck: start empty, talk through a draft, then ask for a targeted change and confirm only that part moved.

## Open details to settle in the plan

- How many history turns to send (token budget), and whether to summarise older turns.
- Whether the assistant reply should also carry a short "changed: tiers, characters" list to drive a more precise highlight than whole sections.
- When to remove `draft`/`refine` versus keeping them as wrappers.
- Conversation persistence (localStorage vs in-memory) and whether to offer an undo.
