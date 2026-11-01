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

**Files:**
- Modify: `backend/src/main/java/io/eregion/card/ScryfallCard.java`
- Modify: `backend/src/main/java/io/eregion/card/Card.java`
- Modify: `backend/src/main/java/io/eregion/card/ScryfallMapper.java`
- Modify: `frontend/src/lib/types.ts`
- Test: `backend/src/test/java/io/eregion/card/ScryfallMapperTest.java`

- [ ] **Step 1: Write the failing test**

Add to `ScryfallMapperTest.java` (create the file if it doesn't exist yet — check first):

```java
@Test
void toCard_mapsPowerAndToughness() {
    ScryfallCard scryfallCard = new ScryfallCard();
    scryfallCard.name = "Grizzly Bears";
    scryfallCard.type_line = "Creature — Bear";
    scryfallCard.power = "2";
    scryfallCard.toughness = "2";

    Card card = ScryfallMapper.toCard(scryfallCard);

    assertThat(card.getPower()).isEqualTo("2");
    assertThat(card.getToughness()).isEqualTo("2");
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./mvnw test -Dtest=ScryfallMapperTest#toCard_mapsPowerAndToughness`
Expected: FAIL — compile error, `getPower()`/`getToughness()` don't exist on `Card`.

- [ ] **Step 3: Add fields to `ScryfallCard`**

In `ScryfallCard.java`, alongside the existing `type_line`/`mana_cost` fields, add:

```java
public String power;
public String toughness;
```

(Use `String`, not a numeric type — Scryfall represents these as strings so values like `"*"` and `"1+*"` round-trip correctly.)

- [ ] **Step 4: Add fields to `Card`**

In `Card.java`, alongside the existing `manaCost`/`oracleText` columns, add:

```java
private String power;
private String toughness;

public String getPower() { return power; }
public void setPower(String power) { this.power = power; }

public String getToughness() { return toughness; }
public void setToughness(String toughness) { this.toughness = toughness; }
```

Also add the corresponding `@Column` annotations matching the style of the existing fields in the same class (e.g. if `oracleText` uses `@Column(columnDefinition = "TEXT")`, mirror that for consistency — `power`/`toughness` are short strings so a plain `@Column` without a length override is fine).

- [ ] **Step 5: Map the fields in `ScryfallMapper.toCard`**

In `ScryfallMapper.java`, inside `toCard`, next to where `manaCost`/`oracleText` are set on the `Card`, add:

```java
card.setPower(scryfallCard.power);
card.setToughness(scryfallCard.toughness);
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && ./mvnw test -Dtest=ScryfallMapperTest#toCard_mapsPowerAndToughness`
Expected: PASS

- [ ] **Step 7: Add a DB migration**

Find the existing migration directory (e.g. `backend/src/main/resources/db/migration/`) and check the latest `V*.sql` file to find the next version number. Create `V<next>__add_power_toughness_to_card.sql`:

```sql
ALTER TABLE card ADD COLUMN power VARCHAR(16);
ALTER TABLE card ADD COLUMN toughness VARCHAR(16);
```

- [ ] **Step 8: Mirror the fields on the frontend type**

In `frontend/src/lib/types.ts`, inside the `Card` interface, alongside `manaCost`/`oracleText`, add:

```typescript
power?: string;
toughness?: string;
```

- [ ] **Step 9: Commit**

```bash
git add backend/src/main/java/io/eregion/card/ScryfallCard.java \
        backend/src/main/java/io/eregion/card/Card.java \
        backend/src/main/java/io/eregion/card/ScryfallMapper.java \
        backend/src/test/java/io/eregion/card/ScryfallMapperTest.java \
        backend/src/main/resources/db/migration \
        frontend/src/lib/types.ts
git commit -m "Add power/toughness to the card model"
```

---

### Task 2: `DeckFrameSettings` entity, repository, and endpoint

**Files:**
- Create: `backend/src/main/java/io/eregion/render/DeckFrameSettings.java`
- Create: `backend/src/main/java/io/eregion/render/DeckFrameSettingsRepository.java`
- Create: `backend/src/main/java/io/eregion/render/DeckFrameSettingsController.java`
- Test: `backend/src/test/java/io/eregion/render/DeckFrameSettingsControllerTest.java`
- Migration: `backend/src/main/resources/db/migration/V<next>__create_deck_frame_settings.sql`

- [ ] **Step 1: Write the failing test**

```java
package io.eregion.render;

import io.eregion.deck.DeckRepository;
import io.eregion.deck.Deck;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class DeckFrameSettingsControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired DeckRepository deckRepository;
    @Autowired DeckFrameSettingsRepository frameSettingsRepository;

    @Test
    void putThenGet_roundTripsSettings() throws Exception {
        Deck deck = deckRepository.save(new Deck("Test Deck"));

        mockMvc.perform(put("/api/decks/" + deck.getId() + "/frame-settings")
                .contentType("application/json")
                .content("""
                    {"artistName":"Jane Doe","collectionCode":"ERG","frameFamily":"m15"}
                    """))
            .andExpect(status().isOk());

        mockMvc.perform(get("/api/decks/" + deck.getId() + "/frame-settings"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.artistName").value("Jane Doe"))
            .andExpect(jsonPath("$.collectionCode").value("ERG"))
            .andExpect(jsonPath("$.frameFamily").value("m15"));
    }
}
```

(Adjust the `Deck` constructor call to match whatever constructor/builder the existing `Deck` entity actually exposes — check `backend/src/main/java/io/eregion/deck/Deck.java` before writing this step for real, since the plan author has not verified its exact signature.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./mvnw test -Dtest=DeckFrameSettingsControllerTest`
Expected: FAIL — compile error, `DeckFrameSettings`/repository/controller don't exist.

- [ ] **Step 3: Create the entity**

```java
package io.eregion.render;

import jakarta.persistence.*;

@Entity
@Table(name = "deck_frame_settings")
public class DeckFrameSettings {

    @Id
    private Long deckId;

    private String artistName;
    private String collectionCode;
    private String frameFamily;

    protected DeckFrameSettings() {}

    public DeckFrameSettings(Long deckId, String artistName, String collectionCode, String frameFamily) {
        this.deckId = deckId;
        this.artistName = artistName;
        this.collectionCode = collectionCode;
        this.frameFamily = frameFamily;
    }

    public Long getDeckId() { return deckId; }
    public String getArtistName() { return artistName; }
    public void setArtistName(String artistName) { this.artistName = artistName; }
    public String getCollectionCode() { return collectionCode; }
    public void setCollectionCode(String collectionCode) { this.collectionCode = collectionCode; }
    public String getFrameFamily() { return frameFamily; }
    public void setFrameFamily(String frameFamily) { this.frameFamily = frameFamily; }
}
```

(`deckId` is the primary key — one settings row per deck, no separate surrogate key needed.)

- [ ] **Step 4: Create the repository**

```java
package io.eregion.render;

import org.springframework.data.jpa.repository.JpaRepository;

public interface DeckFrameSettingsRepository extends JpaRepository<DeckFrameSettings, Long> {
}
```

- [ ] **Step 5: Create the controller**

```java
package io.eregion.render;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/decks/{deckId}/frame-settings")
public class DeckFrameSettingsController {

    private final DeckFrameSettingsRepository repository;
    private final DeckRenderTrigger renderTrigger;

    public DeckFrameSettingsController(DeckFrameSettingsRepository repository, DeckRenderTrigger renderTrigger) {
        this.repository = repository;
        this.renderTrigger = renderTrigger;
    }

    public record FrameSettingsRequest(String artistName, String collectionCode, String frameFamily) {}

    @GetMapping
    public ResponseEntity<DeckFrameSettings> get(@PathVariable Long deckId) {
        return repository.findById(deckId)
            .map(ResponseEntity::ok)
            .orElseGet(() -> ResponseEntity.ok(new DeckFrameSettings(deckId, null, null, "m15")));
    }

    @PutMapping
    public ResponseEntity<DeckFrameSettings> put(@PathVariable Long deckId, @RequestBody FrameSettingsRequest request) {
        DeckFrameSettings settings = new DeckFrameSettings(
            deckId, request.artistName(), request.collectionCode(), request.frameFamily());
        DeckFrameSettings saved = repository.save(settings);
        renderTrigger.rerenderDeck(deckId);
        return ResponseEntity.ok(saved);
    }
}
```

`DeckRenderTrigger` is created in Task 8 — for now, create a placeholder so this compiles:

```java
package io.eregion.render;

import org.springframework.stereotype.Component;

@Component
public class DeckRenderTrigger {
    public void rerenderDeck(Long deckId) {
        // Replaced with real rendering logic in Task 8.
    }
}
```

- [ ] **Step 6: Add the migration**

Check the latest `V*.sql` version number, then create `V<next>__create_deck_frame_settings.sql`:

```sql
CREATE TABLE deck_frame_settings (
    deck_id BIGINT PRIMARY KEY REFERENCES deck(id),
    artist_name VARCHAR(255),
    collection_code VARCHAR(16),
    frame_family VARCHAR(64)
);
```

(Confirm the existing `deck` table's actual name/PK column by checking its migration file before running this — adjust `REFERENCES deck(id)` if it differs.)

- [ ] **Step 7: Run test to verify it passes**

Run: `cd backend && ./mvnw test -Dtest=DeckFrameSettingsControllerTest`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add backend/src/main/java/io/eregion/render/DeckFrameSettings.java \
        backend/src/main/java/io/eregion/render/DeckFrameSettingsRepository.java \
        backend/src/main/java/io/eregion/render/DeckFrameSettingsController.java \
        backend/src/main/java/io/eregion/render/DeckRenderTrigger.java \
        backend/src/test/java/io/eregion/render/DeckFrameSettingsControllerTest.java \
        backend/src/main/resources/db/migration
git commit -m "Add DeckFrameSettings entity, repository, and endpoint"
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

**Files:**
- Create: `backend/src/main/java/io/eregion/render/FrameSelection.java`
- Create: `backend/src/main/java/io/eregion/render/FrameSelector.java`
- Test: `backend/src/test/java/io/eregion/render/FrameSelectorTest.java`

- [ ] **Step 1: Write the failing tests**

```java
package io.eregion.render;

import org.junit.jupiter.api.Test;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class FrameSelectorTest {

    private final FrameSelector selector = new FrameSelector(Set.of("m15"));

    @Test
    void monoColorCreature_selectsColorBorder() {
        FrameSelection selection = selector.select(
            "Creature — Bear", Set.of("G"), "m15", "Grizzly Bears", null);

        assertThat(selection.templateSlot()).isEqualTo("creature");
        assertThat(selection.borderTreatment()).isEqualTo("mono-G");
        assertThat(selection.title()).isEqualTo("Grizzly Bears");
        assertThat(selection.subtitle()).isNull();
    }

    @Test
    void multicolorCard_selectsGoldBorder() {
        FrameSelection selection = selector.select(
            "Creature — Angel", Set.of("W", "U"), "m15", "Alela", null);

        assertThat(selection.borderTreatment()).isEqualTo("multicolor");
    }

    @Test
    void colorlessNonArtifactNonLand_selectsColorlessBorder() {
        FrameSelection selection = selector.select(
            "Creature — Eldrazi", Set.of(), "m15", "Emrakul", null);

        assertThat(selection.borderTreatment()).isEqualTo("colorless");
    }

    @Test
    void artifactType_selectsArtifactBorderRegardlessOfColor() {
        FrameSelection selection = selector.select(
            "Artifact — Equipment", Set.of("R"), "m15", "Sword", null);

        assertThat(selection.templateSlot()).isEqualTo("artifact");
        assertThat(selection.borderTreatment()).isEqualTo("artifact");
    }

    @Test
    void landType_selectsLandTemplate() {
        FrameSelection selection = selector.select(
            "Basic Land — Forest", Set.of(), "m15", "Forest", null);

        assertThat(selection.templateSlot()).isEqualTo("land");
    }

    @Test
    void nicknamePresent_usesNicknameAsTitleAndNameAsSubtitle() {
        FrameSelection selection = selector.select(
            "Creature — Bear", Set.of("G"), "m15", "Grizzly Bears", "Ashcrown the Devourer");

        assertThat(selection.title()).isEqualTo("Ashcrown the Devourer");
        assertThat(selection.subtitle()).isEqualTo("Grizzly Bears");
    }

    @Test
    void familyMissingSlot_fallsBackToDefaultFamily() {
        FrameSelector selectorWithoutFamily = new FrameSelector(Set.of()); // no families support planeswalker

        FrameSelection selection = selectorWithoutFamily.select(
            "Legendary Planeswalker — Jace", Set.of("U"), "nonexistent-family", "Jace", null);

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
        String typeLine, Set<String> colors, String requestedFamily, String name, String nickname
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

    private String resolveBorderTreatment(String typeLine, Set<String> colors) {
        String lower = typeLine.toLowerCase();
        if (lower.contains("land")) return "land";
        if (lower.contains("artifact")) return "artifact";
        if (colors.size() >= 2) return "multicolor";
        if (colors.size() == 1) return "mono-" + colors.iterator().next();
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

**Files:**
- Create: `backend/src/main/resources/frames/m15/` (frame/symbol images)
- Create: `backend/src/main/resources/frames/m15/layout.json`
- Create: `scripts/convert-cardconjurer-layout.mjs` (one-time conversion helper, not part of the running app)

- [ ] **Step 1: Check CardConjurer's license**

Clone or fetch the CardConjurer repository (the open-source project this plan reuses assets from) and read its `LICENSE` file. Confirm it permits bundling/redistributing the asset pack inside this project. If it does not, stop and flag this to the user before proceeding — do not bundle assets under an incompatible license.

- [ ] **Step 2: Copy the M15 frame family assets**

From the CardConjurer repo, copy its M15 frame images (border images per color/border-treatment, per the `borderTreatment` values produced by `FrameSelector`: `mono-W`, `mono-U`, `mono-B`, `mono-R`, `mono-G`, `multicolor`, `colorless`, `artifact`, `land`) and its mana symbol icon set into `backend/src/main/resources/frames/m15/`. Use consistent filenames, e.g. `border-mono-G.png`, `symbol-mana-G.png`, `symbol-mana-generic.png`, etc.

- [ ] **Step 3: Write the layout conversion script**

CardConjurer defines where each layer (art box, title text, mana cost, type line, rules box, P/T box) sits as pixel coordinates in its own JS template data. Write a small Node script that reads that template data and emits our own flat JSON format:

```javascript
// scripts/convert-cardconjurer-layout.mjs
// Usage: node scripts/convert-cardconjurer-layout.mjs <path-to-cardconjurer-template.js> <output-path>
//
// Reads CardConjurer's template layout definition and re-emits it as a flat
// JSON file our Java compositor can load directly, keyed by templateSlot.
import fs from "node:fs";

const [, , inputPath, outputPath] = process.argv;
const raw = fs.readFileSync(inputPath, "utf-8");

// CardConjurer's template file assigns its layout object to a known variable;
// inspect the actual file to find that variable name before writing the
// extraction regex/eval below — this is intentionally left to be filled in
// against the real file, since its exact shape is unknown until Step 1's
// clone happens.
throw new Error("Inspect the cloned CardConjurer template file's structure, then implement extraction here.");
```

- [ ] **Step 4: Run the script against the real CardConjurer template and inspect output**

Run: `node scripts/convert-cardconjurer-layout.mjs <path> backend/src/main/resources/frames/m15/layout.json`

Manually open the resulting `layout.json` and confirm it has one entry per `templateSlot` (`creature`, `land`, `artifact`, `enchantment`, `instant`, `sorcery`, `planeswalker`, `other`) with pixel rectangles for: `artBox`, `titleText`, `manaCostArea`, `typeLineText`, `rulesTextBox`, `ptBox` (creature only), `artistCredit`, `collectorInfo`, `setSymbol`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/resources/frames/m15 scripts/convert-cardconjurer-layout.mjs
git commit -m "Add M15 frame assets and layout data from CardConjurer"
```

---

### Task 6: `CardRender` entity, repository, and image endpoint

**Files:**
- Create: `backend/src/main/java/io/eregion/render/CardRender.java`
- Create: `backend/src/main/java/io/eregion/render/CardRenderRepository.java`
- Create: `backend/src/main/java/io/eregion/render/CardRenderController.java`
- Test: `backend/src/test/java/io/eregion/render/CardRenderControllerTest.java`
- Migration: `backend/src/main/resources/db/migration/V<next>__create_card_render.sql`

- [ ] **Step 1: Write the failing test**

```java
package io.eregion.render;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class CardRenderControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired CardRenderRepository repository;

    @Test
    void getImage_returnsStoredPng() throws Exception {
        byte[] fakePng = new byte[] { (byte) 0x89, 'P', 'N', 'G' };
        CardRender render = new CardRender(1L, fakePng, "hash-123");
        repository.save(render);

        mockMvc.perform(get("/api/cards/1/render/image"))
            .andExpect(status().isOk())
            .andExpect(content().contentType("image/png"))
            .andExpect(content().bytes(fakePng));
    }

    @Test
    void getImage_missingRender_returns404() throws Exception {
        mockMvc.perform(get("/api/cards/999/render/image"))
            .andExpect(status().isNotFound());
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && ./mvnw test -Dtest=CardRenderControllerTest`
Expected: FAIL — `CardRender`/repository/controller don't exist.

- [ ] **Step 3: Create the entity**

```java
package io.eregion.render;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "card_render")
public class CardRender {

    @Id
    private Long cardId;

    @Lob
    private byte[] imageData;

    private String inputsHash;
    private Instant renderedAt;

    protected CardRender() {}

    public CardRender(Long cardId, byte[] imageData, String inputsHash) {
        this.cardId = cardId;
        this.imageData = imageData;
        this.inputsHash = inputsHash;
        this.renderedAt = Instant.now();
    }

    public Long getCardId() { return cardId; }
    public byte[] getImageData() { return imageData; }
    public String getInputsHash() { return inputsHash; }
    public Instant getRenderedAt() { return renderedAt; }
}
```

- [ ] **Step 4: Create the repository**

```java
package io.eregion.render;

import org.springframework.data.jpa.repository.JpaRepository;

public interface CardRenderRepository extends JpaRepository<CardRender, Long> {
}
```

- [ ] **Step 5: Create the controller**

```java
package io.eregion.render;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/cards/{cardId}/render")
public class CardRenderController {

    private final CardRenderRepository repository;
    private final CardRenderService renderService;

    public CardRenderController(CardRenderRepository repository, CardRenderService renderService) {
        this.repository = repository;
        this.renderService = renderService;
    }

    @GetMapping("/image")
    public ResponseEntity<byte[]> getImage(@PathVariable Long cardId) {
        return repository.findById(cardId)
            .map(render -> ResponseEntity.ok()
                .contentType(MediaType.IMAGE_PNG)
                .body(render.getImageData()))
            .orElseGet(() -> ResponseEntity.status(HttpStatus.NOT_FOUND).build());
    }

    @PostMapping
    public ResponseEntity<Void> renderNow(@PathVariable Long cardId) {
        renderService.render(cardId);
        return ResponseEntity.ok().build();
    }
}
```

`CardRenderService` is implemented in Task 7 — create a minimal stub now so this compiles:

```java
package io.eregion.render;

import org.springframework.stereotype.Service;

@Service
public class CardRenderService {
    public void render(Long cardId) {
        // Replaced with real compositing logic in Task 7.
    }
}
```

- [ ] **Step 6: Add the migration**

```sql
CREATE TABLE card_render (
    card_id BIGINT PRIMARY KEY REFERENCES card(id),
    image_data BYTEA,
    inputs_hash VARCHAR(64),
    rendered_at TIMESTAMP
);
```

(Confirm the real `card` table/PK name and adjust the `REFERENCES` clause and `BYTEA` type to match the project's actual DB — check an existing migration for the dialect in use, e.g. Postgres vs. H2, since `BYTEA` is Postgres-specific; use `BLOB` if the project targets H2/MySQL instead.)

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd backend && ./mvnw test -Dtest=CardRenderControllerTest`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add backend/src/main/java/io/eregion/render/CardRender.java \
        backend/src/main/java/io/eregion/render/CardRenderRepository.java \
        backend/src/main/java/io/eregion/render/CardRenderController.java \
        backend/src/main/java/io/eregion/render/CardRenderService.java \
        backend/src/test/java/io/eregion/render/CardRenderControllerTest.java \
        backend/src/main/resources/db/migration
git commit -m "Add CardRender entity, repository, and image endpoint"
```

---

### Task 7: Implement `CardRenderService` compositing

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
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
class CardRenderServiceTest {

    @Autowired CardRenderService service;
    @Autowired CardRenderRepository renderRepository;
    @Autowired CardRepository cardRepository;

    @Test
    void render_producesNonEmptyPngOfExpectedSize() throws Exception {
        Card card = new Card();
        card.setName("Grizzly Bears");
        card.setTypeLine("Creature — Bear");
        card.setColors(Set.of("G"));
        card.setPower("2");
        card.setToughness("2");
        card = cardRepository.save(card);

        service.render(card.getId());

        CardRender render = renderRepository.findById(card.getId()).orElseThrow();
        assertThat(render.getImageData()).isNotEmpty();

        BufferedImage image = ImageIO.read(new ByteArrayInputStream(render.getImageData()));
        assertThat(image.getWidth()).isEqualTo(FrameLayout.CARD_WIDTH);
        assertThat(image.getHeight()).isEqualTo(FrameLayout.CARD_HEIGHT);
    }
}
```

(Adjust the `Card` setters used here to match whatever actually exists on `Card` — `setColors`, `setTypeLine`, `setName` are assumed from the fields already confirmed present in the spec's research; verify exact method names against `Card.java` before running this step.)

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

(`CARD_WIDTH`/`CARD_HEIGHT` must match whatever canvas size the Task 5 `layout.json` was authored against — confirm against that file and adjust these constants if different.)

- [ ] **Step 4: Implement `FrameLayoutLoader`**

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
                    rect.get("x").asInt(), rect.get("y").asInt(),
                    rect.get("width").asInt(), rect.get("height").asInt()));
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

@Service
public class CardRenderService {

    private final CardRepository cardRepository;
    private final CardRenderRepository renderRepository;
    private final FrameSelector frameSelector;
    private final FrameLayoutLoader layoutLoader;

    public CardRenderService(
        CardRepository cardRepository,
        CardRenderRepository renderRepository,
        FrameSelector frameSelector,
        FrameLayoutLoader layoutLoader
    ) {
        this.cardRepository = cardRepository;
        this.renderRepository = renderRepository;
        this.frameSelector = frameSelector;
        this.layoutLoader = layoutLoader;
    }

    public void render(Long cardId) {
        Card card = cardRepository.findById(cardId)
            .orElseThrow(() -> new IllegalArgumentException("No card with id " + cardId));

        FrameSelection selection = frameSelector.select(
            card.getTypeLine(), card.getColors(), "m15", card.getName(), null);

        FrameLayout layout = layoutLoader.load(selection.frameFamily(), selection.templateSlot());

        try {
            BufferedImage canvas = new BufferedImage(
                FrameLayout.CARD_WIDTH, FrameLayout.CARD_HEIGHT, BufferedImage.TYPE_INT_ARGB);
            Graphics2D g = canvas.createGraphics();
            g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);

            drawArt(g, layout);
            drawFrameBorder(g, selection);
            drawText(g, layout, selection, card);

            g.dispose();

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            ImageIO.write(canvas, "png", out);

            CardRender render = new CardRender(cardId, out.toByteArray(), inputsHash(card, selection));
            renderRepository.save(render);
        } catch (IOException e) {
            throw new IllegalStateException("Failed to render card " + cardId, e);
        }
    }

    private void drawArt(Graphics2D g, FrameLayout layout) {
        // Art source wiring (loading the uploaded custom-printing blob) is
        // deferred to Task 8, where the real art byte source is available
        // from the trigger call site. For now this draws a gray placeholder
        // rectangle so the pipeline is exercisable end-to-end.
        Rectangle artBox = layout.region("artBox");
        g.setColor(Color.GRAY);
        g.fillRect(artBox.x, artBox.y, artBox.width, artBox.height);
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

    private void drawText(Graphics2D g, FrameLayout layout, FrameSelection selection, Card card) {
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
        g.drawString(card.getTypeLine(), typeLineBox.x, typeLineBox.y + typeLineBox.height);

        if (card.getPower() != null && card.getToughness() != null) {
            Rectangle ptBox = layout.region("ptBox");
            g.setFont(new Font("Serif", Font.BOLD, 40));
            g.drawString(card.getPower() + "/" + card.getToughness(), ptBox.x, ptBox.y + ptBox.height);
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
            (card.getName() + selection.frameFamily() + selection.templateSlot() + selection.borderTreatment()).hashCode());
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

**Files:**
- Modify: `backend/src/main/java/io/eregion/custom/CustomPrintingController.java` (locate the existing art upload endpoint)
- Modify: `backend/src/main/java/io/eregion/proxy/ProxyService.java` (locate the existing nickname-save path)
- Modify: `backend/src/main/java/io/eregion/render/DeckRenderTrigger.java`
- Modify: `backend/src/main/java/io/eregion/render/CardRenderService.java` (wire real art bytes in, replacing the Task 7 placeholder)
- Test: `backend/src/test/java/io/eregion/render/DeckRenderTriggerTest.java`

- [ ] **Step 1: Pass real art bytes into `CardRenderService.render`**

Change the signature so callers can supply art bytes directly instead of the service reaching for them itself (keeps `CardRenderService` decoupled from `CustomPrintingController`'s storage details):

```java
public void render(Long cardId, byte[] artBytes) {
    // ... existing body, but drawArt(g, layout) becomes:
    drawArt(g, layout, artBytes);
}

private void drawArt(Graphics2D g, FrameLayout layout, byte[] artBytes) throws IOException {
    Rectangle artBox = layout.region("artBox");
    BufferedImage art = ImageIO.read(new java.io.ByteArrayInputStream(artBytes));
    g.drawImage(art, artBox.x, artBox.y, artBox.width, artBox.height, null);
}
```

Update `CardRenderServiceTest` (Task 7) to pass a small in-memory PNG as `artBytes` instead of relying on the removed no-arg `render(cardId)` — e.g. generate a 10x10 `BufferedImage`, write it to a `ByteArrayOutputStream`, and pass `.toByteArray()`.

Update `CardRenderController.renderNow` (Task 6) to fetch art bytes from wherever `CustomPrintingController` stores them before calling `renderService.render(cardId, artBytes)` — read `CustomPrintingController` first to find the right repository/method to reuse.

- [ ] **Step 2: Trigger render on art upload**

In `CustomPrintingController`, find the existing upload endpoint method body. After it persists the uploaded art successfully, add a call to re-render that card:

```java
cardRenderService.render(cardId, uploadedBytes);
```

(`uploadedBytes` and `cardId` should already be in scope as the method's existing parameters/locals — read the method first to confirm their actual names and wire the call using those, rather than the placeholder names shown here.) Inject `CardRenderService` into the controller's constructor alongside its existing dependencies.

- [ ] **Step 3: Trigger render on nickname save**

In `ProxyService`, find the method that saves a nickname (from the spec's research: the `Draft`/`Treatment` save path). After the nickname is persisted, fetch the card's current art bytes (same lookup used in Step 2) and call `cardRenderService.render(cardId, artBytes)`. If no art has been uploaded yet for that card, skip the render call — there's nothing to composite yet.

- [ ] **Step 4: Write the failing test for deck-wide re-render**

```java
package io.eregion.render;

import io.eregion.card.Card;
import io.eregion.card.CardRepository;
import io.eregion.deck.Deck;
import io.eregion.deck.DeckRepository;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.times;

@SpringBootTest
class DeckRenderTriggerTest {

    @Autowired DeckRenderTrigger trigger;
    @Autowired DeckRepository deckRepository;
    @Autowired CardRepository cardRepository;
    @MockBean CardRenderService cardRenderService;

    @Test
    void rerenderDeck_rendersEveryCardInDeck() {
        Deck deck = deckRepository.save(new Deck("Test Deck"));
        Card cardA = cardRepository.save(new Card("Card A"));
        Card cardB = cardRepository.save(new Card("Card B"));
        // Wire cardA/cardB into deck per however deck<->card membership
        // actually works in this codebase — inspect DeckRepository/Deck
        // before finalizing this setup; the exact association API is not
        // confirmed by the spec's research and must be checked here.

        trigger.rerenderDeck(deck.getId());

        verify(cardRenderService, times(1)).render(eq(cardA.getId()), any());
        verify(cardRenderService, times(1)).render(eq(cardB.getId()), any());
    }
}
```

- [ ] **Step 5: Run test to verify it fails**

Run: `cd backend && ./mvnw test -Dtest=DeckRenderTriggerTest`
Expected: FAIL — `DeckRenderTrigger.rerenderDeck` is currently a no-op.

- [ ] **Step 6: Implement `DeckRenderTrigger.rerenderDeck`**

```java
package io.eregion.render;

import io.eregion.card.Card;
import io.eregion.card.CardRepository;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class DeckRenderTrigger {

    private final CardRepository cardRepository; // or deck-membership lookup, per Step 4's finding
    private final CardRenderService cardRenderService;
    private final ArtLookup artLookup; // small helper wrapping the art-byte lookup from Step 1/2

    public DeckRenderTrigger(CardRepository cardRepository, CardRenderService cardRenderService, ArtLookup artLookup) {
        this.cardRepository = cardRepository;
        this.cardRenderService = cardRenderService;
        this.artLookup = artLookup;
    }

    public void rerenderDeck(Long deckId) {
        List<Card> cards = cardRepository.findAllByDeckId(deckId); // adjust to the real query method found in Step 4
        for (Card card : cards) {
            byte[] artBytes = artLookup.findArtBytes(card.getId());
            if (artBytes != null) {
                cardRenderService.render(card.getId(), artBytes);
            }
        }
    }
}
```

Create the small `ArtLookup` helper referenced above, wrapping whatever repository/method Step 2 used to fetch art bytes by card id, so this logic isn't duplicated across `CustomPrintingController`, `ProxyService`, and `DeckRenderTrigger`:

```java
package io.eregion.render;

import org.springframework.stereotype.Component;

@Component
public class ArtLookup {
    // Constructor-inject whatever repository Step 2 used to fetch stored art
    // bytes by card id, and expose that lookup here.
    public byte[] findArtBytes(Long cardId) {
        throw new UnsupportedOperationException("Wire this to the real art-storage repository found in Task 8 Step 2");
    }
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd backend && ./mvnw test -Dtest=DeckRenderTriggerTest`
Expected: PASS

- [ ] **Step 8: Add failure resilience**

In `CardRenderService.render`, wrap the compositing body in a try/catch that logs on failure without deleting any existing `CardRender` row:

```java
public void render(Long cardId, byte[] artBytes) {
    try {
        // existing body from Task 7 Step 5
    } catch (Exception e) {
        LOGGER.error("Failed to render card {}; keeping previous render if any", cardId, e);
    }
}
```

Add a `private static final Logger LOGGER = LoggerFactory.getLogger(CardRenderService.class);` field and the corresponding import.

- [ ] **Step 9: Commit**

```bash
git add backend/src/main/java/io/eregion/custom/CustomPrintingController.java \
        backend/src/main/java/io/eregion/proxy/ProxyService.java \
        backend/src/main/java/io/eregion/render/DeckRenderTrigger.java \
        backend/src/main/java/io/eregion/render/ArtLookup.java \
        backend/src/main/java/io/eregion/render/CardRenderService.java \
        backend/src/test/java/io/eregion/render/DeckRenderTriggerTest.java \
        backend/src/test/java/io/eregion/render/CardRenderServiceTest.java
git commit -m "Trigger card renders on art upload, nickname save, and deck setting save"
```

---

### Task 9: Frontend displays composited render with fallback

**Files:**
- Modify: `frontend/src/components/builder/DeckBuilder.tsx`
- Modify: `frontend/src/components/builder/ProxyPanel.tsx`
- Modify: `frontend/src/lib/links.ts`

- [ ] **Step 1: Add a render-image URL helper**

In `frontend/src/lib/links.ts`, alongside the existing `customArtUrl` helper, add:

```typescript
export function cardRenderUrl(cardId: string): string {
  return `/api/cards/${cardId}/render/image`;
}
```

- [ ] **Step 2: Swap the displayed image with fallback**

In both `DeckBuilder.tsx` (around the existing `customArtUrl`/`imageNormal` usage found during Task 1's spec research, near lines 84-86 and 596-599) and `ProxyPanel.tsx`, change the `<img>` `src` to try the render endpoint first, falling back to the existing art/Scryfall image on load error:

```tsx
<img
  src={cardRenderUrl(card.id)}
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

    verify(cardRenderService, times(1)).render(eq(cardId), any());
}
```

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
