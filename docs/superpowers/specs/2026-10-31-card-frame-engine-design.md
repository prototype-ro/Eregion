# Card Frame Engine — Design

Status: approved (pending final spec review)
Date: 2026-10-31

## Problem

Today the Proxy feature only generates a Midjourney-style text prompt (`ProxyService`, `ProxyController`) and uploaded art is stored/served as a raw blob (`CustomPrintingController`). Nothing composites a frame, mana cost, type line, rules text, or nickname onto the art — nicknames are shown only as UI copy (`ProxyPanel.tsx`), never baked into an image.

Goal: given uploaded art (and the card's existing Scryfall-derived data), automatically produce a fully composited, real-MTG-style card face — frame, mana cost, type line, rules text, P/T, nickname/name, artist credit, collection/set symbol — with the only manual input being the art itself. Per-deck, the user sets artist name, collection code, and a frame family; the engine picks the correct frame variant per card from its type/colors.

## Scope

- Standard single-faced cards only (creature, instant, sorcery, enchantment, artifact, land, planeswalker). Double-faced/split/transform cards are out of scope for this version.
- Frame assets reused from CardConjurer's existing asset packs rather than commissioned original art.
- License check on CardConjurer's asset pack is a pre-build TODO — not resolved by this spec.

## 1. Data model additions

- Add `power`/`toughness` to the card model — missing today. Touches:
  - `backend/src/main/java/io/eregion/card/ScryfallCard.java`
  - `backend/src/main/java/io/eregion/card/Card.java`
  - `backend/src/main/java/io/eregion/card/ScryfallMapper.java`
  - `frontend/src/lib/types.ts`
- New `DeckFrameSettings` (per deck): `artistName`, `collectionCode`, `frameFamily`.
- New `CardRender` (per card, per printing/version): composited PNG blob, `renderedAt`, and an inputs hash (art id, nickname, frame family, artist, collection code) used to detect staleness.
- No new plumbing needed for `typeLine`, `colors`, `colorIdentity`, `manaCost`, `oracleText`, `setCode`/`collectorNumber`/`rarity` — already present on `Card` (`backend/src/main/java/io/eregion/card/Card.java`) and mirrored in `frontend/src/lib/types.ts`.

## 2. Frame selection engine

Pure, deterministic function — no LLM involved: `(typeLine, colors, colorIdentity, manaCost) + frameFamily → asset layer stack`.

- **Type → base template slot**: Creature / Instant / Sorcery / Enchantment / Artifact / Land / Planeswalker. Each frame family must supply a template per slot. If the chosen family lacks one, fall back to a fixed default family for that slot (per approved answer — never leave a card unrendered).
- **Color → border treatment**:
  - Mono color (1 of WUBRG) → that color's border.
  - 2+ colors → multicolor/gold border.
  - 0 colors, non-land, non-artifact → colorless border.
  - Artifact type → artifact border regardless of color, unless the family has a colored-artifact/equipment variant.
  - Land → land template, own border family; color pips ignored except basic-land flavor treatment.
- **Nickname handling**: nickname present → title = nickname, subtitle = real card name (small). Nickname absent → title = real name only, no subtitle.
- **Text layers rendered**: mana cost (symbol icons from the family's pack), type line (includes supertypes + set symbol from `collectionCode`), oracle text (auto-shrink to fit box), P/T box (creatures only), artist credit (= deck's `artistName`), collector number (`collectorNumber` if present, else sequential).

## 3. Compositing service (backend)

New `io.eregion.render` package, `CardRenderService`:

- Input: `Card` + uploaded art (existing blob from `CustomPrintingController`) + `DeckFrameSettings`.
- Loads layer assets (frame images, mana/set symbols, fonts) from a bundled CardConjurer asset pack under `backend/src/main/resources/frames/<family>/`.
- Composites via `BufferedImage`/`Graphics2D`: art crop → frame border → text layers → flatten to PNG.
- Text layout (wrapping, rules-text auto-shrink, mana symbol substitution) ports CardConjurer's existing JS layout logic to Java rather than reinventing it from scratch.
- Endpoints: `POST /api/cards/{cardId}/render` (manual trigger), `GET /api/cards/{cardId}/render/image` (serve result).
- Result persisted as a `CardRender` row (section 1).

## 4. Triggers & regen flow

- **Art upload/change** (existing `CustomPrintingController` upload endpoint): after save, synchronously render that one card.
- **Nickname save** (existing `ProxyService` flow): same, render that one card.
- **Deck-level setting change** (artist/collection code/frame family, via the new Frame panel): synchronously re-render every card in the deck immediately (approved: whole-deck, not lazy). Runs in the request thread; acceptable for now — revisit with an async job only if deck size makes this a real pain point (YAGNI, no premature async machinery).
- **Render failure** (missing art, no fallback asset available): log the failure and leave the previous `CardRender` in place rather than deleting it — a card is never left image-less because of a failed re-render.

## 5. Frame panel (frontend)

- New tab on the deck page, alongside Versions/Statistics.
- Fields: `artistName` (text), `collectionCode` (text, feeds set symbol), `frameFamily` (select, from the bundled family list).
- Save calls new `PUT /api/decks/{deckId}/frame-settings`, which triggers the deck-wide re-render from section 4.
- Card views (`DeckBuilder.tsx`, `ProxyPanel.tsx`) display the `CardRender` PNG when one exists, falling back to existing art/Scryfall image otherwise.

## 6. Testing

- Unit tests for the frame-selection engine: table-driven, one case per type×color combo, nickname present/absent, and the fallback-family path. No image bytes involved.
- Backend compositing tests: assert `CardRenderService` produces a non-empty PNG of the expected dimensions for representative cards (creature/land/planeswalker × mono/multi/colorless). Structural checks only (success, size) — no pixel-diffing, too brittle.
- Trigger tests: art upload / nickname save / deck-setting save each call the render service exactly once, at the right scope (one card vs. whole deck) — mock `CardRenderService`.
- No new frontend test plan beyond existing patterns; verify manually in-browser (Frame panel save → images update).
