# Deck Backdrop Art Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed placeholder image behind the deck header with art the owner chooses: the commander's art (default) or an Art Series card. Visitors see the same backdrop on the public page.

**Architecture:**
- **Storage:** a deck with no row in `deck_backdrops` shows its commander's art, which needs nothing stored. Choosing an Art Series card stores its Scryfall id, name, artist, set and art URL.
- **Search:** Art Series cards are not in the local catalog, so the API searches Scryfall (`layout:art-series`) through the existing `ScryfallClient`. Results are kept in memory for six hours, so repeated searches stay off Scryfall.
- **Choosing:** the API looks the card up by id again rather than trusting a URL from the browser.
- **Rendering:** one `DeckBackdrop` component draws the art on both pages, fading its edges into the page with a CSS mask.

**Tech Stack:** Spring Boot 4 + JdbcClient + Flyway, `ScryfallClient` (RestClient with throttling and a User-Agent), Next.js 16 + Tailwind v4, JUnit 5 + Testcontainers.

---

## File structure

- Create `backend/src/main/resources/db/migration/V28_15__deck_backdrops.sql`.
- Create `backend/src/main/java/io/eregion/deck/BackdropRepository.java`: read, save, clear one deck's choice.
- Create `backend/src/main/java/io/eregion/deck/ArtSeries.java`: search and look up Art Series cards on Scryfall, with the cache.
- Create `backend/src/main/java/io/eregion/deck/BackdropController.java`: the four endpoints.
- Modify `backend/src/main/java/io/eregion/explore/ExploreController.java`: the public deck carries its backdrop.
- Tests: `backend/src/test/java/io/eregion/deck/BackdropRepositoryTest.java`, `ArtSeriesTest.java`.
- Create `frontend/src/lib/backdrop.ts`: types and calls.
- Create `frontend/src/components/DeckBackdrop.tsx`: draws and fades the art.
- Create `frontend/src/components/builder/BackdropDialog.tsx`: the owner's picker.
- Modify `frontend/src/components/builder/DeckBuilder.tsx`, `frontend/src/app/explore/[id]/page.tsx`, `frontend/src/lib/types.ts`.

---

### Task 1: Storage

- [ ] **Step 1: Migration** `V28_15__deck_backdrops.sql`

```sql
-- The art behind a deck's header, when the owner chose an Art Series card. No row: the commander's art is shown.
CREATE TABLE deck_backdrops (
    deck_id     uuid PRIMARY KEY REFERENCES decks (id) ON DELETE CASCADE,
    scryfall_id uuid NOT NULL,
    name        text NOT NULL,
    artist      text,
    set_name    text,
    art_url     text NOT NULL,
    chosen_at   timestamptz NOT NULL DEFAULT now()
);
```

- [ ] **Step 2: Failing test** `BackdropRepositoryTest`

```java
package io.eregion.deck;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;

import org.junit.jupiter.api.Test;

import io.eregion.support.PostgresTest;

class BackdropRepositoryTest extends PostgresTest {

	private static UUID deck() {
		UUID owner = jdbc.sql("INSERT INTO users (email, password_hash, display_name) VALUES (:e, 'x', 'x') RETURNING id")
				.param("e", "backdrop-" + UUID.randomUUID() + "@example.com").query(UUID.class).single();
		return jdbc.sql("INSERT INTO decks (owner_id, name) VALUES (:o, 'Backdrop deck') RETURNING id").param("o", owner).query(UUID.class).single();
	}

	@Test
	void aDeckShowsItsCommanderUntilTheOwnerChoosesArt() {
		BackdropRepository backdrops = new BackdropRepository(jdbc);
		UUID deck = deck();
		assertThat(backdrops.find(deck)).isEmpty();

		var art = new BackdropRepository.Backdrop(UUID.randomUUID(), "Wurmcoil Engine", "Raymond Swanland", "Scars Art Series", "https://cards.scryfall.io/art_crop/front/a/b/x.jpg");
		backdrops.save(deck, art);
		assertThat(backdrops.find(deck)).contains(art);

		var other = new BackdropRepository.Backdrop(UUID.randomUUID(), "Sol Ring", null, null, "https://cards.scryfall.io/art_crop/front/c/d/y.jpg");
		backdrops.save(deck, other);
		assertThat(backdrops.find(deck)).contains(other);

		backdrops.clear(deck);
		assertThat(backdrops.find(deck)).isEmpty();
	}
}
```

Check the real columns of `decks` before running: if `INSERT INTO decks (owner_id, name)` fails on a NOT NULL column, add that column to the insert.

- [ ] **Step 3: Implement** `BackdropRepository`

```java
package io.eregion.deck;

import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** The art a deck's owner chose for behind its header. None stored means the commander's art. */
@Repository
public class BackdropRepository {

	public record Backdrop(UUID scryfallId, String name, String artist, String setName, String artUrl) {
	}

	private final JdbcClient jdbc;

	public BackdropRepository(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	public Optional<Backdrop> find(UUID deckId) {
		return jdbc.sql("SELECT scryfall_id, name, artist, set_name, art_url FROM deck_backdrops WHERE deck_id = :d")
				.param("d", deckId)
				.query((rs, n) -> new Backdrop(rs.getObject(1, UUID.class), rs.getString(2), rs.getString(3), rs.getString(4), rs.getString(5)))
				.optional();
	}

	public void save(UUID deckId, Backdrop art) {
		jdbc.sql("""
				INSERT INTO deck_backdrops (deck_id, scryfall_id, name, artist, set_name, art_url) VALUES (:d, :s, :n, :a, :set, :u)
				ON CONFLICT (deck_id) DO UPDATE SET scryfall_id = :s, name = :n, artist = :a, set_name = :set, art_url = :u, chosen_at = now()
				""").param("d", deckId).param("s", art.scryfallId()).param("n", art.name()).param("a", art.artist())
				.param("set", art.setName()).param("u", art.artUrl()).update();
	}

	public void clear(UUID deckId) {
		jdbc.sql("DELETE FROM deck_backdrops WHERE deck_id = :d").param("d", deckId).update();
	}
}
```

- [ ] **Step 4:** `./mvnw -q test -Dtest=BackdropRepositoryTest` → PASS. Commit `Backdrop: store the art a deck's owner chose`.

### Task 2: Art Series cards from Scryfall

- [ ] **Step 1: Failing test** `ArtSeriesTest` (pure: mapping and query cleaning, no network)

```java
package io.eregion.deck;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import io.eregion.card.ScryfallCard;

class ArtSeriesTest {

	private static ScryfallCard card(String setName, ScryfallCard.ImageUris faceImages) {
		var face = new ScryfallCard.Face("Wurmcoil Engine", null, "Card", null, "Raymond Swanland", faceImages, null, null);
		return new ScryfallCard(UUID.randomUUID().toString(), "Wurmcoil Engine // Wurmcoil Engine", null, 0.0, "Card // Card", List.of(), List.of(), null,
				"aso", setName, "12", "2021-01-01", "common", "Raymond Swanland", null, null, List.of(face, face), null, null, null);
	}

	@Test
	void anArtSeriesCardBecomesABackdrop() {
		var art = ArtSeries.toBackdrop(card("Scars of Mirrodin Art Series", new ScryfallCard.ImageUris("s", "n", "https://cards.scryfall.io/art_crop/x.jpg")));
		assertThat(art).isPresent();
		assertThat(art.get().name()).isEqualTo("Wurmcoil Engine");
		assertThat(art.get().artUrl()).isEqualTo("https://cards.scryfall.io/art_crop/x.jpg");
	}

	@Test
	void otherCardsAndCardsWithoutArtAreRefused() {
		assertThat(ArtSeries.toBackdrop(card("Scars of Mirrodin", new ScryfallCard.ImageUris("s", "n", "https://cards.scryfall.io/art_crop/x.jpg")))).isEmpty();
		assertThat(ArtSeries.toBackdrop(card("Scars of Mirrodin Art Series", null))).isEmpty();
	}

	@Test
	void searchTextIsCleanedBeforeItReachesScryfall() {
		assertThat(ArtSeries.query("  Wurmcoil \"Engine\"  ")).isEqualTo("layout:art-series name:\"Wurmcoil Engine\"");
		assertThat(ArtSeries.query("a")).isNull();
	}
}
```

- [ ] **Step 2: Implement** `ArtSeries`

```java
package io.eregion.deck;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Service;

import io.eregion.card.ScryfallCard;
import io.eregion.card.ScryfallClient;
import io.eregion.deck.BackdropRepository.Backdrop;

/**
 * Art Series cards, searched on Scryfall: they are left out of the local catalog because they are not playable. Results are
 * kept for a few hours so the same search does not reach Scryfall again.
 */
@Service
public class ArtSeries {

	private static final Duration KEEP = Duration.ofHours(6);
	private static final int MAX_KEPT = 300;
	private static final int MAX_RESULTS = 30;

	private record Kept(List<Backdrop> found, Instant until) {
	}

	private final ScryfallClient scryfall;
	private final Map<String, Kept> kept = new ConcurrentHashMap<>();

	public ArtSeries(ScryfallClient scryfall) {
		this.scryfall = scryfall;
	}

	/** Art Series cards whose name contains the text, newest sets first in Scryfall's order. Too short a text finds nothing. */
	public List<Backdrop> search(String text) {
		String q = query(text);
		if (q == null) {
			return List.of();
		}
		Kept hit = kept.get(q);
		if (hit != null && hit.until().isAfter(Instant.now())) {
			return hit.found();
		}
		List<Backdrop> found = scryfall.search(q, MAX_RESULTS).stream().map(ArtSeries::toBackdrop).flatMap(Optional::stream).toList();
		if (kept.size() >= MAX_KEPT) {
			kept.clear();
		}
		kept.put(q, new Kept(found, Instant.now().plus(KEEP)));
		return found;
	}

	/** Looks one card up again by its id, so a chosen backdrop is always a real Art Series card's art. */
	public Optional<Backdrop> byId(UUID scryfallId) {
		return scryfall.collectionByIds(List.of(scryfallId)).data().stream().findFirst().flatMap(ArtSeries::toBackdrop);
	}

	static Optional<Backdrop> toBackdrop(ScryfallCard card) {
		if (card == null || card.set_name() == null || !card.set_name().endsWith("Art Series")) {
			return Optional.empty();
		}
		ScryfallCard.Face face = card.card_faces() == null || card.card_faces().isEmpty() ? null : card.card_faces().get(0);
		ScryfallCard.ImageUris images = face != null && face.image_uris() != null ? face.image_uris() : card.image_uris();
		if (images == null || images.art_crop() == null || !images.art_crop().startsWith("https://cards.scryfall.io/")) {
			return Optional.empty();
		}
		String name = face != null && face.name() != null ? face.name() : card.name();
		String artist = face != null && face.artist() != null ? face.artist() : card.artist();
		return Optional.of(new Backdrop(UUID.fromString(card.id()), name, artist, card.set_name(), images.art_crop()));
	}

	/** Scryfall's query for a name, with quotes removed and spaces tidied; null when the text is under two letters. */
	static String query(String text) {
		String clean = text == null ? "" : text.replace("\"", "").replaceAll("\\s+", " ").trim();
		if (clean.length() < 2) {
			return null;
		}
		if (clean.length() > 60) {
			clean = clean.substring(0, 60);
		}
		return "layout:art-series name:\"" + clean + "\"";
	}
}
```

- [ ] **Step 3:** `./mvnw -q test -Dtest=ArtSeriesTest` → PASS. Commit `Backdrop: find Art Series cards on Scryfall`.

### Task 3: Endpoints and the public page data

- [ ] **Step 1: Implement** `BackdropController`

```java
package io.eregion.deck;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import io.eregion.auth.CurrentUser;
import io.eregion.common.ApiException;
import io.eregion.deck.BackdropRepository.Backdrop;
import io.eregion.ratelimit.RateLimits;

/** The art behind a deck's header: the commander's by default, or an Art Series card its owner chose. */
@RestController
public class BackdropController {

	public record Choice(Backdrop backdrop) {
	}

	public record ChooseRequest(UUID scryfallId) {
	}

	private final BackdropRepository backdrops;
	private final ArtSeries artSeries;
	private final DeckRepository decks;
	private final RateLimits limits;

	public BackdropController(BackdropRepository backdrops, ArtSeries artSeries, DeckRepository decks, RateLimits limits) {
		this.backdrops = backdrops;
		this.artSeries = artSeries;
		this.decks = decks;
		this.limits = limits;
	}

	@GetMapping("/api/art-series")
	public List<Backdrop> search(@AuthenticationPrincipal Jwt jwt, @RequestParam("q") String q) {
		limits.search(CurrentUser.id(jwt));
		return artSeries.search(q);
	}

	@GetMapping("/api/decks/{deckId}/backdrop")
	public Choice get(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID deckId) {
		owned(deckId, CurrentUser.id(jwt));
		return new Choice(backdrops.find(deckId).orElse(null));
	}

	@PutMapping("/api/decks/{deckId}/backdrop")
	public Choice choose(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID deckId, @RequestBody ChooseRequest request) {
		UUID user = CurrentUser.id(jwt);
		owned(deckId, user);
		limits.search(user);
		if (request.scryfallId() == null) {
			throw ApiException.badRequest("Choose an Art Series card");
		}
		Backdrop art = artSeries.byId(request.scryfallId()).orElseThrow(() -> ApiException.badRequest("That is not an Art Series card"));
		backdrops.save(deckId, art);
		return new Choice(art);
	}

	@DeleteMapping("/api/decks/{deckId}/backdrop")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void useCommander(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID deckId) {
		owned(deckId, CurrentUser.id(jwt));
		backdrops.clear(deckId);
	}

	private void owned(UUID deckId, UUID userId) {
		decks.findOwned(deckId, userId).orElseThrow(() -> ApiException.notFound("Deck"));
	}
}
```

- [ ] **Step 2: Public page data.** In `ExploreController`:
  - Change `PublicDeckDetail` to `PublicDeckDetail(PublicDeck deck, List<DeckCardLine> cards, DeckStats stats, BackdropRepository.Backdrop backdrop)`.
  - Inject `BackdropRepository`.
  - Build it with `backdrops.find(published.deck().id()).orElse(null)`.
  - Update every other `new PublicDeckDetail(` and the controller's constructor callers in tests (`grep -rn "new ExploreController(\|new PublicDeckDetail(" src`).
- [ ] **Step 3:** Run the full suite with `./mvnw -q test`. Expect 0 failures in `target/surefire-reports`. Commit `Backdrop: choose one, search Art Series, show it publicly`.

### Task 4: Frontend

- [ ] **Step 1:** `frontend/src/lib/backdrop.ts`

```ts
import { api } from "./api";

/** An Art Series card chosen to sit behind a deck's header. */
export interface Backdrop {
  scryfallId: string;
  name: string;
  artist: string | null;
  setName: string | null;
  artUrl: string;
}

export const searchArtSeries = (q: string) => api<Backdrop[]>(`/api/art-series?q=${encodeURIComponent(q)}`);
export const deckBackdrop = (deckId: string) => api<{ backdrop: Backdrop | null }>(`/api/decks/${deckId}/backdrop`);
export const chooseBackdrop = (deckId: string, scryfallId: string) =>
  api<{ backdrop: Backdrop }>(`/api/decks/${deckId}/backdrop`, { method: "PUT", body: { scryfallId } });
export const useCommanderArt = (deckId: string) => api<void>(`/api/decks/${deckId}/backdrop`, { method: "DELETE" });
```

  In `types.ts`, `PublicDeckDetail` gains `backdrop?: Backdrop | null` (import the type).

- [ ] **Step 2:** `frontend/src/components/DeckBackdrop.tsx`

```tsx
/* eslint-disable @next/next/no-img-element */

/**
 * The art behind a deck's header, faded into the page on its left and bottom edges so the title stays readable. Decorative:
 * the deck's title says what it is. Hidden on small screens, where the header has no room beside the art.
 */
export function DeckBackdrop({ url }: { url: string | null }) {
  if (!url) return null;
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 z-0 hidden h-[620px] overflow-hidden md:block">
      <img
        src={url}
        alt=""
        className="absolute top-0 right-0 h-full w-[72%] object-cover object-[50%_30%] opacity-60 select-none"
        style={{
          maskImage: "linear-gradient(to right, transparent 0%, black 45%), linear-gradient(to bottom, black 45%, transparent 100%)",
          maskComposite: "intersect",
          WebkitMaskImage: "linear-gradient(to right, transparent 0%, black 45%), linear-gradient(to bottom, black 45%, transparent 100%)",
          WebkitMaskComposite: "source-in",
        }}
      />
    </div>
  );
}
```

- [ ] **Step 3:** `frontend/src/components/builder/BackdropDialog.tsx`: a `Dialog` with:
  - a radio for "Commander art" and one for "Art Series card";
  - a search field (`literalInput` is not available on this branch's committed code, so use `autoCapitalize="none" autoCorrect="off" spellCheck={false}`);
  - results as a grid of buttons showing the art (`<img>`) with name and set below.

  Choosing a result calls `chooseBackdrop`, choosing Commander art calls `useCommanderArt`, and both then call `onChanged(backdrop | null)` and close. Searching waits 300 ms after typing and shows "Searching", "Nothing found" or the error message from `ApiError`.

- [ ] **Step 4:** `DeckBuilder.tsx`:
  - Load the choice with `deckBackdrop(deck.id)` in an effect into `backdrop` state.
  - Replace the `art-clip` block (the `/art/nobg-knight.png` image) with `<DeckBackdrop url={backdrop?.artUrl ?? commanderArt} />`, where `commanderArt` is the commander line's `imageArtCrop`.
  - Add a header pill "Backdrop" beside "Add description" that opens `BackdropDialog`.

- [ ] **Step 5:** `explore/[id]/page.tsx`:
  - Make `<main>` relative.
  - Render `<DeckBackdrop url={detail.backdrop?.artUrl ?? detail.deck.artUrl} />` first inside it.
  - Make the header wrapper `relative z-10`.
- [ ] **Step 6:** `npx tsc --noEmit -p . && npm test` → clean.

### Task 5: Check it in the running app, then commit

- [ ] **Step 1:** Restart the backend (migration) and clear the local login counters. Then, as the gate-check account:
  1. Open the Imported deck: the backdrop shows the commander art, or nothing if there's no commander.
  2. Open Backdrop and search "Wurmcoil": results appear.
  3. Choose one: the header art changes, and the API returns it on reload.
  4. Make the deck public: its public page shows the same art.
  5. Choose Commander art: the row is gone.
  6. Put the deck back to private.
- [ ] **Step 2:** Commit `Backdrop: commander art or an Art Series card behind the deck`.
