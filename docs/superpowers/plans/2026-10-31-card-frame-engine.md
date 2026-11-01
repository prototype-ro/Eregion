# Card Frame Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-composite a full MTG-style card face (frame, mana cost, type line, rules text, P/T, nickname, artist, collection/set symbol) from uploaded art, picking the right frame variant per card from its type/colors and a deck-chosen frame family.

**Architecture:** Backend-only compositing. A pure Java frame-selection function maps `(typeLine, colors, colorIdentity)` to a frame-family-relative asset layer stack; a `CardRenderService` loads those assets plus the card's data and the deck's `DeckFrameSettings`, composites everything with `Graphics2D`, and stores the result as a new `CardRender` row. Three existing save paths (art upload, nickname save, deck frame-settings save) trigger rendering synchronously, scoped to one card or the whole deck per spec. Frontend gets a new Frame settings tab and swaps displayed images to the composited render when one exists.

**Tech Stack:** Java/Spring Boot backend (`io.eregion.*`), `java.awt.Graphics2D`/`BufferedImage` for compositing, JPA entities, Next.js/React frontend, CardConjurer's existing open-source frame asset pack as the source of frame/symbol images and layout coordinates.

---

## Spec coverage map

- §1 Data model additions → Tasks 1, 2, 6
- §2 Frame selection engine → Task 4
- §3 Compositing service → Tasks 5, 7
- §4 Triggers & regen flow → Task 8
- §5 Frame panel (frontend) → Tasks 3, 9
- §6 Testing → folded into every task (TDD) plus Task 10 for trigger-scope tests

---

### Task 1: Add `power`/`toughness` to the card model

**Corrected after discovery during execution:** this codebase has no JPA. `Card` (`backend/src/main/java/io/eregion/card/Card.java`) is an immutable **record** with 20 positional fields, accessed via bare-name accessors (`card.manaCost()`, not `getManaCost()`). Persistence is raw SQL via `JdbcClient` in `CardRepository.java`, against a table named `cards` (plural). There is also a compact legacy 20-arg constructor in `Card.java` used by some call sites — it needs a matching update too.

**Further correction (discovered on a second attempt at this task):** `ScryfallCard` is also an immutable record, not a mutable POJO — snake_case positional components (`source.type_line()`, `source.mana_cost()`, etc.), built via its canonical constructor, no public mutable fields and no no-arg constructor. Its nested `Face` sub-record (used for double-faced-card fallback) also has no `power`/`toughness` today. Steps 2 and 4 below are corrected for this.

**Files:**
- Modify: `backend/src/main/java/io/eregion/card/ScryfallCard.java`
- Modify: `backend/src/main/java/io/eregion/card/Card.java`
- Modify: `backend/src/main/java/io/eregion/card/ScryfallMapper.java`
- Modify: `backend/src/main/java/io/eregion/card/CardRepository.java` (SQL columns, `map`, `upsert`)
- Modify: `frontend/src/lib/types.ts`
- Test: `backend/src/test/java/io/eregion/card/ScryfallMapperTest.java`

- [ ] **Step 1: Read before writing**

Read `Card.java` in full (both the main record declaration and the legacy compact constructor), `ScryfallMapper.java` (the `toCard` method and the `colorString` helper), and `CardRepository.java` (`COLUMNS`, `map`, `upsert`) before changing anything — the exact field order matters because the record constructor is positional and several call sites build it that way.

- [ ] **Step 2: Write the failing test**

Add to `ScryfallMapperTest.java` (create the file if it doesn't exist yet — check first, follow the existing test style in `backend/src/test/java/io/eregion/card/` if other tests are there). Build `ScryfallCard` via its real positional canonical constructor — read `ScryfallCard.java` first to get the exact current component list/order (at last check: `id, name, mana_cost, cmc, type_line, colors, color_identity, oracle_text, set, set_name, collector_number, released_at, rarity, artist, prices, image_uris, card_faces, legalities`, plus the two new `power`/`toughness` components you add in Step 4 — confirm this hasn't drifted before writing the test), passing `null`/empty values for every component the test doesn't care about:

```java
@Test
void toCard_mapsPowerAndToughness() {
    ScryfallCard scryfallCard = new ScryfallCard(
        null, "Grizzly Bears", null, null, "Creature — Bear",
        List.of(), List.of(), null, null, null, null, null,
        null, null, null, null, null, null,
        "2", "2"); // power, toughness as the new trailing components — adjust position to match Step 4

    Card card = ScryfallMapper.toCard(scryfallCard);

    assertThat(card.power()).isEqualTo("2");
    assertThat(card.toughness()).isEqualTo("2");
}
```

(Note: `card.power()`/`card.toughness()` — record accessor style, matching every other field on `Card`. Every later task in this plan that reads power/toughness must call them this way, not `getPower()`. If any positional argument above doesn't type-check against the real constructor once you've read it, fix the test's argument list/types to match reality — the exact component list shown here is a best-effort snapshot, not guaranteed current.)

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && ./mvnw test -Dtest=ScryfallMapperTest#toCard_mapsPowerAndToughness`
Expected: FAIL — compile error, no `power`/`toughness` fields exist yet.

- [ ] **Step 4: Add record components to `ScryfallCard` (and its `Face` sub-record)**

`ScryfallCard` is a record — add `power` and `toughness` as two new trailing positional components on its canonical declaration (`String power, String toughness`, using `String` not a numeric type — Scryfall represents these as strings so values like `"*"` and `"1+*"` round-trip correctly). Also add the same two components to the nested `Face` record, since Scryfall puts power/toughness on individual `card_faces` entries for double-faced creature cards, matching how `type_line`/`mana_cost` already exist on `Face` for the same reason. Update every other existing construction of `ScryfallCard`/`Face` in the codebase (e.g. wherever the Scryfall JSON response is deserialized into this record — check for a Jackson `@JsonCreator`/constructor-binding setup) so it still compiles once the new components exist.

- [ ] **Step 5: Add record components to `Card`**

Add `power` and `toughness` as new positional components on the `Card` record, placed next to `typeLine`/`oracleText` in the declaration found in Step 1. Update the legacy compact constructor found in the same file to pass `null` (or empty string, matching whatever convention nearby optional-looking fields like `priceUsd`/`role` use) for these two new components, so it still compiles.

- [ ] **Step 6: Map the fields in `ScryfallMapper.toCard`**

In `ScryfallMapper.java`, inside `toCard`, add `source.power()` / `source.toughness()` (or the DFC-front-face equivalent, matching exactly how `typeLine`/`manaCost` already pull from the main card vs. `card_faces[0]` for double-faced cards) as new positional arguments to the `new Card(...)` call, in the same position you added the components in Step 5.

- [ ] **Step 7: Update `CardRepository` to persist and read the new columns**

In `CardRepository.java`:
- Add `power, toughness` to the `COLUMNS` constant.
- In `upsert`, add `power`/`toughness` to the `INSERT INTO cards (...)` column list, the `VALUES (...)` list (`:power`, `:toughness`), the `ON CONFLICT ... DO UPDATE SET` list (`power = EXCLUDED.power, toughness = EXCLUDED.toughness`), and the `.param("power", card.power()).param("toughness", card.toughness())` calls.
- In `map` (the `ResultSet` row mapper), add `rs.getString("power")` / `rs.getString("toughness")` as new positional arguments to `new Card(...)`, in the same position as Step 5.

- [ ] **Step 8: Run test to verify it passes**

Run: `cd backend && ./mvnw test -Dtest=ScryfallMapperTest#toCard_mapsPowerAndToughness`
Expected: PASS

- [ ] **Step 9: Add a DB migration**

Check `backend/src/main/resources/db/migration/` for the latest `V*.sql` version (at last check: `V22__lore_doc.sql` was the latest — confirm this is still true before picking the next number). Create `V<next>__add_power_toughness_to_cards.sql`:

```sql
ALTER TABLE cards ADD COLUMN power VARCHAR(16);
ALTER TABLE cards ADD COLUMN toughness VARCHAR(16);
```

(Table is `cards`, plural — confirmed against `V1__init.sql` and every query in `CardRepository.java`.)

- [ ] **Step 10: Mirror the fields on the frontend type**

In `frontend/src/lib/types.ts`, inside the `Card` interface, alongside `manaCost`/`oracleText`, add:

```typescript
power?: string;
toughness?: string;
```

- [ ] **Step 11: Fix any other `new Card(...)` call sites**

Search the whole backend for other positional `new Card(` construction (tests, fixtures, other repositories) and update them to match the new field order from Step 5. Run the full test suite (`cd backend && ./mvnw test`) to confirm nothing else broke.

- [ ] **Step 12: Commit**

```bash
git add backend/src/main/java/io/eregion/card/ScryfallCard.java \
        backend/src/main/java/io/eregion/card/Card.java \
        backend/src/main/java/io/eregion/card/ScryfallMapper.java \
        backend/src/main/java/io/eregion/card/CardRepository.java \
        backend/src/test/java/io/eregion/card/ScryfallMapperTest.java \
        backend/src/main/resources/db/migration \
        frontend/src/lib/types.ts
git commit -m "Add power/toughness to the card model"
```

---

### Task 2: `DeckFrameSettings` row, repository, and endpoint

**Corrected after discovery during execution:** no JPA in this codebase. The deck table is `decks` (plural), primary key `UUID`, with no standalone `Deck.java` — the row shape lives as a nested record inside `DeckRepository` (`DeckRow`), and persistence goes through `JdbcClient` with raw SQL. Auth follows a `@AuthenticationPrincipal Jwt jwt` + `CurrentUser.id(jwt)` pattern, and deck-scoped writes go through a service method that checks ownership (see `DeckService.setFlags`, which calls `owned(deckId, userId)` before writing). Follow that exact shape — a one-row-per-deck settings table, same as `V8__deck_flags.sql`'s `pinned`/`archived` columns added directly to `decks`, or a separate table if you prefer (this plan uses a separate table since it's several text fields, following the pattern of `ProxyRepository`'s per-deck lore row — check `ProxyRepository.java` for that upsert style before writing this task's repository).

**Files:**
- Create: `backend/src/main/java/io/eregion/render/DeckFrameSettingsRepository.java`
- Create: `backend/src/main/java/io/eregion/render/DeckFrameSettingsService.java`
- Create: `backend/src/main/java/io/eregion/render/DeckFrameSettingsController.java`
- Create: `backend/src/main/java/io/eregion/render/DeckRenderTrigger.java` (stub for now, real logic in Task 8)
- Test: `backend/src/test/java/io/eregion/render/DeckFrameSettingsControllerTest.java`
- Migration: `backend/src/main/resources/db/migration/V<next>__create_deck_frame_settings.sql`

- [ ] **Step 1: Read before writing**

Read `DeckRepository.java` (JdbcClient patterns, `DeckRow`), `DeckService.java` (the `owned(deckId, userId)` method and `setFlags` for the service-layer shape), `DeckController.java` (the `@AuthenticationPrincipal Jwt jwt` / `CurrentUser.id(jwt)` controller pattern, e.g. the `flags` endpoint), and `ProxyRepository.java` (an existing upsert-style per-deck settings row, for text fields rather than booleans) before writing any code in this task. Mirror these exactly — don't invent a different auth or persistence style.

- [ ] **Step 2: Write the failing test**

Follow whatever test style `DeckControllerTest` (or similar) already uses for an authenticated `MockMvc` request against a deck the test user owns — including how it creates a test deck and supplies a JWT/principal. Shape of the test:

```java
@Test
void putThenGet_roundTripsSettings() throws Exception {
    // Create a deck owned by the test user (follow the exact helper/pattern
    // used by existing deck controller tests for this).

    mockMvc.perform(put("/api/decks/" + deckId + "/frame-settings")
            .with(/* same auth setup existing deck tests use */)
            .contentType("application/json")
            .content("""
                {"artistName":"Jane Doe","collectionCode":"ERG","frameFamily":"m15"}
                """))
        .andExpect(status().isOk());

    mockMvc.perform(get("/api/decks/" + deckId + "/frame-settings")
            .with(/* same auth setup */))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.artistName").value("Jane Doe"))
        .andExpect(jsonPath("$.collectionCode").value("ERG"))
        .andExpect(jsonPath("$.frameFamily").value("m15"));
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && ./mvnw test -Dtest=DeckFrameSettingsControllerTest`
Expected: FAIL — repository/service/controller don't exist.

- [ ] **Step 4: Add the migration**

Check the latest `V*.sql` version (last known: `V22__lore_doc.sql`), then create `V<next>__create_deck_frame_settings.sql`:

```sql
CREATE TABLE deck_frame_settings (
    deck_id UUID PRIMARY KEY REFERENCES decks(id),
    artist_name VARCHAR(255),
    collection_code VARCHAR(16),
    frame_family VARCHAR(64) NOT NULL DEFAULT 'm15'
);
```

- [ ] **Step 5: Create the repository**

Following `ProxyRepository`'s upsert style (read it first — mirror its exact `JdbcClient` SQL shape for an upsert-by-deck-id row), implement:

```java
package io.eregion.render;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public class DeckFrameSettingsRepository {

    public record FrameSettingsRow(UUID deckId, String artistName, String collectionCode, String frameFamily) {}

    private final JdbcClient jdbc;

    public DeckFrameSettingsRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<FrameSettingsRow> findByDeckId(UUID deckId) {
        return jdbc.sql("SELECT deck_id, artist_name, collection_code, frame_family FROM deck_frame_settings WHERE deck_id = :deckId")
            .param("deckId", deckId)
            .query((rs, n) -> new FrameSettingsRow(
                rs.getObject("deck_id", UUID.class), rs.getString("artist_name"),
                rs.getString("collection_code"), rs.getString("frame_family")))
            .optional();
    }

    public FrameSettingsRow upsert(UUID deckId, String artistName, String collectionCode, String frameFamily) {
        return jdbc.sql("""
                INSERT INTO deck_frame_settings (deck_id, artist_name, collection_code, frame_family)
                VALUES (:deckId, :artistName, :collectionCode, :frameFamily)
                ON CONFLICT (deck_id) DO UPDATE SET
                    artist_name = EXCLUDED.artist_name,
                    collection_code = EXCLUDED.collection_code,
                    frame_family = EXCLUDED.frame_family
                RETURNING deck_id, artist_name, collection_code, frame_family
                """)
            .param("deckId", deckId).param("artistName", artistName)
            .param("collectionCode", collectionCode).param("frameFamily", frameFamily)
            .query((rs, n) -> new FrameSettingsRow(
                rs.getObject("deck_id", UUID.class), rs.getString("artist_name"),
                rs.getString("collection_code"), rs.getString("frame_family")))
            .single();
    }
}
```

- [ ] **Step 6: Create the service**

Mirror `DeckService.setFlags`'s shape exactly — call the same ownership-check helper (`owned(deckId, userId)`, found in Step 1) before writing:

```java
package io.eregion.render;

import org.springframework.stereotype.Service;

import java.util.UUID;

@Service
public class DeckFrameSettingsService {

    private final DeckFrameSettingsRepository repository;
    private final DeckRenderTrigger renderTrigger;
    // inject whatever DeckService uses for the ownership check (likely DeckRepository,
    // or DeckService itself if its `owned` method is accessible) — match Step 1's finding.

    public DeckFrameSettingsService(DeckFrameSettingsRepository repository, DeckRenderTrigger renderTrigger /*, ownership dependency */) {
        this.repository = repository;
        this.renderTrigger = renderTrigger;
    }

    public record FrameSettingsRequest(String artistName, String collectionCode, String frameFamily) {}

    public DeckFrameSettingsRepository.FrameSettingsRow get(UUID deckId, UUID userId) {
        // owned(deckId, userId); — call the real ownership check here
        return repository.findByDeckId(deckId)
            .orElse(new DeckFrameSettingsRepository.FrameSettingsRow(deckId, null, null, "m15"));
    }

    public DeckFrameSettingsRepository.FrameSettingsRow save(UUID deckId, UUID userId, FrameSettingsRequest request) {
        // owned(deckId, userId); — call the real ownership check here
        DeckFrameSettingsRepository.FrameSettingsRow saved =
            repository.upsert(deckId, request.artistName(), request.collectionCode(), request.frameFamily());
        renderTrigger.rerenderDeck(deckId);
        return saved;
    }
}
```

- [ ] **Step 7: Create the controller**

Mirror `DeckController`'s `flags` endpoint exactly for the `@AuthenticationPrincipal Jwt jwt` / `CurrentUser.id(jwt)` pattern:

```java
package io.eregion.render;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/decks/{deckId}/frame-settings")
public class DeckFrameSettingsController {

    private final DeckFrameSettingsService service;

    public DeckFrameSettingsController(DeckFrameSettingsService service) {
        this.service = service;
    }

    @GetMapping
    public DeckFrameSettingsRepository.FrameSettingsRow get(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID deckId) {
        return service.get(deckId, CurrentUser.id(jwt));
    }

    @PutMapping
    public DeckFrameSettingsRepository.FrameSettingsRow put(
        @AuthenticationPrincipal Jwt jwt, @PathVariable UUID deckId,
        @RequestBody DeckFrameSettingsService.FrameSettingsRequest request
    ) {
        return service.save(deckId, CurrentUser.id(jwt), request);
    }
}
```

(Confirm `CurrentUser`'s exact package/import from `DeckController.java` — use that import, don't guess the package.)

- [ ] **Step 8: Create the `DeckRenderTrigger` stub**

```java
package io.eregion.render;

import org.springframework.stereotype.Component;

import java.util.UUID;

@Component
public class DeckRenderTrigger {
    public void rerenderDeck(UUID deckId) {
        // Replaced with real rendering logic in Task 8.
    }
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `cd backend && ./mvnw test -Dtest=DeckFrameSettingsControllerTest`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add backend/src/main/java/io/eregion/render/DeckFrameSettingsRepository.java \
        backend/src/main/java/io/eregion/render/DeckFrameSettingsService.java \
        backend/src/main/java/io/eregion/render/DeckFrameSettingsController.java \
        backend/src/main/java/io/eregion/render/DeckRenderTrigger.java \
        backend/src/test/java/io/eregion/render/DeckFrameSettingsControllerTest.java \
        backend/src/main/resources/db/migration
git commit -m "Add DeckFrameSettings row, repository, service, and endpoint"
```

---

### Task 3: Frontend Frame settings tab

**Files:**
- Create: `frontend/src/lib/useFrameSettings.ts`
- Create: `frontend/src/components/builder/FramePanel.tsx`
- Modify: `frontend/src/components/builder/DeckBuilder.tsx` (add the new tab next to Versions/Statistics)

- [ ] **Step 1: Check the existing tab pattern**

Before writing code, read how the Versions/Statistics tabs are registered in `DeckBuilder.tsx` (component imports, the tab-switch state/enum, how panels are mounted) — mirror that exact pattern rather than inventing a new one. Also read `frontend/src/lib/useProxies.ts` as the pattern reference for a settings hook (fetch + save + loading state).

- [ ] **Step 2: Create the hook**

```typescript
import { useCallback, useEffect, useState } from "react";

export interface FrameSettings {
  artistName: string | null;
  collectionCode: string | null;
  frameFamily: string;
}

export function useFrameSettings(deckId: string) {
  const [settings, setSettings] = useState<FrameSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/decks/${deckId}/frame-settings`)
      .then((res) => res.json())
      .then(setSettings)
      .finally(() => setLoading(false));
  }, [deckId]);

  const save = useCallback(
    async (next: FrameSettings) => {
      const res = await fetch(`/api/decks/${deckId}/frame-settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const saved = await res.json();
      setSettings(saved);
      return saved;
    },
    [deckId],
  );

  return { settings, loading, save };
}
```

- [ ] **Step 3: Create the panel component**

```tsx
import { useState } from "react";
import { useFrameSettings } from "@/lib/useFrameSettings";

const FRAME_FAMILIES = ["m15", "classic"];

export function FramePanel({ deckId }: { deckId: string }) {
  const { settings, loading, save } = useFrameSettings(deckId);
  const [artistName, setArtistName] = useState("");
  const [collectionCode, setCollectionCode] = useState("");
  const [frameFamily, setFrameFamily] = useState("m15");
  const [saving, setSaving] = useState(false);

  if (loading || !settings) return <div>Loading frame settings…</div>;

  const current = {
    artistName: artistName || settings.artistName || "",
    collectionCode: collectionCode || settings.collectionCode || "",
    frameFamily: frameFamily || settings.frameFamily,
  };

  async function handleSave() {
    setSaving(true);
    try {
      await save({
        artistName: current.artistName,
        collectionCode: current.collectionCode,
        frameFamily: current.frameFamily,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <label>
        Artist name
        <input
          value={current.artistName}
          onChange={(e) => setArtistName(e.target.value)}
        />
      </label>
      <label>
        Collection code
        <input
          value={current.collectionCode}
          onChange={(e) => setCollectionCode(e.target.value)}
        />
      </label>
      <label>
        Frame family
        <select
          value={current.frameFamily}
          onChange={(e) => setFrameFamily(e.target.value)}
        >
          {FRAME_FAMILIES.map((family) => (
            <option key={family} value={family}>
              {family}
            </option>
          ))}
        </select>
      </label>
      <button onClick={handleSave} disabled={saving}>
        {saving ? "Saving…" : "Save (re-renders whole deck)"}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Wire the tab into `DeckBuilder.tsx`**

Following the exact pattern found in Step 1 for registering the Versions/Statistics tabs, add a `"frame"` tab entry that renders `<FramePanel deckId={deckId} />`, importing `FramePanel` from `./FramePanel`.

- [ ] **Step 5: Manually verify in the browser**

Run the dev server, open a deck, click the new Frame tab, set values, click Save, confirm the `PUT` request succeeds (network tab) and the GET on reload reflects saved values.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/useFrameSettings.ts \
        frontend/src/components/builder/FramePanel.tsx \
        frontend/src/components/builder/DeckBuilder.tsx
git commit -m "Add Frame settings tab to the deck builder"
```

---

### Task 4: Frame selection engine (pure function)

**Corrected after discovery during execution:** `Card.colors()`/`colorIdentity()` are **not** a `Set<String>` — they're a compact string in fixed WUBRG order (e.g. `"WU"`, `"G"`, `""`), produced by `ScryfallMapper.colorString`. `FrameSelector.select` must take that `String colors` form directly (its length gives the color count; iterate its characters for per-color treatment) rather than a `Set`.

**Files:**
- Create: `backend/src/main/java/io/eregion/render/FrameSelection.java`
- Create: `backend/src/main/java/io/eregion/render/FrameSelector.java`
- Test: `backend/src/test/java/io/eregion/render/FrameSelectorTest.java`

- [ ] **Step 1: Write the failing tests**

```java
package io.eregion.render;

import org.junit.jupiter.api.Test;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class FrameSelectorTest {

    private final FrameSelector selector = new FrameSelector(Set.of("m15"));

    @Test
    void monoColorCreature_selectsColorBorder() {
        FrameSelection selection = selector.select(
            "Creature — Bear", "G", "m15", "Grizzly Bears", null);

        assertThat(selection.templateSlot()).isEqualTo("creature");
        assertThat(selection.borderTreatment()).isEqualTo("mono-G");
        assertThat(selection.title()).isEqualTo("Grizzly Bears");
        assertThat(selection.subtitle()).isNull();
    }

    @Test
    void multicolorCard_selectsGoldBorder() {
        FrameSelection selection = selector.select(
            "Creature — Angel", "WU", "m15", "Alela", null);

        assertThat(selection.borderTreatment()).isEqualTo("multicolor");
    }

    @Test
    void colorlessNonArtifactNonLand_selectsColorlessBorder() {
        FrameSelection selection = selector.select(
            "Creature — Eldrazi", "", "m15", "Emrakul", null);

        assertThat(selection.borderTreatment()).isEqualTo("colorless");
    }

    @Test
    void artifactType_selectsArtifactBorderRegardlessOfColor() {
        FrameSelection selection = selector.select(
            "Artifact — Equipment", "R", "m15", "Sword", null);

        assertThat(selection.templateSlot()).isEqualTo("artifact");
        assertThat(selection.borderTreatment()).isEqualTo("artifact");
    }

    @Test
    void landType_selectsLandTemplate() {
        FrameSelection selection = selector.select(
            "Basic Land — Forest", "", "m15", "Forest", null);

        assertThat(selection.templateSlot()).isEqualTo("land");
    }

    @Test
    void nicknamePresent_usesNicknameAsTitleAndNameAsSubtitle() {
        FrameSelection selection = selector.select(
            "Creature — Bear", "G", "m15", "Grizzly Bears", "Ashcrown the Devourer");

        assertThat(selection.title()).isEqualTo("Ashcrown the Devourer");
        assertThat(selection.subtitle()).isEqualTo("Grizzly Bears");
    }

    @Test
    void familyMissingSlot_fallsBackToDefaultFamily() {
        FrameSelector selectorWithoutFamily = new FrameSelector(Set.of()); // no families support planeswalker

        FrameSelection selection = selectorWithoutFamily.select(
            "Legendary Planeswalker — Jace", "U", "nonexistent-family", "Jace", null);

        assertThat(selection.frameFamily()).isEqualTo(FrameSelector.DEFAULT_FAMILY);
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && ./mvnw test -Dtest=FrameSelectorTest`
Expected: FAIL — `FrameSelection`/`FrameSelector` don't exist yet.

- [ ] **Step 3: Create the `FrameSelection` result record**

```java
package io.eregion.render;

public record FrameSelection(
    String frameFamily,
    String templateSlot,
    String borderTreatment,
    String title,
    String subtitle
) {}
```

- [ ] **Step 4: Implement `FrameSelector`**

```java
package io.eregion.render;

import java.util.Set;

public class FrameSelector {

    public static final String DEFAULT_FAMILY = "m15";

    private final Set<String> familiesWithFullCoverage;

    public FrameSelector(Set<String> familiesWithFullCoverage) {
        this.familiesWithFullCoverage = familiesWithFullCoverage;
    }

    public FrameSelection select(
        String typeLine, String colors, String requestedFamily, String name, String nickname
    ) {
        String templateSlot = resolveTemplateSlot(typeLine);
        String borderTreatment = resolveBorderTreatment(typeLine, colors);
        String frameFamily = familiesWithFullCoverage.contains(requestedFamily)
            ? requestedFamily
            : DEFAULT_FAMILY;

        String title = nickname != null ? nickname : name;
        String subtitle = nickname != null ? name : null;

        return new FrameSelection(frameFamily, templateSlot, borderTreatment, title, subtitle);
    }

    private String resolveTemplateSlot(String typeLine) {
        String lower = typeLine.toLowerCase();
        if (lower.contains("land")) return "land";
        if (lower.contains("planeswalker")) return "planeswalker";
        if (lower.contains("artifact")) return "artifact";
        if (lower.contains("creature")) return "creature";
        if (lower.contains("enchantment")) return "enchantment";
        if (lower.contains("instant")) return "instant";
        if (lower.contains("sorcery")) return "sorcery";
        return "other";
    }

    private String resolveBorderTreatment(String typeLine, String colors) {
        String lower = typeLine.toLowerCase();
        if (lower.contains("land")) return "land";
        if (lower.contains("artifact")) return "artifact";
        if (colors.length() >= 2) return "multicolor";
        if (colors.length() == 1) return "mono-" + colors.charAt(0);
        return "colorless";
    }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && ./mvnw test -Dtest=FrameSelectorTest`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/io/eregion/render/FrameSelection.java \
        backend/src/main/java/io/eregion/render/FrameSelector.java \
        backend/src/test/java/io/eregion/render/FrameSelectorTest.java
git commit -m "Add pure frame-selection engine"
```

---

### Task 5: Acquire CardConjurer frame assets and layout data

This task has no automated test — it's asset acquisition and a data-conversion script, verified by manual inspection.

**Corrected after discovery during execution:** the user already has a local CardConjurer checkout at `/Users/rodgz_mac/Developer/MTG-CardMaker/assets/cardconjurer` (a fork of `Investigamer/cardconjurer`, kept locally for **personal/local use only** — this fork has no LICENSE file, and its own README explains the original hosted CardConjurer was taken down by a Wizards of the Coast cease-and-desist over exactly this asset category. The user has explicitly decided to proceed anyway, for personal/local use, accepting that posture — don't re-litigate this decision or re-raise the license question; just don't publish/distribute these assets anywhere beyond this private local use). No cloning needed — read directly from that local path.

**Files:**
- Create: `backend/src/main/resources/frames/m15/` (frame/symbol images, copied from the local CardConjurer checkout)
- Create: `backend/src/main/resources/frames/m15/layout.json`
- Create: `scripts/convert-cardconjurer-layout.mjs` (one-time conversion helper, not part of the running app)

**Confirmed source paths (from direct inspection of the local checkout):**
- Frame border PNGs: `/Users/rodgz_mac/Developer/MTG-CardMaker/assets/cardconjurer/img/frames/m15/regular/` — `m15FrameW.png` (white), `m15FrameU.png` (blue), `m15FrameB.png` (black), `m15FrameR.png` (red), `m15FrameG.png` (green), `m15FrameM.png` (multicolor/gold), `m15FrameA.png` (artifact — also doubles as the colorless border, since there's no separate standalone colorless frame), `m15FrameL.png` (land).
- P/T box PNGs, same directory: `m15PT{W,U,B,R,G,M,A,C,V}.png` (use `m15PTC.png` for the colorless P/T box).
- Mana symbol SVGs: `/Users/rodgz_mac/Developer/MTG-CardMaker/assets/cardconjurer/img/manaSymbols/` — `w.svg`, `u.svg`, `b.svg`, `r.svg`, `g.svg`, and `0.svg` through `20.svg` for generic costs.
- Layout/coordinate source: `/Users/rodgz_mac/Developer/MTG-CardMaker/assets/cardconjurer/js/frames/packM15Regular-1.js` — defines, as **fractional (0–1) coordinates relative to the card canvas** (not pixels): `card.artBounds`, `card.setSymbolBounds`, `card.watermarkBounds`, and a `loadTextOptions({...})` call with keys `mana`, `title`, `type`, `rules`, `pt`, each an `{x, y, width, height, ...}` object in the same 0–1 fractional scheme. Canvas base size is defined in `/Users/rodgz_mac/Developer/MTG-CardMaker/assets/cardconjurer/js/creator-23.js` (`baseWidth`/`baseHeight` constants, with a high-res export path using 2010×2814 — matches this plan's `FrameLayout.CARD_WIDTH`/`CARD_HEIGHT`). The artist/set/collector-number line is defined separately in `creator-23.js` (shared across frames, not per-pack), a `midLeft` text template around `x:0.0647, y:0.9548, width:0.8707, height:0.0171`.
- The land frame pack (`js/frames/packM15*.js` — find the land-specific one, likely `packM15Lands-*.js` or similar; list the directory to find it) has its own coordinate overrides for the land template slot — check it for any land-specific art-box/title differences rather than assuming the regular pack's numbers apply unchanged to land.

**Important: these coordinates are fractions (0.0–1.0), not pixels.** `layout.json` should store them as fractions too — don't pre-multiply by canvas size here, since Task 7's `FrameLayout`/`FrameLayoutLoader` is responsible for converting fraction → pixel `Rectangle` against `FrameLayout.CARD_WIDTH`/`CARD_HEIGHT`. (If you're implementing this task before Task 7 exists yet, just be consistent: store fractions, document that choice in a comment at the top of `layout.json` or this task's commit message, since Task 7 depends on it.)

- [ ] **Step 1: Copy the frame assets**

Copy the border PNGs and P/T box PNGs listed above into `backend/src/main/resources/frames/m15/`, renamed to match `FrameSelector`'s `borderTreatment` values: `border-mono-W.png`, `border-mono-U.png`, `border-mono-B.png`, `border-mono-R.png`, `border-mono-G.png`, `border-multicolor.png` (from `m15FrameM.png`), `border-colorless.png` (from `m15FrameA.png`), `border-artifact.png` (also from `m15FrameA.png` — same file copied twice under two names is fine, since `FrameSelector` treats artifact and colorless as separate border-treatment values today even though CardConjurer uses one frame image for both), `border-land.png` (from `m15FrameL.png`). Also copy the mana symbol SVGs into `backend/src/main/resources/frames/m15/mana/` keeping their original filenames (`w.svg`, `u.svg`, etc.) — this plan's compositing step (Task 7) doesn't actually render mana-cost icons yet (it's a documented follow-up), so exact integration isn't needed now, just get the files in place.

- [ ] **Step 2: Write the layout conversion script**

Read `packM15Regular-1.js` directly (it's plain JS, not JSON — you'll need to read the relevant `card.artBounds = {...}`/`loadTextOptions({...})` assignments as text and manually transcribe their fractional values, since this isn't parseable as a standalone JSON blob). Write `scripts/convert-cardconjurer-layout.mjs` as a script that just emits the hand-transcribed values as JSON (a "script" in name, but realistically a static data file generator, since the source isn't machine-parseable JSON) — or, simpler and equally acceptable: skip the script and hand-write `backend/src/main/resources/frames/m15/layout.json` directly, documenting in a comment-adjacent README or the commit message which source file/line each value was transcribed from. Either approach is fine; don't over-engineer a general-purpose JS-template parser for a one-time transcription of ~6 template slots.

Target `layout.json` shape — one entry per `templateSlot` (`creature`, `land`, `artifact`, `enchantment`, `instant`, `sorcery`, `planeswalker`, `other`), each with fractional `{x, y, width, height}` regions for: `artBox` (from `card.artBounds`), `titleText` (from `loadTextOptions(...).title`), `manaCostArea` (from `.mana`), `typeLineText` (from `.type`), `rulesTextBox` (from `.rules`), `ptBox` (from `.pt`, creature/planeswalker slots only), `artistCredit`/`collectorInfo` (from the shared `midLeft` template in `creator-23.js`), `setSymbol` (from `card.setSymbolBounds`). For slots without a distinct CardConjurer pack of their own (`enchantment`, `instant`, `sorcery`, `other`), reuse the regular M15 pack's non-creature-specific regions (everything except `ptBox`, which those slots omit).

- [ ] **Step 3: Inspect the output**

Open the resulting `layout.json` and sanity-check: every value is between 0 and 1, every templateSlot from `FrameSelector.resolveTemplateSlot`'s possible outputs has an entry, and the numbers look plausible (e.g. `artBox` roughly in the top 40-50% of the card, `rulesTextBox` roughly in the bottom-middle third).

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/resources/frames/m15 scripts/convert-cardconjurer-layout.mjs
git commit -m "Add M15 frame assets and layout data from the local CardConjurer checkout"
```

---

### Task 6: `CardRender` row, repository, and image endpoint

**Corrected after discovery during execution:** no JPA. `cards.id` is `UUID` (confirmed in `CardRepository`/migrations), persistence is `JdbcClient` raw SQL, Postgres is the real dialect (confirmed via `now()`, `ILIKE` usage elsewhere) so `BYTEA` is correct for image bytes.

**Further correction (found by code review after an initial implementation):** a `card_renders` table keyed only by `card_id` is a privacy and correctness bug. Rendered images carry per-deck private data (uploaded art, nicknames) — keying by `card_id` alone means (a) two different decks rendering the same base card stomp each other's row, and (b) a public, unauthenticated `GET` by card id would leak one user's private deck art/nickname to anyone who guesses a card's UUID. Fixed by keying `card_renders` by `(deck_id, card_id)` and adding the same owner-or-public-deck visibility check that `CustomPrintingRepository.imageFor` already uses for custom art (read that method first — in `backend/src/main/java/io/eregion/custom/CustomPrintingRepository.java`, `imageFor(UUID id, UUID viewerId)` — and mirror its exact `cp.user_id = :viewer OR EXISTS (SELECT 1 FROM decks d JOIN deck_version_cards dc ON dc.version_id = d.published_version_id WHERE d.visibility = 'public' AND ...)` shape, adapted to join through `decks` directly by `deck_id` since `card_renders` already carries that column — no need to join through `deck_version_cards`/`custom_printings` the way the art lookup does).

**Files:**
- Create: `backend/src/main/java/io/eregion/render/CardRenderRepository.java`
- Create: `backend/src/main/java/io/eregion/render/CardRenderController.java`
- Test: `backend/src/test/java/io/eregion/render/CardRenderControllerTest.java`
- Migration: `backend/src/main/resources/db/migration/V<next>__create_card_renders.sql`

- [ ] **Step 1: Write the failing test**

Follow the `PostgresTest`-base-class + hand-wired-real-objects convention established in Tasks 2/6 (no MockMvc exists anywhere in this codebase — confirmed repeatedly). The test needs: a real `decks` row (owned by a test user), a real `cards` row (for the FK), and an `@AuthenticationPrincipal Jwt`-equivalent viewer id to exercise both the owner-can-read and stranger-cannot-read-a-private-deck's-render paths:

```java
@Test
void getImage_ownerCanReadPrivateDeckRender() {
    // create a deck owned by userA, a card, insert a render row for (deck.id, card.id)
    // call controller.getImage(jwtFor(userA), deck.id, card.id) -> 200, correct bytes
}

@Test
void getImage_strangerCannotReadPrivateDeckRender() {
    // same setup, but call controller.getImage(jwtFor(userB)/* or null */, deck.id, card.id) -> 404
}

@Test
void getImage_anyoneCanReadPublicDeckRender() {
    // deck.visibility = 'public' (and has a published_version_id, per the decks_public_needs_version
    // constraint — check V5__public_decks.sql for exactly what that requires), render row present,
    // call controller.getImage(null, deck.id, card.id) -> 200
}

@Test
void getImage_missingRender_returns404() {
    // no render row for (deck.id, card.id) -> 404, regardless of viewer
}
```
(Treat these as the required behaviors, not literal copy-paste code — adapt to this codebase's actual test-fixture helpers for creating a deck/card/JWT, found by reading `DeckFrameSettingsControllerTest.java` and `CardRenderControllerTest`'s prior version if one already exists on this branch.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && ./mvnw test -Dtest=CardRenderControllerTest`

- [ ] **Step 3: Add the migration**

```sql
CREATE TABLE card_renders (
    deck_id UUID NOT NULL REFERENCES decks(id),
    card_id UUID NOT NULL REFERENCES cards(id),
    image_data BYTEA NOT NULL,
    inputs_hash VARCHAR(64) NOT NULL,
    rendered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (deck_id, card_id)
);
```

(If a `card_renders` table already exists on this branch from a prior implementation attempt, this migration **alters** it rather than creating fresh — check first and adjust: `ALTER TABLE card_renders ADD COLUMN deck_id UUID REFERENCES decks(id)`, drop the old single-column PK, add the new composite PK, backfill or truncate existing rows as appropriate since any pre-existing data has no deck_id to backfill with.)

- [ ] **Step 4: Create the repository**

```java
package io.eregion.render;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public class CardRenderRepository {

    public record CardRenderRow(UUID deckId, UUID cardId, byte[] imageData, String inputsHash) {}

    private final JdbcClient jdbc;

    public CardRenderRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** The render, when the viewer owns the deck or the deck is public. Anything else looks like a missing render. */
    public Optional<CardRenderRow> findVisibleTo(UUID deckId, UUID cardId, UUID viewerId) {
        return jdbc.sql("""
                SELECT cr.deck_id, cr.card_id, cr.image_data, cr.inputs_hash FROM card_renders cr
                JOIN decks d ON d.id = cr.deck_id
                WHERE cr.deck_id = :deckId AND cr.card_id = :cardId
                  AND (d.owner_id = :viewer OR d.visibility = 'public')
                """)
            .param("deckId", deckId).param("cardId", cardId).param("viewer", viewerId)
            .query((rs, n) -> new CardRenderRow(
                rs.getObject("deck_id", UUID.class), rs.getObject("card_id", UUID.class),
                rs.getBytes("image_data"), rs.getString("inputs_hash")))
            .optional();
    }

    public void upsert(UUID deckId, UUID cardId, byte[] imageData, String inputsHash) {
        jdbc.sql("""
                INSERT INTO card_renders (deck_id, card_id, image_data, inputs_hash, rendered_at)
                VALUES (:deckId, :cardId, :imageData, :inputsHash, now())
                ON CONFLICT (deck_id, card_id) DO UPDATE SET
                    image_data = EXCLUDED.image_data,
                    inputs_hash = EXCLUDED.inputs_hash,
                    rendered_at = now()
                """)
            .param("deckId", deckId).param("cardId", cardId)
            .param("imageData", imageData).param("inputsHash", inputsHash)
            .update();
    }
}
```

(`viewerId` may be `null` for an anonymous caller — `d.owner_id = NULL` is simply false in Postgres, never throws, so an anonymous viewer falls through to the `visibility = 'public'` check only, same behavior as `CustomPrintingRepository.imageFor`.)

- [ ] **Step 5: Create the controller**

```java
package io.eregion.render;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/decks/{deckId}/cards/{cardId}/render")
public class CardRenderController {

    private final CardRenderRepository repository;
    private final CardRenderService renderService;

    public CardRenderController(CardRenderRepository repository, CardRenderService renderService) {
        this.repository = repository;
        this.renderService = renderService;
    }

    @GetMapping("/image")
    public ResponseEntity<byte[]> getImage(
        @AuthenticationPrincipal Jwt jwt, @PathVariable UUID deckId, @PathVariable UUID cardId
    ) {
        return repository.findVisibleTo(deckId, cardId, CurrentUser.idOrNull(jwt))
            .map(render -> ResponseEntity.ok()
                .contentType(MediaType.IMAGE_PNG)
                .body(render.imageData()))
            .orElseGet(() -> ResponseEntity.status(HttpStatus.NOT_FOUND).build());
    }
}
```

(Use the real `CurrentUser.idOrNull` import — found in `io.eregion.auth.CurrentUser` per Task 2's research; it returns `null` when `jwt == null` instead of throwing, matching `CustomPrintingController`'s usage.) Since this endpoint takes an optional/nullable JWT and must work for anonymous callers viewing a public deck, add it to `SecurityConfig`'s `permitAll` GET list and `SessionTokenResolver.isOptional`, mirroring `/api/custom-printings/*/image`'s exact two-part treatment there (both files need the new path pattern, e.g. `/api/decks/*/cards/*/render/image`) — the DB-level `findVisibleTo` check is what actually enforces privacy; the HTTP-level permit is just "don't require a valid token to attempt the request."

`CardRenderService` is implemented in Task 7 — create a minimal stub now so this compiles (note the signature now takes `deckId` too):

```java
package io.eregion.render;

import org.springframework.stereotype.Service;

import java.util.UUID;

@Service
public class CardRenderService {
    public void render(UUID deckId, UUID cardId, byte[] artBytes) {
        // Replaced with real compositing logic in Task 7.
    }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && ./mvnw test -Dtest=CardRenderControllerTest`
Expected: PASS

- [ ] **Step 7: Run the full suite** to confirm no regressions: `cd backend && ./mvnw test`

- [ ] **Step 8: Commit**

```bash
git add backend/src/main/java/io/eregion/render/CardRenderRepository.java \
        backend/src/main/java/io/eregion/render/CardRenderController.java \
        backend/src/main/java/io/eregion/render/CardRenderService.java \
        backend/src/main/java/io/eregion/config/SecurityConfig.java \
        backend/src/main/java/io/eregion/config/SessionTokenResolver.java \
        backend/src/test/java/io/eregion/render/CardRenderControllerTest.java \
        backend/src/main/resources/db/migration
git commit -m "Scope CardRender storage/access by deck ownership and visibility"
```

---

### Task 7: Implement `CardRenderService` compositing

**Corrected after discovery during execution:** `Card` is an immutable record, built via `CardRepository.upsert`/`findById` — there's no mutable builder. Build a test `Card` via `cardRepository.upsert(new Card(...))` with the full positional constructor (check its current field order — it changed in Task 1 to include `power`/`toughness`) rather than setters. `cardId`/`deckId` are both `UUID`, matching the `render(UUID deckId, UUID cardId, byte[] artBytes)` signature already stubbed in Task 6 (Task 6 was corrected to scope renders by deck, not just card, to avoid leaking private deck data — see Task 6's own correction note).

**Second correction:** the draft below originally hardcoded `"m15"` as the frame family and never read the deck's actual `DeckFrameSettings` (frame family, artist name, collection code) from Task 2 — meaning those settings would go completely unused by compositing, contradicting the original ask (deck-chosen frame family + artist name + collection code baked into every render). Fixed: `CardRenderService` now injects `DeckFrameSettingsRepository` (from Task 2) and looks up the deck's settings at the top of `render(...)`, using its `frameFamily` instead of a literal, and threading `artistName`/`collectionCode` into `drawText` for the artist-credit/set-symbol line (even though that specific text rendering is still a documented placeholder per the "Known follow-ups" section — at least read the real values now instead of ignoring them, so finishing that follow-up later doesn't also require re-wiring this data access).

**Files:**
- Modify: `backend/src/main/java/io/eregion/render/CardRenderService.java`
- Create: `backend/src/main/java/io/eregion/render/FrameLayout.java`
- Create: `backend/src/main/java/io/eregion/render/FrameLayoutLoader.java`
- Test: `backend/src/test/java/io/eregion/render/CardRenderServiceTest.java`

- [ ] **Step 1: Write the failing test**

```java
package io.eregion.render;

import io.eregion.card.Card;
import io.eregion.card.CardRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
class CardRenderServiceTest {

    @Autowired CardRenderService service;
    @Autowired CardRenderRepository renderRepository;
    @Autowired CardRepository cardRepository;

    @Test
    void render_producesNonEmptyPngOfExpectedSize() throws Exception {
        // Build via CardRepository.upsert using the current full positional
        // Card constructor (confirm its field order in Card.java/CardRepository.java
        // first — it changed in Task 1 to add power/toughness). Set name="Grizzly Bears",
        // typeLine="Creature — Bear", colors="G", power="2", toughness="2";
        // other fields can be empty strings / null / 0 as appropriate.
        Card card = cardRepository.upsert(/* ... */);
        // Also create a real deck owned by the test user (follow Task 2's test
        // fixture pattern) — deckId is needed for the new render() signature.
        UUID deckId = /* ... */ null;

        BufferedImage tinyArt = new BufferedImage(10, 10, BufferedImage.TYPE_INT_RGB);
        ByteArrayOutputStream artOut = new ByteArrayOutputStream();
        ImageIO.write(tinyArt, "png", artOut);

        service.render(deckId, card.id(), artOut.toByteArray());

        CardRenderRepository.CardRenderRow render = renderRepository.findVisibleTo(deckId, card.id(), /* owner's user id */ null).orElseThrow();
        assertThat(render.imageData()).isNotEmpty();

        BufferedImage image = ImageIO.read(new ByteArrayInputStream(render.imageData()));
        assertThat(image.getWidth()).isEqualTo(FrameLayout.CARD_WIDTH);
        assertThat(image.getHeight()).isEqualTo(FrameLayout.CARD_HEIGHT);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./mvnw test -Dtest=CardRenderServiceTest`
Expected: FAIL — `FrameLayout.CARD_WIDTH`/`CARD_HEIGHT` don't exist, render stub does nothing.

- [ ] **Step 3: Define `FrameLayout`**

```java
package io.eregion.render;

import java.awt.Rectangle;
import java.util.Map;

public record FrameLayout(
    Map<String, Rectangle> regions // keys: artBox, titleText, manaCostArea, typeLineText, rulesTextBox, ptBox, artistCredit, collectorInfo, setSymbol
) {
    public static final int CARD_WIDTH = 2010;
    public static final int CARD_HEIGHT = 2814;

    public Rectangle region(String name) {
        Rectangle rect = regions.get(name);
        if (rect == null) {
            throw new IllegalStateException("No layout region named " + name);
        }
        return rect;
    }
}
```

(`CARD_WIDTH`/`CARD_HEIGHT` = 2010×2814 matches CardConjurer's own high-res export size, confirmed against `creator-23.js` in the local checkout — no adjustment needed unless Task 5 ended up using different source coordinates.)

- [ ] **Step 4: Implement `FrameLayoutLoader`**

**Corrected after discovery during execution:** Task 5's `layout.json` stores regions as **fractions (0.0–1.0) of the card canvas**, matching CardConjurer's own coordinate scheme — not pixels. `FrameLayoutLoader` must multiply each fraction by `FrameLayout.CARD_WIDTH`/`CARD_HEIGHT` when building the `Rectangle`.

```java
package io.eregion.render;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.awt.Rectangle;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;

@Component
public class FrameLayoutLoader {

    private final ObjectMapper objectMapper = new ObjectMapper();

    public FrameLayout load(String frameFamily, String templateSlot) {
        String path = "/frames/" + frameFamily + "/layout.json";
        try (InputStream in = getClass().getResourceAsStream(path)) {
            if (in == null) {
                throw new IllegalStateException("No layout.json for frame family " + frameFamily);
            }
            JsonNode root = objectMapper.readTree(in);
            JsonNode slotNode = root.get(templateSlot);
            if (slotNode == null) {
                throw new IllegalStateException("Frame family " + frameFamily + " has no slot " + templateSlot);
            }
            Map<String, Rectangle> regions = new HashMap<>();
            Iterator<String> fieldNames = slotNode.fieldNames();
            while (fieldNames.hasNext()) {
                String field = fieldNames.next();
                JsonNode rect = slotNode.get(field);
                regions.put(field, new Rectangle(
                    (int) Math.round(rect.get("x").asDouble() * FrameLayout.CARD_WIDTH),
                    (int) Math.round(rect.get("y").asDouble() * FrameLayout.CARD_HEIGHT),
                    (int) Math.round(rect.get("width").asDouble() * FrameLayout.CARD_WIDTH),
                    (int) Math.round(rect.get("height").asDouble() * FrameLayout.CARD_HEIGHT)));
            }
            return new FrameLayout(regions);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to load layout for " + frameFamily + "/" + templateSlot, e);
        }
    }
}
```

- [ ] **Step 5: Implement `CardRenderService.render`**

```java
package io.eregion.render;

import io.eregion.card.Card;
import io.eregion.card.CardRepository;
import org.springframework.stereotype.Service;

import javax.imageio.ImageIO;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.UUID;

@Service
public class CardRenderService {

    private final CardRepository cardRepository;
    private final CardRenderRepository renderRepository;
    private final FrameSelector frameSelector;
    private final FrameLayoutLoader layoutLoader;
    private final DeckFrameSettingsRepository frameSettingsRepository;

    public CardRenderService(
        CardRepository cardRepository,
        CardRenderRepository renderRepository,
        FrameSelector frameSelector,
        FrameLayoutLoader layoutLoader,
        DeckFrameSettingsRepository frameSettingsRepository
    ) {
        this.cardRepository = cardRepository;
        this.renderRepository = renderRepository;
        this.frameSelector = frameSelector;
        this.layoutLoader = layoutLoader;
        this.frameSettingsRepository = frameSettingsRepository;
    }

    public void render(UUID deckId, UUID cardId, byte[] artBytes) {
        Card card = cardRepository.findById(cardId)
            .orElseThrow(() -> new IllegalArgumentException("No card with id " + cardId));

        DeckFrameSettingsRepository.FrameSettingsRow settings = frameSettingsRepository.findByDeckId(deckId)
            .orElse(new DeckFrameSettingsRepository.FrameSettingsRow(deckId, null, null, FrameSelector.DEFAULT_FAMILY));

        FrameSelection selection = frameSelector.select(
            card.typeLine(), card.colors(), settings.frameFamily(), card.name(), null);

        FrameLayout layout = layoutLoader.load(selection.frameFamily(), selection.templateSlot());

        try {
            BufferedImage canvas = new BufferedImage(
                FrameLayout.CARD_WIDTH, FrameLayout.CARD_HEIGHT, BufferedImage.TYPE_INT_ARGB);
            Graphics2D g = canvas.createGraphics();
            g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);

            drawArt(g, layout, artBytes);
            drawFrameBorder(g, selection);
            drawText(g, layout, selection, card, settings);

            g.dispose();

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            ImageIO.write(canvas, "png", out);

            renderRepository.upsert(deckId, cardId, out.toByteArray(), inputsHash(card, selection));
        } catch (IOException e) {
            throw new IllegalStateException("Failed to render card " + cardId + " for deck " + deckId, e);
        }
    }

    private void drawArt(Graphics2D g, FrameLayout layout, byte[] artBytes) throws IOException {
        Rectangle artBox = layout.region("artBox");
        BufferedImage art = ImageIO.read(new java.io.ByteArrayInputStream(artBytes));
        g.drawImage(art, artBox.x, artBox.y, artBox.width, artBox.height, null);
    }

    private void drawFrameBorder(Graphics2D g, FrameSelection selection) throws IOException {
        String path = "/frames/" + selection.frameFamily() + "/border-" + selection.borderTreatment() + ".png";
        try (InputStream in = getClass().getResourceAsStream(path)) {
            if (in == null) {
                throw new IllegalStateException("Missing frame border asset: " + path);
            }
            BufferedImage border = ImageIO.read(in);
            g.drawImage(border, 0, 0, FrameLayout.CARD_WIDTH, FrameLayout.CARD_HEIGHT, null);
        }
    }

    private void drawText(
        Graphics2D g, FrameLayout layout, FrameSelection selection, Card card,
        DeckFrameSettingsRepository.FrameSettingsRow settings
    ) {
        g.setColor(Color.BLACK);

        Rectangle titleBox = layout.region("titleText");
        g.setFont(new Font("Serif", Font.BOLD, 48));
        g.drawString(selection.title(), titleBox.x, titleBox.y + titleBox.height);

        if (selection.subtitle() != null) {
            Rectangle typeLineBox = layout.region("typeLineText");
            g.setFont(new Font("Serif", Font.ITALIC, 24));
            g.drawString(selection.subtitle(), typeLineBox.x, typeLineBox.y - 8);
        }

        Rectangle typeLineBox = layout.region("typeLineText");
        g.setFont(new Font("Serif", Font.PLAIN, 36));
        g.drawString(card.typeLine(), typeLineBox.x, typeLineBox.y + typeLineBox.height);

        if (card.power() != null && card.toughness() != null) {
            Rectangle ptBox = layout.region("ptBox");
            g.setFont(new Font("Serif", Font.BOLD, 40));
            g.drawString(card.power() + "/" + card.toughness(), ptBox.x, ptBox.y + ptBox.height);
        }

        // Rules text auto-shrink-to-fit, mana symbol icon substitution, and
        // artist/collector/set-symbol rendering are intentionally minimal
        // placeholders here: they need the real asset filenames from Task 5
        // to be finalized against the actual CardConjurer symbol set before
        // writing final layout code. Track as explicit follow-up, not silently
        // skipped: see "Known follow-ups" at the bottom of this plan.
    }

    private String inputsHash(Card card, FrameSelection selection) {
        return Integer.toHexString(
            (card.name() + selection.frameFamily() + selection.templateSlot() + selection.borderTreatment()).hashCode());
    }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && ./mvnw test -Dtest=CardRenderServiceTest`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/io/eregion/render/CardRenderService.java \
        backend/src/main/java/io/eregion/render/FrameLayout.java \
        backend/src/main/java/io/eregion/render/FrameLayoutLoader.java \
        backend/src/test/java/io/eregion/render/CardRenderServiceTest.java
git commit -m "Implement card compositing: art, frame border, and basic text layers"
```

---

### Task 8: Wire render triggers (art upload, nickname save, deck setting save)

**Corrected after discovery during execution:** `CardRenderService.render(UUID deckId, UUID cardId, byte[] artBytes)` already takes art bytes directly plus a `deckId` (fixed in Task 6/7 — the render is scoped per-deck now, to avoid leaking private deck data across decks that share the same base card; no further signature change needed here, but every call site below must pass a `deckId`, not just a `cardId`). Art is stored per `CustomPrinting` (table `custom_printings`), **not** 1:1 with a card — a card can have multiple custom printings. `CustomPrintingRepository` exposes `imageFor(id, viewerId)` keyed by *printing* id, not card id — this task needs a card-id-keyed lookup for "the" art to use when re-rendering, which doesn't exist yet. Read `CustomPrintingController.java` and `CustomPrintingRepository.java` in full before writing this task's code, and resolve this gap explicitly in Step 1 rather than assuming a method that isn't there. `DeckRenderTrigger.rerenderDeck` takes `UUID deckId` (already stubbed that way in Task 2) — that `deckId` is both "which deck to iterate cards for" and "which deck to pass into `render(...)`" for every card in it. There is no `Deck.java`/`Card("name")` single-arg constructor — card-in-deck membership must be read from whatever table backs `DeckDtos`/deck card lists (check `DeckRepository`/`DeckService` for how deck contents are queried — likely `deck_version_cards`, joined through the deck's current/published version) rather than guessed. The art-upload trigger (Step 3) also needs a `deckId` to pass to `render(...)` — check whether `CustomPrintingController`'s upload endpoint already receives a `deckId` (e.g. as a request param, since a custom printing isn't deck-scoped in its own table) or whether you need to resolve "which deck is this upload happening in the context of" some other way; this is a real design question to resolve by reading the actual upload request shape, not to guess.

**Files:**
- Modify: `backend/src/main/java/io/eregion/custom/CustomPrintingController.java` (locate the existing art upload endpoint)
- Modify: `backend/src/main/java/io/eregion/custom/CustomPrintingRepository.java` (add a card-id-keyed "latest art for this card" lookup if one doesn't already exist)
- Modify: `backend/src/main/java/io/eregion/proxy/ProxyService.java` (locate the existing nickname-save path, e.g. where `Draft`/`Treatment` gets persisted)
- Modify: `backend/src/main/java/io/eregion/render/DeckRenderTrigger.java`
- Create: `backend/src/main/java/io/eregion/render/ArtLookup.java`
- Test: `backend/src/test/java/io/eregion/render/DeckRenderTriggerTest.java`

- [ ] **Step 1: Read before writing, and decide what counts as "the" art for a card**

Read `CustomPrintingController.java`, `CustomPrintingRepository.java`, `ProxyService.java`, `DeckRepository.java` (how it lists a deck's cards), and `DeckRenderTrigger`/`DeckFrameSettingsService` from Task 2. Since a card can have multiple custom printings, decide (consistent with how the frontend already picks which art to display — check `customArtUrl`/`DeckBuilder.tsx` for the existing "pick the art to show" logic, e.g. most recent upload, or one marked current) which printing's bytes `ArtLookup` should return. If the frontend has no single clear "current art" concept either, use most-recently-uploaded for that card as the rule, and note this as a `DONE_WITH_CONCERNS` item in your report rather than silently picking something arbitrary.

- [ ] **Step 2: Create `ArtLookup`**

```java
package io.eregion.render;

import io.eregion.custom.CustomPrintingRepository;
import org.springframework.stereotype.Component;

import java.util.UUID;

@Component
public class ArtLookup {

    private final CustomPrintingRepository customPrintingRepository;

    public ArtLookup(CustomPrintingRepository customPrintingRepository) {
        this.customPrintingRepository = customPrintingRepository;
    }

    public byte[] findArtBytes(UUID cardId) {
        // Wire to whichever CustomPrintingRepository method Step 1 determined
        // is the right "latest/current art for this card" lookup. If none
        // exists yet, add one to CustomPrintingRepository following its
        // existing JdbcClient query style (e.g. ORDER BY created_at DESC LIMIT 1
        // WHERE card_id = :cardId), returning Optional<byte[]> or similar,
        // and unwrap it here (null if absent — callers already handle null).
        return null;
    }
}
```

- [ ] **Step 3: Trigger render on art upload**

In `CustomPrintingController`'s upload endpoint (`upload(...)`, confirmed signature takes `cardId` and a `MultipartFile file`), determine the `deckId` to use (per the note above — read the real request/route shape; if the upload endpoint has no deck context at all, this card-level upload may need to trigger a render for every deck that currently contains this card, similar to how `ArtLookup`/`DeckRenderTrigger` already has to enumerate deck→card relationships, rather than a single deckId). After the upload is persisted successfully, call `cardRenderService.render(deckId, cardId, file.getBytes())` for each relevant deck (inject `CardRenderService` into the controller's constructor). Use the just-uploaded bytes directly rather than re-fetching through `ArtLookup` — it's already in hand.

- [ ] **Step 4: Trigger render on nickname save**

In `ProxyService`, find the method that persists a nickname via `ProxyRepository` (from the `generate(...)`/`Draft` flow) — nicknames are already deck-scoped (per the Proxy feature's existing design), so this method should already have a `deckId` in scope. After the nickname is persisted, use `ArtLookup.findArtBytes(cardId)`; if non-null, call `cardRenderService.render(deckId, cardId, artBytes)`. If null (no art uploaded yet), skip — nothing to composite.

- [ ] **Step 5: Write the failing test for deck-wide re-render**

Follow whatever fixture pattern existing deck/card integration tests use for seeding a deck with cards (check `DeckServiceTest`/`DeckControllerTest` for the helper). Shape:

```java
package io.eregion.render;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;

import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@SpringBootTest
class DeckRenderTriggerTest {

    @Autowired DeckRenderTrigger trigger;
    @MockBean CardRenderService cardRenderService;
    @MockBean ArtLookup artLookup;

    @Test
    void rerenderDeck_rendersEveryCardInDeckThatHasArt() {
        // Seed a deck with two cards, following the existing deck-fixture
        // helper found in Step 1's research.
        UUID deckId = /* ... */ null;
        UUID cardAId = /* ... */ null;
        UUID cardBId = /* ... */ null;

        when(artLookup.findArtBytes(cardAId)).thenReturn(new byte[] { 1 });
        when(artLookup.findArtBytes(cardBId)).thenReturn(new byte[] { 2 });

        trigger.rerenderDeck(deckId);

        verify(cardRenderService, times(1)).render(eq(deckId), eq(cardAId), any());
        verify(cardRenderService, times(1)).render(eq(deckId), eq(cardBId), any());
    }
}
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd backend && ./mvnw test -Dtest=DeckRenderTriggerTest`
Expected: FAIL — `DeckRenderTrigger.rerenderDeck` is currently a no-op.

- [ ] **Step 7: Implement `DeckRenderTrigger.rerenderDeck`**

```java
package io.eregion.render;

import org.springframework.stereotype.Component;

import java.util.List;
import java.util.UUID;

@Component
public class DeckRenderTrigger {

    private final CardRenderService cardRenderService;
    private final ArtLookup artLookup;
    // Inject whatever repository/method Step 1 found for listing a deck's card ids
    // (e.g. DeckRepository, if it exposes one — check before guessing a new method name).

    public DeckRenderTrigger(CardRenderService cardRenderService, ArtLookup artLookup /*, deck-card lookup */) {
        this.cardRenderService = cardRenderService;
        this.artLookup = artLookup;
    }

    public void rerenderDeck(UUID deckId) {
        List<UUID> cardIds = /* real deck-card-id lookup from Step 1 */ List.of();
        for (UUID cardId : cardIds) {
            byte[] artBytes = artLookup.findArtBytes(cardId);
            if (artBytes != null) {
                cardRenderService.render(deckId, cardId, artBytes);
            }
        }
    }
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd backend && ./mvnw test -Dtest=DeckRenderTriggerTest`
Expected: PASS

- [ ] **Step 9: Add failure resilience**

In `CardRenderService.render` (from Task 7), wrap the compositing body in a try/catch that logs on failure without deleting any existing render row:

```java
public void render(UUID deckId, UUID cardId, byte[] artBytes) {
    try {
        // existing body from Task 7 Step 5
    } catch (Exception e) {
        LOGGER.error("Failed to render card {} for deck {}; keeping previous render if any", cardId, deckId, e);
    }
}
```

Add a `private static final Logger LOGGER = LoggerFactory.getLogger(CardRenderService.class);` field and the corresponding import.

- [ ] **Step 10: Commit**

```bash
git add backend/src/main/java/io/eregion/custom/CustomPrintingController.java \
        backend/src/main/java/io/eregion/custom/CustomPrintingRepository.java \
        backend/src/main/java/io/eregion/proxy/ProxyService.java \
        backend/src/main/java/io/eregion/render/DeckRenderTrigger.java \
        backend/src/main/java/io/eregion/render/ArtLookup.java \
        backend/src/main/java/io/eregion/render/CardRenderService.java \
        backend/src/test/java/io/eregion/render/DeckRenderTriggerTest.java
git commit -m "Trigger card renders on art upload, nickname save, and deck setting save"
```

---

### Task 9: Frontend displays composited render with fallback

**Corrected after discovery during execution:** the render endpoint is deck-scoped (`GET /api/decks/{deckId}/cards/{cardId}/render/image`, not `/api/cards/{cardId}/render/image` — Task 6 was corrected to avoid leaking private deck data across decks sharing the same base card). `cardRenderUrl` needs both ids.

**Files:**
- Modify: `frontend/src/components/builder/DeckBuilder.tsx`
- Modify: `frontend/src/components/builder/ProxyPanel.tsx`
- Modify: `frontend/src/lib/links.ts`

- [ ] **Step 1: Add a render-image URL helper**

In `frontend/src/lib/links.ts`, alongside the existing `customArtUrl` helper, add:

```typescript
export function cardRenderUrl(deckId: string, cardId: string): string {
  return `/api/decks/${deckId}/cards/${cardId}/render/image`;
}
```

- [ ] **Step 2: Swap the displayed image with fallback**

In both `DeckBuilder.tsx` (around the existing `customArtUrl`/`imageNormal` usage found during Task 1's spec research, near lines 84-86 and 596-599) and `ProxyPanel.tsx`, change the `<img>` `src` to try the render endpoint first, falling back to the existing art/Scryfall image on load error. Both components already have the deck's id in scope (same `deck.id` passed to sibling sections like `FramePanel`/`LoreSection`) — thread it through:

```tsx
<img
  src={cardRenderUrl(deck.id, card.id)}
  onError={(e) => {
    e.currentTarget.onerror = null;
    e.currentTarget.src = customArtUrl(card.id) ?? card.imageNormal;
  }}
  alt={card.name}
/>
```

(Match this exactly against however the existing `<img>` tags are structured in each file — preserve any existing className/sizing props, just change `src` and add the `onError` fallback.)

- [ ] **Step 3: Manually verify in the browser**

Open a deck with a card that has no `CardRender` yet — confirm it falls back to the existing art/Scryfall image without a broken-image flash. Upload art for a card (triggers Task 8's render), reload, confirm the composited image now displays.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/builder/DeckBuilder.tsx \
        frontend/src/components/builder/ProxyPanel.tsx \
        frontend/src/lib/links.ts
git commit -m "Display composited card renders with fallback to existing art"
```

---

### Task 10: Trigger-scope tests

**Files:**
- Test: `backend/src/test/java/io/eregion/custom/CustomPrintingControllerTest.java` (extend existing or create if absent)
- Test: `backend/src/test/java/io/eregion/proxy/ProxyServiceTest.java` (extend existing — this file already exists per the repo's git status)

- [ ] **Step 1: Write the failing test for art-upload scope**

In `CustomPrintingControllerTest`, add (creating the test class first if none exists, following the existing controller test patterns in the project):

```java
@MockBean CardRenderService cardRenderService;

@Test
void uploadArt_rendersOnlyThatCard() throws Exception {
    // ... perform the existing upload request for a known cardId, using
    // whatever MockMvc setup the existing upload tests in this file already
    // use ...

    verify(cardRenderService, times(1)).render(any(), eq(cardId), any());
}
```
(`render(deckId, cardId, artBytes)` — match any `deckId` here since the upload-trigger's exact deck-resolution logic is Task 8's concern, not this test's; just confirm `cardId` and the call count.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./mvnw test -Dtest=CustomPrintingControllerTest#uploadArt_rendersOnlyThatCard`
Expected: FAIL until Task 8 Step 2's wiring is confirmed correct — if Task 8 was done correctly this should already pass; if it fails here, fix the wiring in `CustomPrintingController` now.

- [ ] **Step 3: Write the failing test for nickname-save scope**

In `ProxyServiceTest` (the existing file, modified per git status), add a test following the same shape as Step 1: mock `CardRenderService`, save a nickname for one card, assert `render` was called exactly once for that card's id and never for any other card.

- [ ] **Step 4: Run and fix until green**

Run: `cd backend && ./mvnw test -Dtest=ProxyServiceTest`
Expected: PASS once Task 8 Step 3's wiring is confirmed correct.

- [ ] **Step 5: Confirm deck-setting scope test already covers the full-deck case**

`DeckRenderTriggerTest` from Task 8 already verifies every card in a deck gets rendered on a deck-setting save — no new test needed here, just re-run it to confirm it's still green:

Run: `cd backend && ./mvnw test -Dtest=DeckRenderTriggerTest`
Expected: PASS

- [ ] **Step 6: Run the full backend test suite**

Run: `cd backend && ./mvnw test`
Expected: PASS — all tests from Tasks 1-10 green.

- [ ] **Step 7: Commit**

```bash
git add backend/src/test/java/io/eregion/custom/CustomPrintingControllerTest.java \
        backend/src/test/java/io/eregion/proxy/ProxyServiceTest.java
git commit -m "Add trigger-scope tests for art upload and nickname save"
```

---

## Known follow-ups (explicitly out of scope for this plan)

- Rules-text auto-shrink-to-fit, mana symbol icon substitution inside cost/oracle text, and artist-credit/collector-number/set-symbol rendering are left as minimal/placeholder drawing in Task 7 — finishing these requires the real CardConjurer symbol asset filenames from Task 5, which aren't known until that asset pack is actually inspected. Do not treat Task 7 as "full card face" complete without a follow-up pass once Task 5's real assets are in hand.
- CardConjurer license check (Task 5, Step 1) may block bundling entirely — if so, the asset-sourcing approach in this plan needs to be revisited before Task 5 can proceed.
