# Proxy creator: design

Date: 2026-10-27. Status: draft for review.

## Goal

Each deck carries a lore text. For any card in the deck the player can ask for a proxy treatment: either a **nickname** card (new name, new character, new art theme) or a **reskin** (original name kept, new character and art). The output is a Midjourney prompt for the card art. The player can refine a result, keep a history of generations and pick which one is current.

Local app only. The model is the player's own DeepSeek key.

## Non-goals (deferred)

- A guided lore builder. For now the lore is one markdown text the player pastes or edits.
- Attaching the finished Midjourney image to the card as a custom printing. The data model leaves room for it: a generation can later link to a `custom_printing`.
- Reusing one character across several cards.
- Server-side batch jobs that outlive the browser tab.

## Data

Migration `V19__proxy_treatments.sql`.

`deck` gets `lore text` (nullable) and `mj_params text` (nullable, for example `--ar 5:7 --style raw --v 7`).

`proxy_treatment`
- `id uuid pk`, `deck_id` fk, `card_id` fk, `mode` (`NICKNAME` or `RESKIN`), `current_generation_id` fk nullable, `created_at`, `updated_at`.
- Unique `(deck_id, card_id)`.

`proxy_generation`
- `id uuid pk`, `treatment_id` fk, `created_at`.
- `instruction text` null for a first generation, else the player's refine text.
- `nickname text` null in reskin mode.
- `character jsonb`: `tier`, `who`, `race`, `role`, `signature` (the one signature detail).
- `prompt text`: the Midjourney text, without parameters.
- `model text`: the model that wrote it.

Treatments belong to the deck, not to a version. They do not appear in version snapshots, diffs or merges. A card that leaves the deck keeps its treatment, hidden in the builder until it returns.

## Backend

Package `io.eregion.proxy`.

- `LlmClient` interface: `String complete(String system, String user)`. `DeepSeekClient` implements it over the chat completions API. Key from `EREGION_LLM_API_KEY`, optional `EREGION_LLM_MODEL` and `EREGION_LLM_URL`. The key never reaches the browser or the database. With no key set, generation answers a clear problem detail naming the variable.
- `ProxyPromptService` builds the request and parses the reply.
  - System text comes from a resource file `proxy-rules.md`, editable without code changes. It holds the prompt-building rules (personality first, one signature detail, compact prompt style, geometry gotchas, palette contrast, multi-actor composition) and the lessons from the lore doc: anchor gender and build explicitly, state the direction of any energy, give a third element its own color, use hard countable geometry for faceless designs, state both anchors for dark backgrounds.
  - User text carries: the deck lore in full; the card (name, type line, colors, mana cost, oracle text, power and toughness); the nickname, character and tier already chosen for other cards in this deck (so names do not clash and tiers stay balanced); the mode; the previous generation and the refine instruction when refining.
  - The model must first place the card in a tier from the lore, then design the character, then write the prompt. It replies with JSON: `nickname` (nickname mode only), `character`, `prompt`.
  - Validation: JSON parses, required fields present, prompt length bounded. One retry on a malformed reply, then an error; nothing is saved on error.
  - The server appends `mj_params` from the deck to the copied prompt; the model is never asked for parameters.
- Endpoints, all owner-only, under `/api/decks/{id}`:
  - `GET /proxies` treatments with their current generation.
  - `POST /proxies/{cardId}/generate` body `{mode, instruction?}`; creates a generation, makes it current, creates the treatment on first use. Returns the treatment.
  - `GET /proxies/{cardId}/history` all generations, newest first.
  - `PUT /proxies/{cardId}/current` body `{generationId}`.
  - `PUT /lore` body `{lore, mjParams}`.
- Rate limit per player on generate, in the same style as `POST /api/analysis`.

## Frontend

- **Card panel.** A "Proxy" action on a card opens a side panel: mode toggle, Generate, a Refine field, the history list with a "use this" button on each entry, and Copy prompt (prompt plus parameters). Buttons follow the 36 px standard in `/dev/components`.
- **Proxies view** in the deck builder, with a lore editor and `mj_params` field at the top, then the card list with a status chip per card (none, nickname, reskin). Multi-select cards, pick a mode, Generate.
- **Batch queue** runs in the browser: one request per card, about 3 in flight, a progress bar, Cancel, per-card failure with retry. An interrupted batch resumes by selecting the cards still without a treatment.

## Errors

- No key: problem detail naming `EREGION_LLM_API_KEY`.
- Provider timeout, 429 or malformed JSON after retry: that card fails with a message; no partial row is written; other cards in a batch continue.
- Empty lore: generation is allowed, but the panel warns that results will be generic.

## Testing

Backend, with a fake `LlmClient`:
- Prompt assembly includes lore, card data and earlier picks, and the refine context.
- JSON validation and the single retry.
- Owner-only access on every endpoint; another player gets 404.
- Current-pick logic and history order.
- `mj_params` appended on copy output, not stored in the prompt.

Frontend:
- Batch queue concurrency, cancel and resume (pure logic test, like `src/lib/*.test.ts`).

No automated test calls DeepSeek.

Manual check with the Vast Accord lore (loaded into a test deck from the player's own `vast-accord.md`, not copied into this repo):
- Esper Sentinel as nickname. Sildarion is already confirmed, so it is a regression target: expect a Lathaar-tier character in the same spirit.
- Lord of the Void as reskin. Expect a Maelgrith-submitted, faceless-but-geometric result.
- One card the lore does not cover yet.

## Open details to settle in the plan

- Whether the confirmed designs from the lore file are sent as few-shot examples in every request or only the two nearest by tier, to control token cost.
- Exact DeepSeek model name and JSON-mode flag.
