# Proxy Creator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-deck lore plus per-card proxy treatments (nickname or reskin) that produce Midjourney prompts through the player's DeepSeek key, with history, refine, and a batch queue.

**Architecture:** New backend package `io.eregion.proxy` (repository on `JdbcClient`, prompt service, orchestration service, controller) behind an `LlmClient` interface with a DeepSeek implementation. Treatments hang off `(deck, card)`, not off versions. The frontend adds a card panel, a "Proxies" section under Statistics, and a browser-driven batch queue (about 3 requests in flight).

**Tech Stack:** Spring Boot 4 / Java 25 / Jackson 3 (`tools.jackson`) / JdbcClient / Flyway; Next.js 16, node:test for pure frontend logic. Backend tests are plain unit tests with fakes (subclass a repository with `super(null)`), as in `CardResolveServiceTest`. No test calls DeepSeek.

**Spec:** `docs/superpowers/specs/2026-10-27-proxy-creator-design.md`.

**Decisions that settle the spec's open details**
- No separate few-shot examples. The confirmed designs already live inside the lore text, which is sent whole on every request.
- Model: `deepseek-chat`, JSON mode (`response_format: {"type": "json_object"}`), endpoint `https://api.deepseek.com/chat/completions`. All three overridable by env.
- `character` is stored as JSON text (`character_json TEXT`), not `jsonb`, so `JdbcClient` needs no type handling.

**Commit rule:** commits go under the user's identity only. No `Co-Authored-By` or "Generated with" lines (saved user preference).

**Tests to run in this repo**
- Backend: `cd backend && ./mvnw -q test -Dtest=<Class>`
- Frontend logic: `cd frontend && node --test src/lib/<file>.test.ts`
- Frontend types: `cd frontend && npm run typecheck`

---

## File structure

Backend, all under `backend/src/main/java/io/eregion/proxy/` unless noted:

| File | Responsibility |
|---|---|
| `db/migration/V19__proxy_treatments.sql` (resources) | Tables and deck columns |
| `LlmClient.java` | One-method interface: `String complete(String system, String user)` |
| `DeepSeekClient.java` | HTTP implementation of `LlmClient`, key from env |
| `ProxyDtos.java` | All records the API and the services pass around |
| `ProxyPromptService.java` | Builds the model request, parses and validates the reply, retries once |
| `resources/proxy-rules.md` | System prompt: the prompt-building rules, editable without code |
| `ProxyRepository.java` | All SQL for treatments, generations, lore |
| `ProxyService.java` | Ownership, context gathering, calls the prompt service, saves |
| `ProxyController.java` | The endpoints |
| `ratelimit/RateLimits.java`, `RateLimitProperties.java` | New `proxy` limit |

Tests under `backend/src/test/java/io/eregion/proxy/`: `ProxyPromptServiceTest`, `ProxyServiceTest`.

Frontend:

| File | Responsibility |
|---|---|
| `lib/types.ts` | New types appended |
| `lib/proxy.ts` + `lib/proxy.test.ts` | Pure logic: `runBatch` queue, `copyText` |
| `lib/useProxies.ts` | Loads and mutates proxies for a deck |
| `components/builder/ProxyPanel.tsx` | Per-card panel: mode, generate, refine, history, copy |
| `components/builder/ProxiesSection.tsx` | Lore editor, card list with status, batch generate |
| `components/builder/CardMenu.tsx`, `DeckBuilder.tsx` | Wire the "Proxy" menu item and mount the section |

---

## Task 1: Migration

**Files:**
- Create: `backend/src/main/resources/db/migration/V19__proxy_treatments.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Proxy creator. The lore belongs to the deck. A treatment is one card's proxy in one deck, and survives every version.
-- Each generation is kept, and the treatment points at the one the player picked.
ALTER TABLE decks
    ADD COLUMN lore      TEXT,
    ADD COLUMN mj_params TEXT;

CREATE TABLE proxy_treatments (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deck_id               UUID        NOT NULL REFERENCES decks (id) ON DELETE CASCADE,
    card_id               UUID        NOT NULL REFERENCES cards (id),
    mode                  TEXT        NOT NULL,
    current_generation_id UUID,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT proxy_treatments_mode_chk CHECK (mode IN ('NICKNAME', 'RESKIN')),
    CONSTRAINT proxy_treatments_one_per_card UNIQUE (deck_id, card_id)
);

CREATE TABLE proxy_generations (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    treatment_id   UUID        NOT NULL REFERENCES proxy_treatments (id) ON DELETE CASCADE,
    instruction    TEXT,
    nickname       TEXT,
    character_json TEXT        NOT NULL,
    prompt         TEXT        NOT NULL,
    model          TEXT        NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX proxy_generations_treatment_idx ON proxy_generations (treatment_id, created_at DESC);

ALTER TABLE proxy_treatments
    ADD CONSTRAINT proxy_treatments_current_fk FOREIGN KEY (current_generation_id) REFERENCES proxy_generations (id) ON DELETE SET NULL;
```

- [ ] **Step 2: Apply it by starting the backend**

The Postgres container must be up (`docker compose up -d db`). Run from `backend/`:

Run: `EREGION_JWT_SECRET=$(openssl rand -base64 48) ./mvnw -q spring-boot:run` and wait for "Started EregionApiApplication".
Expected: log line `Migrating schema "public" to version "19 - proxy treatments"`. Stop it with Ctrl+C.

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/resources/db/migration/V19__proxy_treatments.sql
git commit -m "Add tables for proxy treatments and a lore column on decks"
```

---

## Task 2: DTOs and the LLM interface

**Files:**
- Create: `backend/src/main/java/io/eregion/proxy/ProxyDtos.java`
- Create: `backend/src/main/java/io/eregion/proxy/LlmClient.java`

- [ ] **Step 1: Write `ProxyDtos.java`**

```java
package io.eregion.proxy;

import java.time.Instant;
import java.util.UUID;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public final class ProxyDtos {

	private ProxyDtos() {
	}

	/** NICKNAME invents a new name and character. RESKIN keeps the card's own name and gives it a new character and art. */
	public enum Mode {
		NICKNAME, RESKIN
	}

	/** Who the card is in the deck's lore. {@code tier} is free text taken from the lore, such as "Aelathir" or "Lathaar-tier". */
	public record Character(String tier, String who, String race, String role, String signature) {
	}

	/** What the model answers for one card. {@code nickname} is null in RESKIN mode. */
	public record Draft(String nickname, Character character, String prompt) {
	}

	public record Generation(UUID id, Instant createdAt, String instruction, String nickname, Character character, String prompt, String model) {
	}

	public record Treatment(UUID id, UUID cardId, Mode mode, UUID currentGenerationId, Generation current) {
	}

	/** What the model already knows about the other cards of the deck, so names do not clash. */
	public record Pick(String cardName, String nickname, String tier) {
	}

	/** The card facts the model needs, copied out of the catalog. */
	public record CardFacts(String name, String manaCost, String typeLine, String colors, String oracleText) {
	}

	public record GenerateRequest(@NotNull Mode mode, @Size(max = 1000) String instruction) {
	}

	public record CurrentRequest(@NotNull UUID generationId) {
	}

	public record LoreRequest(@Size(max = 60000) String lore, @Size(max = 200) String mjParams) {
	}

	public record Lore(String lore, String mjParams) {
	}
}
```

- [ ] **Step 2: Write `LlmClient.java`**

```java
package io.eregion.proxy;

/** A language model that answers one system and user message with text. Swappable, so tests and other providers fit. */
public interface LlmClient {

	/** The model's reply text. Throws {@code ApiException} when the service is not set up or fails. */
	String complete(String system, String user);

	/** The name stored with each generation. */
	String modelName();
}
```

- [ ] **Step 3: Compile**

Run: `cd backend && ./mvnw -q compile`
Expected: no output, exit 0.

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/io/eregion/proxy/ProxyDtos.java backend/src/main/java/io/eregion/proxy/LlmClient.java
git commit -m "Add the proxy records and the LlmClient interface"
```

---

## Task 3: Prompt service (TDD)

**Files:**
- Create: `backend/src/main/resources/proxy-rules.md`
- Create: `backend/src/main/java/io/eregion/proxy/ProxyPromptService.java`
- Test: `backend/src/test/java/io/eregion/proxy/ProxyPromptServiceTest.java`

- [ ] **Step 1: Write the failing test**

```java
package io.eregion.proxy;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

import io.eregion.common.ApiException;
import io.eregion.proxy.ProxyDtos.CardFacts;
import io.eregion.proxy.ProxyDtos.Draft;
import io.eregion.proxy.ProxyDtos.Mode;
import io.eregion.proxy.ProxyDtos.Pick;

class ProxyPromptServiceTest {

	/** Answers from a script, one reply per call, and remembers what it was asked. */
	static class Scripted implements LlmClient {

		final List<String> replies;
		final List<String> users = new ArrayList<>();
		final List<String> systems = new ArrayList<>();

		Scripted(String... replies) {
			this.replies = new ArrayList<>(List.of(replies));
		}

		@Override
		public String complete(String system, String user) {
			systems.add(system);
			users.add(user);
			return replies.remove(0);
		}

		@Override
		public String modelName() {
			return "fake";
		}
	}

	static final String GOOD_NICKNAME = """
			{"nickname":"Sildarion","character":{"tier":"Lathaar-tier","who":"a calm toll-keeper","race":"unfallen spirit","role":"sentinel","signature":"a gold coin held mid-fall"},"prompt":"tall silver-haired figure on a cliff, gold coin mid-fall above an open palm"}
			""";
	static final String GOOD_RESKIN = """
			{"character":{"tier":"Maelgrith-submitted","who":"a faceless sovereign","race":"void spirit","role":"thief","signature":"a violet seam between two crown spires"},"prompt":"faceless crowned figure reaching into a violet tear"}
			""";

	static final CardFacts SENTINEL = new CardFacts("Esper Sentinel", "{W}", "Artifact Creature - Human Soldier", "W",
			"Whenever an opponent casts their first noncreature spell each turn, draw a card unless they pay X.");

	ProxyPromptService service(LlmClient llm) {
		return new ProxyPromptService(llm);
	}

	@Test
	void nicknameModeReturnsNameCharacterAndPrompt() {
		Draft draft = service(new Scripted(GOOD_NICKNAME)).generate("LORE TEXT", SENTINEL, Mode.NICKNAME, List.of(), null, null);

		assertThat(draft.nickname()).isEqualTo("Sildarion");
		assertThat(draft.character().tier()).isEqualTo("Lathaar-tier");
		assertThat(draft.prompt()).contains("gold coin");
	}

	@Test
	void reskinModeKeepsNoNickname() {
		Draft draft = service(new Scripted(GOOD_RESKIN)).generate("LORE TEXT", SENTINEL, Mode.RESKIN, List.of(), null, null);

		assertThat(draft.nickname()).isNull();
		assertThat(draft.character().who()).isEqualTo("a faceless sovereign");
	}

	@Test
	void theRequestCarriesLoreCardEarlierPicksAndTheRefineContext() {
		var llm = new Scripted(GOOD_NICKNAME);
		var earlier = List.of(new Pick("Lord of the Void", null, "Maelgrith-submitted"), new Pick("Esper Sentinel", "Old Name", "Lathaar-tier"));
		var previous = new Draft("Old Name", new ProxyDtos.Character("Lathaar-tier", "w", "r", "o", "s"), "old prompt text");

		service(llm).generate("LORE TEXT", SENTINEL, Mode.NICKNAME, earlier, previous, "make the armor darker");

		String user = llm.users.get(0);
		assertThat(user).contains("LORE TEXT").contains("Esper Sentinel").contains("draw a card unless they pay X");
		assertThat(user).contains("Lord of the Void").contains("Maelgrith-submitted");
		assertThat(user).contains("old prompt text").contains("make the armor darker");
		assertThat(user).contains("NICKNAME");
		assertThat(llm.systems.get(0)).isNotBlank();
	}

	@Test
	void aReplyInACodeFenceIsStillRead() {
		var llm = new Scripted("```json\n" + GOOD_NICKNAME + "\n```");

		assertThat(service(llm).generate("L", SENTINEL, Mode.NICKNAME, List.of(), null, null).nickname()).isEqualTo("Sildarion");
	}

	@Test
	void aMalformedReplyIsRetriedOnce() {
		var llm = new Scripted("not json at all", GOOD_NICKNAME);

		Draft draft = service(llm).generate("L", SENTINEL, Mode.NICKNAME, List.of(), null, null);

		assertThat(draft.nickname()).isEqualTo("Sildarion");
		assertThat(llm.users).hasSize(2);
	}

	@Test
	void twoBadRepliesFailWithAMessage() {
		var llm = new Scripted("nope", "{\"character\":{\"who\":\"x\"}}");

		assertThatThrownBy(() -> service(llm).generate("L", SENTINEL, Mode.NICKNAME, List.of(), null, null))
				.isInstanceOf(ApiException.class)
				.hasMessageContaining("could not be read");
		assertThat(llm.users).hasSize(2);
	}

	@Test
	void nicknameModeRequiresANickname() {
		var llm = new Scripted(GOOD_RESKIN, GOOD_RESKIN);

		assertThatThrownBy(() -> service(llm).generate("L", SENTINEL, Mode.NICKNAME, List.of(), null, null)).isInstanceOf(ApiException.class);
	}
}
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd backend && ./mvnw -q test -Dtest=ProxyPromptServiceTest`
Expected: compilation FAIL, `cannot find symbol ... ProxyPromptService`.

- [ ] **Step 3: Write the rules file `backend/src/main/resources/proxy-rules.md`**

```markdown
You design proxy cards for a Magic: The Gathering Commander deck. You are given the deck's lore, one real card, and a mode. You invent who the card is in that lore and write a Midjourney prompt for its art.

# Output

Reply with one JSON object and nothing else.

NICKNAME mode: {"nickname": string, "character": {"tier": string, "who": string, "race": string, "role": string, "signature": string}, "prompt": string}
RESKIN mode: the same, without "nickname". The card keeps its own name.

- tier: the tier or faction of the lore this character belongs to, in the lore's own words. Place the card in a tier before you design anything.
- who: one sentence on the character's personality.
- signature: the single most iconic visual detail.
- prompt: the Midjourney text, without parameters (the app adds --ar, --style and --v). Compact: one flowing paragraph, concrete nouns, no filler.

# Rules for the character

- Personality first. Start from who the character is and how they stand, not from the card's mechanic. Reframe the mechanic as something the character does, shown through one image.
- The card's function decides the role: a removal spell, a mana rock, a creature and a counterspell are different kinds of subject.
- One signature detail. A second competing detail weakens both.
- Follow the lore's tier rules exactly. Where the lore says a tier uses erasure, mutation or geometry, use that vocabulary and nothing from another tier.
- Nicknames: invented, pronounceable, in the lore's naming style, never a name already used. Titles instead of names where the lore says a tier has no names.
- Do not copy the card's real flavor text or real art.

# Rules for the prompt

- Anchor gender and build explicitly ("broad-shouldered masculine build"), or the generator drifts.
- State the direction of any energy ("erupts outward from her hand, pushing away from her body").
- Give any third element (a threat, a tear, a spirit) its own color and substance, or it collapses into the main subject's effect.
- "Faceless" never means "shapeless". Use hard, countable geometry: named silhouette, exact wing or finger counts, with fraying only at the edges.
- Say what each hand does. An unmentioned arm may be dropped.
- Dark backgrounds need both anchors at once (for example "storm sky, never flat black, never washed out") or the generator drifts to one extreme.
- Avoid armor-plating or mechanical vocabulary for organic or spirit subjects.
- One clear subject and, at most, one reactor from the environment. Do not add bystander figures unless the lore calls for them.
- No weapon or ornament described by a curve alone ("curved blade" becomes a scythe). Name the object.
- Palette: name one warm and one cool anchor so the image has contrast.

# Refining

When a previous result and an instruction are given, keep everything the instruction does not mention. Change only what it asks for, and keep the nickname unless the instruction asks for a new one.
```

- [ ] **Step 4: Write `ProxyPromptService.java`**

```java
package io.eregion.proxy;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.List;

import org.springframework.stereotype.Service;

import io.eregion.common.ApiException;
import io.eregion.proxy.ProxyDtos.CardFacts;
import io.eregion.proxy.ProxyDtos.Character;
import io.eregion.proxy.ProxyDtos.Draft;
import io.eregion.proxy.ProxyDtos.Mode;
import io.eregion.proxy.ProxyDtos.Pick;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Turns a deck's lore and one card into a request for the model, and the model's JSON answer into a {@link Draft}. */
@Service
public class ProxyPromptService {

	static final int MAX_PROMPT = 4000;
	static final int MAX_NICKNAME = 80;
	private static final JsonMapper JSON = JsonMapper.builder().build();

	/** The reply was not the JSON we asked for. One retry, then the card fails. */
	static class BadReply extends RuntimeException {
		BadReply(String message) {
			super(message);
		}
	}

	private final LlmClient llm;
	private final String rules;

	public ProxyPromptService(LlmClient llm) {
		this.llm = llm;
		try (var in = ProxyPromptService.class.getResourceAsStream("/proxy-rules.md")) {
			this.rules = new String(in.readAllBytes(), StandardCharsets.UTF_8);
		}
		catch (IOException ex) {
			throw new UncheckedIOException(ex);
		}
	}

	/**
	 * @param previous the current result when refining, otherwise null
	 * @param instruction what to change when refining, otherwise null
	 */
	public Draft generate(String lore, CardFacts card, Mode mode, List<Pick> others, Draft previous, String instruction) {
		String user = userMessage(lore, card, mode, others, previous, instruction);
		BadReply last = null;
		for (int attempt = 0; attempt < 2; attempt++) {
			String reply = llm.complete(rules, user);
			try {
				return parse(reply, mode);
			}
			catch (BadReply ex) {
				last = ex;
			}
		}
		throw ApiException.unavailable("The model's answer could not be read (" + last.getMessage() + "). Try again.");
	}

	static String userMessage(String lore, CardFacts card, Mode mode, List<Pick> others, Draft previous, String instruction) {
		var out = new StringBuilder();
		out.append("# Deck lore\n\n").append(lore == null || lore.isBlank() ? "(none given: keep the result generic)" : lore.strip()).append("\n\n");
		out.append("# Mode\n\n").append(mode).append(mode == Mode.RESKIN ? " (keep the card's own name)" : " (invent a new name)").append("\n\n");
		out.append("# Card\n\n");
		out.append("Name: ").append(card.name()).append('\n');
		out.append("Mana cost: ").append(nullToEmpty(card.manaCost())).append('\n');
		out.append("Type: ").append(nullToEmpty(card.typeLine())).append('\n');
		out.append("Colors: ").append(nullToEmpty(card.colors())).append('\n');
		out.append("Rules text: ").append(nullToEmpty(card.oracleText())).append("\n\n");
		if (!others.isEmpty()) {
			out.append("# Already chosen for other cards in this deck (do not reuse these names)\n\n");
			for (Pick pick : others) {
				out.append("- ").append(pick.cardName()).append(": ");
				out.append(pick.nickname() == null ? "(kept its name)" : pick.nickname());
				out.append(", ").append(pick.tier() == null || pick.tier().isBlank() ? "no tier" : pick.tier()).append('\n');
			}
			out.append('\n');
		}
		if (previous != null && instruction != null && !instruction.isBlank()) {
			out.append("# Previous result to refine\n\n");
			if (previous.nickname() != null) {
				out.append("Nickname: ").append(previous.nickname()).append('\n');
			}
			out.append("Prompt: ").append(previous.prompt()).append("\n\n");
			out.append("# Change requested\n\n").append(instruction.strip()).append('\n');
		}
		return out.toString();
	}

	static Draft parse(String reply, Mode mode) {
		JsonNode root;
		try {
			root = JSON.readTree(stripFence(reply));
		}
		catch (RuntimeException ex) {
			throw new BadReply("not JSON");
		}
		JsonNode character = root.path("character");
		String prompt = root.path("prompt").asString("").strip();
		String who = character.path("who").asString("").strip();
		if (prompt.isEmpty() || prompt.length() > MAX_PROMPT) {
			throw new BadReply("no usable prompt");
		}
		if (who.isEmpty()) {
			throw new BadReply("no character");
		}
		String nickname = null;
		if (mode == Mode.NICKNAME) {
			nickname = root.path("nickname").asString("").strip();
			if (nickname.isEmpty() || nickname.length() > MAX_NICKNAME) {
				throw new BadReply("no usable nickname");
			}
		}
		return new Draft(nickname,
				new Character(character.path("tier").asString("").strip(), who, character.path("race").asString("").strip(),
						character.path("role").asString("").strip(), character.path("signature").asString("").strip()),
				prompt);
	}

	/** Models sometimes wrap JSON in a code fence even when told not to. */
	static String stripFence(String reply) {
		String text = reply == null ? "" : reply.strip();
		if (text.startsWith("```")) {
			int firstBreak = text.indexOf('\n');
			int close = text.lastIndexOf("```");
			if (firstBreak > 0 && close > firstBreak) {
				text = text.substring(firstBreak + 1, close).strip();
			}
		}
		return text;
	}

	private static String nullToEmpty(String value) {
		return value == null ? "" : value;
	}
}
```

- [ ] **Step 5: Run the test**

Run: `cd backend && ./mvnw -q test -Dtest=ProxyPromptServiceTest`
Expected: PASS, 7 tests, no failures.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/resources/proxy-rules.md backend/src/main/java/io/eregion/proxy/ProxyPromptService.java backend/src/test/java/io/eregion/proxy/ProxyPromptServiceTest.java
git commit -m "Build the proxy prompt request and read the model's answer"
```

---

## Task 4: DeepSeek client

**Files:**
- Create: `backend/src/main/java/io/eregion/proxy/DeepSeekClient.java`
- Modify: `backend/src/main/resources/application.properties` (append)

- [ ] **Step 1: Add the settings**

Append to `application.properties`:

```properties

# Proxy creator. The model writes card art prompts. Without a key, generation answers with a message naming this setting.
eregion.llm.api-key=${EREGION_LLM_API_KEY:}
eregion.llm.url=${EREGION_LLM_URL:https://api.deepseek.com/chat/completions}
eregion.llm.model=${EREGION_LLM_MODEL:deepseek-chat}
eregion.rate.proxy-per-user-minute=${EREGION_RATE_PROXY:30}
```

- [ ] **Step 2: Write `DeepSeekClient.java`**

```java
package io.eregion.proxy;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import io.eregion.common.ApiException;
import tools.jackson.databind.json.JsonMapper;

/** DeepSeek's OpenAI-style chat completions. The key comes from the environment and is never sent to the browser. */
@Component
public class DeepSeekClient implements LlmClient {

	private static final JsonMapper JSON = JsonMapper.builder().build();

	private final RestClient http;
	private final String apiKey;
	private final String model;

	public DeepSeekClient(@Value("${eregion.llm.api-key:}") String apiKey, @Value("${eregion.llm.url}") String url,
			@Value("${eregion.llm.model}") String model) {
		this.apiKey = apiKey;
		this.model = model;
		var factory = new JdkClientHttpRequestFactory(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build());
		factory.setReadTimeout(Duration.ofSeconds(90));
		this.http = RestClient.builder().baseUrl(url).requestFactory(factory).build();
	}

	@Override
	public String complete(String system, String user) {
		if (apiKey == null || apiKey.isBlank()) {
			throw ApiException.unavailable("Proxy generation is not set up. Set EREGION_LLM_API_KEY on the server.");
		}
		Map<String, Object> body = Map.of(
				"model", model,
				"temperature", 0.8,
				"response_format", Map.of("type", "json_object"),
				"messages", List.of(Map.of("role", "system", "content", system), Map.of("role", "user", "content", user)));
		try {
			String answer = http.post()
					.contentType(MediaType.APPLICATION_JSON)
					.header("Authorization", "Bearer " + apiKey)
					.body(body)
					.retrieve()
					.body(String.class);
			return JSON.readTree(answer).path("choices").path(0).path("message").path("content").asString("");
		}
		catch (RestClientResponseException ex) {
			int status = ex.getStatusCode().value();
			if (status == 401 || status == 403) {
				throw ApiException.unavailable("The model service refused the key. Check EREGION_LLM_API_KEY.");
			}
			if (status == 402) {
				throw ApiException.unavailable("The model service says the account has no balance.");
			}
			throw ApiException.unavailable("The model service answered " + status + ". Try again in a moment.");
		}
		catch (RuntimeException ex) {
			throw ApiException.unavailable("The model service could not be reached. Try again in a moment.");
		}
	}

	@Override
	public String modelName() {
		return model;
	}
}
```

- [ ] **Step 3: Compile**

Run: `cd backend && ./mvnw -q compile`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/io/eregion/proxy/DeepSeekClient.java backend/src/main/resources/application.properties
git commit -m "Add a DeepSeek client for the proxy creator"
```

---

## Task 5: Rate limit

**Files:**
- Modify: `backend/src/main/java/io/eregion/ratelimit/RateLimitProperties.java`
- Modify: `backend/src/main/java/io/eregion/ratelimit/RateLimits.java`
- Modify: `backend/src/test/java/io/eregion/ratelimit/RateLimiterTest.java:90,137`

- [ ] **Step 1: Add the property (last component)**

In `RateLimitProperties.java` replace the final component:

```java
		@DefaultValue("30") int analysisPerUserMinute,
		@DefaultValue("30") int proxyPerUserMinute) {
```

- [ ] **Step 2: Add the check**

In `RateLimits.java`, after the `analysis` method:

```java
	/** Each proxy generation is a paid call to a language model. */
	public void proxy(UUID user) {
		check("proxy:" + user, properties.proxyPerUserMinute(), MINUTE, "proxy generations");
	}
```

- [ ] **Step 3: Fix the two test constructions**

Line 90: change `20, 30);` at the end to `20, 30, 30);`.
Line 137: add one more `1`: the list of sixteen `1`s after `false, false` becomes seventeen values, so end with `1, 1, 1), limiter);`.

Concretely:
- `new RateLimitProperties(true, false, 20, loginAccount, 10, 10, 3, 120, 20, 40, 30, 240, 10, 30, 20, 30, 30)`
- `new RateLimitProperties(false, false, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1)`

- [ ] **Step 4: Run the rate limit tests**

Run: `cd backend && ./mvnw -q test -Dtest=RateLimiterTest`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/io/eregion/ratelimit backend/src/test/java/io/eregion/ratelimit/RateLimiterTest.java
git commit -m "Add a per-player limit for proxy generations"
```

---

## Task 6: Repository

**Files:**
- Create: `backend/src/main/java/io/eregion/proxy/ProxyRepository.java`

SQL has no unit test in this codebase (no database tests exist). It is covered by the manual check in Task 11. Keep each method small.

- [ ] **Step 1: Write `ProxyRepository.java`**

```java
package io.eregion.proxy;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import io.eregion.proxy.ProxyDtos.Character;
import io.eregion.proxy.ProxyDtos.Draft;
import io.eregion.proxy.ProxyDtos.Generation;
import io.eregion.proxy.ProxyDtos.Lore;
import io.eregion.proxy.ProxyDtos.Mode;
import io.eregion.proxy.ProxyDtos.Pick;
import io.eregion.proxy.ProxyDtos.Treatment;
import tools.jackson.databind.json.JsonMapper;

@Repository
public class ProxyRepository {

	private static final JsonMapper JSON = JsonMapper.builder().build();

	private static final String GENERATION_COLUMNS = "g.id AS g_id, g.created_at AS g_created, g.instruction AS g_instruction, "
			+ "g.nickname AS g_nickname, g.character_json AS g_character, g.prompt AS g_prompt, g.model AS g_model";

	private final JdbcClient jdbc;

	public ProxyRepository(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	public boolean ownsDeck(UUID deckId, UUID userId) {
		return jdbc.sql("SELECT EXISTS (SELECT 1 FROM decks WHERE id = :deck AND owner_id = :user)")
				.param("deck", deckId).param("user", userId).query(Boolean.class).single();
	}

	public Lore lore(UUID deckId) {
		return jdbc.sql("SELECT lore, mj_params FROM decks WHERE id = :deck")
				.param("deck", deckId)
				.query((rs, n) -> new Lore(rs.getString("lore"), rs.getString("mj_params")))
				.single();
	}

	public void saveLore(UUID deckId, String lore, String mjParams) {
		jdbc.sql("UPDATE decks SET lore = :lore, mj_params = :params WHERE id = :deck")
				.param("lore", blankToNull(lore)).param("params", blankToNull(mjParams)).param("deck", deckId).update();
	}

	/** Every treatment of the deck with its current generation. */
	public List<Treatment> treatments(UUID deckId) {
		return jdbc.sql("""
				SELECT t.id, t.card_id, t.mode, t.current_generation_id, %s
				  FROM proxy_treatments t
				  LEFT JOIN proxy_generations g ON g.id = t.current_generation_id
				 WHERE t.deck_id = :deck
				 ORDER BY t.created_at
				""".formatted(GENERATION_COLUMNS))
				.param("deck", deckId)
				.query(ProxyRepository::treatment)
				.list();
	}

	public Optional<Treatment> treatment(UUID deckId, UUID cardId) {
		return jdbc.sql("""
				SELECT t.id, t.card_id, t.mode, t.current_generation_id, %s
				  FROM proxy_treatments t
				  LEFT JOIN proxy_generations g ON g.id = t.current_generation_id
				 WHERE t.deck_id = :deck AND t.card_id = :card
				""".formatted(GENERATION_COLUMNS))
				.param("deck", deckId).param("card", cardId)
				.query(ProxyRepository::treatment)
				.optional();
	}

	/** Creates the treatment for a card, or switches its mode. Returns its id. */
	public UUID upsertTreatment(UUID deckId, UUID cardId, Mode mode) {
		return jdbc.sql("""
				INSERT INTO proxy_treatments (deck_id, card_id, mode) VALUES (:deck, :card, :mode)
				ON CONFLICT (deck_id, card_id) DO UPDATE SET mode = EXCLUDED.mode, updated_at = now()
				RETURNING id
				""")
				.param("deck", deckId).param("card", cardId).param("mode", mode.name())
				.query(UUID.class).single();
	}

	public UUID insertGeneration(UUID treatmentId, String instruction, Draft draft, String model) {
		return jdbc.sql("""
				INSERT INTO proxy_generations (treatment_id, instruction, nickname, character_json, prompt, model)
				VALUES (:treatment, :instruction, :nickname, :character, :prompt, :model) RETURNING id
				""")
				.param("treatment", treatmentId)
				.param("instruction", blankToNull(instruction))
				.param("nickname", draft.nickname())
				.param("character", JSON.writeValueAsString(draft.character()))
				.param("prompt", draft.prompt())
				.param("model", model)
				.query(UUID.class).single();
	}

	public void setCurrent(UUID treatmentId, UUID generationId) {
		jdbc.sql("UPDATE proxy_treatments SET current_generation_id = :gen, updated_at = now() WHERE id = :id")
				.param("gen", generationId).param("id", treatmentId).update();
	}

	/** True when the generation belongs to that treatment, so one player cannot point at another's rows. */
	public boolean generationBelongs(UUID treatmentId, UUID generationId) {
		return jdbc.sql("SELECT EXISTS (SELECT 1 FROM proxy_generations WHERE id = :gen AND treatment_id = :treatment)")
				.param("gen", generationId).param("treatment", treatmentId).query(Boolean.class).single();
	}

	public List<Generation> history(UUID treatmentId) {
		return jdbc.sql("SELECT " + GENERATION_COLUMNS + " FROM proxy_generations g WHERE g.treatment_id = :treatment ORDER BY g.created_at DESC")
				.param("treatment", treatmentId)
				.query((rs, n) -> generation(rs))
				.list();
	}

	/** What the deck's other cards already have, for the model's context. */
	public List<Pick> picks(UUID deckId, UUID exceptCardId) {
		return jdbc.sql("""
				SELECT c.name, g.nickname, g.character_json
				  FROM proxy_treatments t
				  JOIN cards c ON c.id = t.card_id
				  JOIN proxy_generations g ON g.id = t.current_generation_id
				 WHERE t.deck_id = :deck AND t.card_id <> :card
				 ORDER BY t.created_at
				""")
				.param("deck", deckId).param("card", exceptCardId)
				.query((rs, n) -> new Pick(rs.getString("name"), rs.getString("nickname"), readCharacter(rs.getString("character_json")).tier()))
				.list();
	}

	private static Treatment treatment(ResultSet rs, int n) throws SQLException {
		UUID current = rs.getObject("current_generation_id", UUID.class);
		return new Treatment(rs.getObject("id", UUID.class), rs.getObject("card_id", UUID.class), Mode.valueOf(rs.getString("mode")), current,
				current == null ? null : generation(rs));
	}

	private static Generation generation(ResultSet rs) throws SQLException {
		return new Generation(rs.getObject("g_id", UUID.class), rs.getTimestamp("g_created").toInstant(), rs.getString("g_instruction"),
				rs.getString("g_nickname"), readCharacter(rs.getString("g_character")), rs.getString("g_prompt"), rs.getString("g_model"));
	}

	private static Character readCharacter(String json) {
		return JSON.readValue(json, Character.class);
	}

	private static String blankToNull(String value) {
		return value == null || value.isBlank() ? null : value.strip();
	}
}
```

- [ ] **Step 2: Compile**

Run: `cd backend && ./mvnw -q compile`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/java/io/eregion/proxy/ProxyRepository.java
git commit -m "Add the repository for proxy treatments and lore"
```

---

## Task 7: Service (TDD)

**Files:**
- Create: `backend/src/main/java/io/eregion/proxy/ProxyService.java`
- Test: `backend/src/test/java/io/eregion/proxy/ProxyServiceTest.java`

- [ ] **Step 1: Write the failing test**

```java
package io.eregion.proxy;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import io.eregion.card.Card;
import io.eregion.card.CardRepository;
import io.eregion.common.ApiException;
import io.eregion.proxy.ProxyDtos.Character;
import io.eregion.proxy.ProxyDtos.Draft;
import io.eregion.proxy.ProxyDtos.Generation;
import io.eregion.proxy.ProxyDtos.Lore;
import io.eregion.proxy.ProxyDtos.Mode;
import io.eregion.proxy.ProxyDtos.Pick;
import io.eregion.proxy.ProxyDtos.Treatment;

class ProxyServiceTest {

	static final UUID USER = UUID.randomUUID();
	static final UUID STRANGER = UUID.randomUUID();
	static final UUID DECK = UUID.randomUUID();
	static final UUID CARD = UUID.randomUUID();

	/** An in-memory stand-in for the tables. */
	static class MemoryRepository extends ProxyRepository {

		Lore lore = new Lore("THE LORE", "--ar 5:7");
		UUID treatmentId;
		Mode mode;
		UUID current;
		final List<Generation> generations = new ArrayList<>();

		MemoryRepository() {
			super(null);
		}

		@Override
		public boolean ownsDeck(UUID deckId, UUID userId) {
			return deckId.equals(DECK) && userId.equals(USER);
		}

		@Override
		public Lore lore(UUID deckId) {
			return lore;
		}

		@Override
		public void saveLore(UUID deckId, String l, String params) {
			lore = new Lore(l, params);
		}

		@Override
		public Optional<Treatment> treatment(UUID deckId, UUID cardId) {
			if (treatmentId == null) {
				return Optional.empty();
			}
			Generation now = generations.stream().filter(g -> g.id().equals(current)).findFirst().orElse(null);
			return Optional.of(new Treatment(treatmentId, cardId, mode, current, now));
		}

		@Override
		public UUID upsertTreatment(UUID deckId, UUID cardId, Mode m) {
			if (treatmentId == null) {
				treatmentId = UUID.randomUUID();
			}
			mode = m;
			return treatmentId;
		}

		@Override
		public UUID insertGeneration(UUID treatment, String instruction, Draft draft, String model) {
			var gen = new Generation(UUID.randomUUID(), Instant.now(), instruction, draft.nickname(), draft.character(), draft.prompt(), model);
			generations.add(gen);
			return gen.id();
		}

		@Override
		public void setCurrent(UUID treatment, UUID generationId) {
			current = generationId;
		}

		@Override
		public boolean generationBelongs(UUID treatment, UUID generationId) {
			return generations.stream().anyMatch(g -> g.id().equals(generationId));
		}

		@Override
		public List<Generation> history(UUID treatment) {
			var copy = new ArrayList<>(generations);
			java.util.Collections.reverse(copy);
			return copy;
		}

		@Override
		public List<Pick> picks(UUID deckId, UUID exceptCardId) {
			return List.of(new Pick("Other Card", "Other Name", "Aelathir"));
		}
	}

	static class OneCard extends CardRepository {

		OneCard() {
			super(null);
		}

		@Override
		public Optional<Card> findById(UUID id) {
			if (!id.equals(CARD)) {
				return Optional.empty();
			}
			return Optional.of(new Card(CARD, UUID.randomUUID(), "Esper Sentinel", "{W}", 1, "Artifact Creature - Human Soldier", "Creature", "W", "W",
					"Whenever an opponent casts...", "mh2", "Modern Horizons 2", "1", "rare", "Artist", 1.0, null, null, null, "legal"));
		}
	}

	/** Replies with a new nickname each call, and remembers the last request. */
	static class Counting implements LlmClient {

		int calls;
		String lastUser;

		@Override
		public String complete(String system, String user) {
			calls++;
			lastUser = user;
			return "{\"nickname\":\"Name" + calls + "\",\"character\":{\"tier\":\"T\",\"who\":\"w\",\"race\":\"r\",\"role\":\"o\",\"signature\":\"s\"},\"prompt\":\"prompt " + calls + "\"}";
		}

		@Override
		public String modelName() {
			return "fake";
		}
	}

	MemoryRepository repo = new MemoryRepository();
	Counting llm = new Counting();
	ProxyService service = new ProxyService(repo, new OneCard(), new ProxyPromptService(llm), llm);

	@Test
	void firstGenerationCreatesTheTreatmentAndMakesItCurrent() {
		Treatment treatment = service.generate(USER, DECK, CARD, Mode.NICKNAME, null);

		assertThat(treatment.mode()).isEqualTo(Mode.NICKNAME);
		assertThat(treatment.current().nickname()).isEqualTo("Name1");
		assertThat(treatment.currentGenerationId()).isEqualTo(treatment.current().id());
		assertThat(llm.lastUser).contains("THE LORE").contains("Other Name");
	}

	@Test
	void refiningSendsThePreviousResultAndKeepsBothInHistory() {
		service.generate(USER, DECK, CARD, Mode.NICKNAME, null);

		Treatment refined = service.generate(USER, DECK, CARD, Mode.NICKNAME, "make the armor darker");

		assertThat(llm.lastUser).contains("prompt 1").contains("make the armor darker");
		assertThat(refined.current().prompt()).isEqualTo("prompt 2");
		assertThat(service.history(USER, DECK, CARD)).extracting(Generation::prompt).containsExactly("prompt 2", "prompt 1");
	}

	@Test
	void anInstructionWithNothingToRefineJustGeneratesFresh() {
		Treatment treatment = service.generate(USER, DECK, CARD, Mode.RESKIN, "make the armor darker");

		assertThat(treatment.current().instruction()).isEqualTo("make the armor darker");
		assertThat(llm.lastUser).doesNotContain("Previous result");
	}

	@Test
	void anOlderGenerationCanBeMadeCurrent() {
		Treatment first = service.generate(USER, DECK, CARD, Mode.NICKNAME, null);
		service.generate(USER, DECK, CARD, Mode.NICKNAME, null);

		Treatment back = service.setCurrent(USER, DECK, CARD, first.current().id());

		assertThat(back.current().prompt()).isEqualTo("prompt 1");
	}

	@Test
	void anotherPlayersDeckLooksMissing() {
		assertThatThrownBy(() -> service.generate(STRANGER, DECK, CARD, Mode.NICKNAME, null))
				.isInstanceOf(ApiException.class).hasMessageContaining("Deck not found");
		assertThatThrownBy(() -> service.saveLore(STRANGER, DECK, "x", null)).isInstanceOf(ApiException.class);
		assertThat(llm.calls).isZero();
	}

	@Test
	void anUnknownCardIsRefusedBeforeTheModelIsAsked() {
		assertThatThrownBy(() -> service.generate(USER, DECK, UUID.randomUUID(), Mode.NICKNAME, null))
				.isInstanceOf(ApiException.class).hasMessageContaining("Card not found");
		assertThat(llm.calls).isZero();
	}

	@Test
	void aGenerationThatBelongsToNoneOfThisCardsIsRefused() {
		service.generate(USER, DECK, CARD, Mode.NICKNAME, null);

		assertThatThrownBy(() -> service.setCurrent(USER, DECK, CARD, UUID.randomUUID()))
				.isInstanceOf(ApiException.class).hasMessageContaining("Generation not found");
	}

	@Test
	void characterIsStoredWithTheGeneration() {
		Treatment treatment = service.generate(USER, DECK, CARD, Mode.NICKNAME, null);

		assertThat(treatment.current().character()).isEqualTo(new Character("T", "w", "r", "o", "s"));
	}
}
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd backend && ./mvnw -q test -Dtest=ProxyServiceTest`
Expected: compilation FAIL, `cannot find symbol ... ProxyService`.

- [ ] **Step 3: Write `ProxyService.java`**

```java
package io.eregion.proxy;

import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Service;

import io.eregion.card.Card;
import io.eregion.card.CardRepository;
import io.eregion.common.ApiException;
import io.eregion.proxy.ProxyDtos.CardFacts;
import io.eregion.proxy.ProxyDtos.Draft;
import io.eregion.proxy.ProxyDtos.Generation;
import io.eregion.proxy.ProxyDtos.Lore;
import io.eregion.proxy.ProxyDtos.Mode;
import io.eregion.proxy.ProxyDtos.Treatment;

/** Proxy treatments of a deck: who may touch them, what the model is told, and what is kept. */
@Service
public class ProxyService {

	private final ProxyRepository repository;
	private final CardRepository cards;
	private final ProxyPromptService prompts;
	private final LlmClient llm;

	public ProxyService(ProxyRepository repository, CardRepository cards, ProxyPromptService prompts, LlmClient llm) {
		this.repository = repository;
		this.cards = cards;
		this.prompts = prompts;
		this.llm = llm;
	}

	public Lore lore(UUID userId, UUID deckId) {
		owned(deckId, userId);
		return repository.lore(deckId);
	}

	public Lore saveLore(UUID userId, UUID deckId, String lore, String mjParams) {
		owned(deckId, userId);
		repository.saveLore(deckId, lore, mjParams);
		return repository.lore(deckId);
	}

	public List<Treatment> treatments(UUID userId, UUID deckId) {
		owned(deckId, userId);
		return repository.treatments(deckId);
	}

	/**
	 * Asks the model for a new generation and makes it the current one. With an instruction and an earlier result, the earlier result
	 * is sent along so the model changes only what was asked. Nothing is written when the model fails.
	 */
	public Treatment generate(UUID userId, UUID deckId, UUID cardId, Mode mode, String instruction) {
		owned(deckId, userId);
		Card card = cards.findById(cardId).orElseThrow(() -> ApiException.notFound("Card"));
		Lore lore = repository.lore(deckId);

		Draft previous = repository.treatment(deckId, cardId)
				.map(Treatment::current)
				.map(g -> g == null ? null : new Draft(g.nickname(), g.character(), g.prompt()))
				.orElse(null);

		Draft draft = prompts.generate(lore.lore(), facts(card), mode, repository.picks(deckId, cardId), previous, instruction);

		UUID treatmentId = repository.upsertTreatment(deckId, cardId, mode);
		UUID generationId = repository.insertGeneration(treatmentId, instruction, draft, llm.modelName());
		repository.setCurrent(treatmentId, generationId);
		return repository.treatment(deckId, cardId).orElseThrow();
	}

	public List<Generation> history(UUID userId, UUID deckId, UUID cardId) {
		owned(deckId, userId);
		return repository.treatment(deckId, cardId).map(t -> repository.history(t.id())).orElse(List.of());
	}

	public Treatment setCurrent(UUID userId, UUID deckId, UUID cardId, UUID generationId) {
		owned(deckId, userId);
		Treatment treatment = repository.treatment(deckId, cardId).orElseThrow(() -> ApiException.notFound("Proxy"));
		if (!repository.generationBelongs(treatment.id(), generationId)) {
			throw ApiException.notFound("Generation");
		}
		repository.setCurrent(treatment.id(), generationId);
		return repository.treatment(deckId, cardId).orElseThrow();
	}

	private void owned(UUID deckId, UUID userId) {
		if (!repository.ownsDeck(deckId, userId)) {
			throw ApiException.notFound("Deck");
		}
	}

	private static CardFacts facts(Card card) {
		return new CardFacts(card.name(), card.manaCost(), card.typeLine(), card.colors(), card.oracleText());
	}
}
```

- [ ] **Step 4: Run the tests**

Run: `cd backend && ./mvnw -q test -Dtest='ProxyServiceTest,ProxyPromptServiceTest'`
Expected: PASS, 15 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/io/eregion/proxy/ProxyService.java backend/src/test/java/io/eregion/proxy/ProxyServiceTest.java
git commit -m "Generate, refine and pick proxy results for a deck's cards"
```

---

## Task 8: Controller

**Files:**
- Create: `backend/src/main/java/io/eregion/proxy/ProxyController.java`

- [ ] **Step 1: Write the controller**

```java
package io.eregion.proxy;

import java.util.List;
import java.util.UUID;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.eregion.auth.CurrentUser;
import io.eregion.proxy.ProxyDtos.CurrentRequest;
import io.eregion.proxy.ProxyDtos.GenerateRequest;
import io.eregion.proxy.ProxyDtos.Generation;
import io.eregion.proxy.ProxyDtos.Lore;
import io.eregion.proxy.ProxyDtos.LoreRequest;
import io.eregion.proxy.ProxyDtos.Treatment;
import io.eregion.ratelimit.RateLimits;
import jakarta.validation.Valid;

/** Proxy art prompts for the cards of one of the player's decks. */
@RestController
@RequestMapping("/api/decks/{deckId}")
public class ProxyController {

	private final ProxyService service;
	private final RateLimits limits;

	public ProxyController(ProxyService service, RateLimits limits) {
		this.service = service;
		this.limits = limits;
	}

	@GetMapping("/lore")
	public Lore lore(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID deckId) {
		return service.lore(CurrentUser.id(jwt), deckId);
	}

	@PutMapping("/lore")
	public Lore saveLore(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID deckId, @Valid @RequestBody LoreRequest request) {
		return service.saveLore(CurrentUser.id(jwt), deckId, request.lore(), request.mjParams());
	}

	@GetMapping("/proxies")
	public List<Treatment> proxies(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID deckId) {
		return service.treatments(CurrentUser.id(jwt), deckId);
	}

	@PostMapping("/proxies/{cardId}/generate")
	public Treatment generate(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID deckId, @PathVariable UUID cardId,
			@Valid @RequestBody GenerateRequest request) {
		UUID userId = CurrentUser.id(jwt);
		limits.proxy(userId);
		return service.generate(userId, deckId, cardId, request.mode(), request.instruction());
	}

	@GetMapping("/proxies/{cardId}/history")
	public List<Generation> history(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID deckId, @PathVariable UUID cardId) {
		return service.history(CurrentUser.id(jwt), deckId, cardId);
	}

	@PutMapping("/proxies/{cardId}/current")
	public Treatment setCurrent(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID deckId, @PathVariable UUID cardId,
			@Valid @RequestBody CurrentRequest request) {
		return service.setCurrent(CurrentUser.id(jwt), deckId, cardId, request.generationId());
	}
}
```

- [ ] **Step 2: Compile and run the whole backend suite**

Run: `cd backend && ./mvnw -q test`
Expected: all pass, including `ProxyServiceTest` and `ProxyPromptServiceTest`.

- [ ] **Step 3: Smoke the endpoints with a fake key off**

Restart the backend (as in Task 1 step 2), register or log in (cookie jar `jar`), then:

```bash
DECK=$(curl -s -b jar localhost:3000/api/decks | python3 -I -c "import json,sys;print(json.load(sys.stdin)[0]['id'])")
curl -s -b jar -H 'Origin: http://localhost:3000' -H 'Content-Type: application/json' -X PUT -d '{"lore":"test lore","mjParams":"--ar 5:7"}' localhost:3000/api/decks/$DECK/lore
curl -s -b jar localhost:3000/api/decks/$DECK/proxies
```

Expected: the first returns `{"lore":"test lore","mjParams":"--ar 5:7"}`, the second `[]`. A generate call without `EREGION_LLM_API_KEY` returns 503 with "Set EREGION_LLM_API_KEY".

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/io/eregion/proxy/ProxyController.java
git commit -m "Add the proxy endpoints"
```

---

## Task 9: Frontend types and batch queue (TDD)

**Files:**
- Modify: `frontend/src/lib/types.ts` (append)
- Create: `frontend/src/lib/proxy.ts`
- Test: `frontend/src/lib/proxy.test.ts`

- [ ] **Step 1: Append the types to `lib/types.ts`**

```ts
export type ProxyMode = "NICKNAME" | "RESKIN";

export interface ProxyCharacter {
  tier: string;
  who: string;
  race: string;
  role: string;
  signature: string;
}

export interface ProxyGeneration {
  id: string;
  createdAt: string;
  instruction: string | null;
  nickname: string | null;
  character: ProxyCharacter;
  prompt: string;
  model: string;
}

export interface ProxyTreatment {
  id: string;
  cardId: string;
  mode: ProxyMode;
  currentGenerationId: string | null;
  current: ProxyGeneration | null;
}

export interface DeckLore {
  lore: string | null;
  mjParams: string | null;
}
```

- [ ] **Step 2: Write the failing test `lib/proxy.test.ts`**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { fullPrompt, pending, runBatch } from "./proxy.ts";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test("runs every item and reports none failed", async () => {
  const seen: number[] = [];
  const result = await runBatch([1, 2, 3, 4], async (n) => void seen.push(n), { concurrency: 2, signal: new AbortController().signal });

  assert.deepEqual(seen.sort(), [1, 2, 3, 4]);
  assert.equal(result.done, 4);
  assert.deepEqual(result.failed, []);
});

test("never has more than the concurrency running at once", async () => {
  let running = 0;
  let peak = 0;
  await runBatch([1, 2, 3, 4, 5, 6], async () => {
    running++;
    peak = Math.max(peak, running);
    await tick();
    running--;
  }, { concurrency: 3, signal: new AbortController().signal });

  assert.equal(peak, 3);
});

test("one failure does not stop the others", async () => {
  const result = await runBatch([1, 2, 3], async (n) => {
    if (n === 2) throw new Error("boom");
  }, { concurrency: 1, signal: new AbortController().signal });

  assert.equal(result.done, 2);
  assert.equal(result.failed.length, 1);
  assert.equal(result.failed[0].item, 2);
});

test("cancelling stops starting new items", async () => {
  const controller = new AbortController();
  const seen: number[] = [];
  const result = await runBatch([1, 2, 3, 4], async (n) => {
    seen.push(n);
    if (n === 2) controller.abort();
    await tick();
  }, { concurrency: 1, signal: controller.signal });

  assert.deepEqual(seen, [1, 2]);
  assert.equal(result.done, 2);
});

test("progress is reported after each item", async () => {
  const marks: number[] = [];
  await runBatch([1, 2, 3], async () => {}, { concurrency: 1, signal: new AbortController().signal, onProgress: (finished) => marks.push(finished) });

  assert.deepEqual(marks, [1, 2, 3]);
});

test("pending lists the cards that have no treatment yet", () => {
  assert.deepEqual(pending(["a", "b", "c"], [{ cardId: "b" }]), ["a", "c"]);
});

test("the copied prompt carries the deck's parameters", () => {
  assert.equal(fullPrompt("a tall figure", "--ar 5:7 --v 7"), "a tall figure --ar 5:7 --v 7");
  assert.equal(fullPrompt("a tall figure", null), "a tall figure");
  assert.equal(fullPrompt("a tall figure", "  "), "a tall figure");
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `cd frontend && node --test src/lib/proxy.test.ts`
Expected: FAIL, cannot find module `./proxy.ts`.

- [ ] **Step 4: Write `lib/proxy.ts`**

```ts
export interface BatchOptions {
  concurrency: number;
  signal: AbortSignal;
  /** Called after each item finishes, with how many have finished so far (failed ones included). */
  onProgress?: (finished: number) => void;
}

export interface BatchResult<T> {
  done: number;
  failed: Array<{ item: T; error: unknown }>;
}

/**
 * Runs the worker over the items with at most `concurrency` in flight. A failing item is recorded and the rest carry on. Aborting the
 * signal stops new items from starting; ones already running finish.
 */
export async function runBatch<T>(items: T[], worker: (item: T) => Promise<void>, options: BatchOptions): Promise<BatchResult<T>> {
  const failed: BatchResult<T>["failed"] = [];
  let next = 0;
  let finished = 0;
  let done = 0;

  async function lane() {
    while (!options.signal.aborted && next < items.length) {
      const item = items[next++];
      try {
        await worker(item);
        done++;
      } catch (error) {
        failed.push({ item, error });
      }
      finished++;
      options.onProgress?.(finished);
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, Math.min(options.concurrency, items.length)) }, lane));
  return { done, failed };
}

/** Cards that have no treatment yet, in the order given. An interrupted batch resumes with these. */
export function pending(cardIds: string[], treatments: Array<{ cardId: string }>): string[] {
  const have = new Set(treatments.map((t) => t.cardId));
  return cardIds.filter((id) => !have.has(id));
}

/** The text to paste into Midjourney: the prompt plus the deck's parameters. */
export function fullPrompt(prompt: string, params: string | null): string {
  const extra = params?.trim();
  return extra ? `${prompt} ${extra}` : prompt;
}
```

- [ ] **Step 5: Run the test**

Run: `cd frontend && node --test src/lib/proxy.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/lib/proxy.ts frontend/src/lib/proxy.test.ts
git commit -m "Add the proxy types and a batch queue with cancel"
```

---

## Task 10: Hook, card panel, section, wiring

**Files:**
- Create: `frontend/src/lib/useProxies.ts`
- Create: `frontend/src/components/builder/ProxyPanel.tsx`
- Create: `frontend/src/components/builder/ProxiesSection.tsx`
- Modify: `frontend/src/components/builder/CardMenu.tsx` (props, destructuring, one menu item)
- Modify: `frontend/src/components/builder/DeckBuilder.tsx` (state, CardMenu prop, section, panel)

- [ ] **Step 1: Write `lib/useProxies.ts`**

```ts
"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import type { DeckLore, ProxyGeneration, ProxyMode, ProxyTreatment } from "./types";

/** The proxy treatments and lore of one deck, with the calls that change them. */
export function useProxies(deckId: string) {
  const [treatments, setTreatments] = useState<ProxyTreatment[]>([]);
  const [lore, setLore] = useState<DeckLore>({ lore: null, mjParams: null });
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    const [list, text] = await Promise.all([
      api<ProxyTreatment[]>(`/api/decks/${deckId}/proxies`),
      api<DeckLore>(`/api/decks/${deckId}/lore`),
    ]);
    setTreatments(list);
    setLore(text);
    setLoaded(true);
  }, [deckId]);

  useEffect(() => {
    reload().catch(() => setLoaded(true));
  }, [reload]);

  const put = useCallback((next: ProxyTreatment) => {
    setTreatments((previous) => (previous.some((t) => t.cardId === next.cardId) ? previous.map((t) => (t.cardId === next.cardId ? next : t)) : [...previous, next]));
  }, []);

  const generate = useCallback(
    async (cardId: string, mode: ProxyMode, instruction?: string) => {
      const next = await api<ProxyTreatment>(`/api/decks/${deckId}/proxies/${cardId}/generate`, { method: "POST", body: { mode, instruction: instruction || null } });
      put(next);
      return next;
    },
    [deckId, put],
  );

  const history = useCallback((cardId: string) => api<ProxyGeneration[]>(`/api/decks/${deckId}/proxies/${cardId}/history`), [deckId]);

  const choose = useCallback(
    async (cardId: string, generationId: string) => {
      const next = await api<ProxyTreatment>(`/api/decks/${deckId}/proxies/${cardId}/current`, { method: "PUT", body: { generationId } });
      put(next);
      return next;
    },
    [deckId, put],
  );

  const saveLore = useCallback(
    async (text: string, mjParams: string) => {
      const saved = await api<DeckLore>(`/api/decks/${deckId}/lore`, { method: "PUT", body: { lore: text, mjParams } });
      setLore(saved);
    },
    [deckId],
  );

  return { treatments, lore, loaded, generate, history, choose, saveLore };
}
```

- [ ] **Step 2: Write `ProxyPanel.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/Dialog";
import { ApiError } from "@/lib/api";
import { fullPrompt } from "@/lib/proxy";
import type { useProxies } from "@/lib/useProxies";
import type { ProxyGeneration, ProxyMode } from "@/lib/types";
import { btn } from "@/lib/ui";

type Proxies = ReturnType<typeof useProxies>;

interface Props {
  open: boolean;
  onClose: () => void;
  cardId: string | null;
  cardName: string;
  proxies: Proxies;
  onNotify: (message: string) => void;
}

/** One card's proxy: pick nickname or reskin, generate, refine, look back through earlier results, copy the prompt. */
export function ProxyPanel(props: Props) {
  return (
    <Dialog open={props.open && props.cardId !== null} onClose={props.onClose} label={`Proxy for ${props.cardName}`} size="md">
      {props.cardId && <Body {...props} cardId={props.cardId} />}
    </Dialog>
  );
}

function Body({ cardId, cardName, proxies, onNotify }: Props & { cardId: string }) {
  const treatment = proxies.treatments.find((t) => t.cardId === cardId) ?? null;
  const [mode, setMode] = useState<ProxyMode>(treatment?.mode ?? "NICKNAME");
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ProxyGeneration[]>([]);
  const current = treatment?.current ?? null;

  useEffect(() => {
    if (!treatment) return;
    let cancelled = false;
    proxies.history(cardId).then((list) => !cancelled && setHistory(list)).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [cardId, treatment?.currentGenerationId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run(refine: boolean) {
    setBusy(true);
    setError(null);
    try {
      await proxies.generate(cardId, mode, refine ? instruction : undefined);
      if (refine) setInstruction("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not generate. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!current) return;
    try {
      await navigator.clipboard.writeText(fullPrompt(current.prompt, proxies.lore.mjParams));
      onNotify("Prompt copied");
    } catch {
      onNotify("Could not copy. Select the text and copy it by hand.");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <h2 className="font-display text-[44px] leading-none">{current?.nickname ?? cardName}</h2>
      {current?.nickname && <p className="-mt-3 text-sm text-muted">Proxy for {cardName}</p>}

      <div role="group" aria-label="Mode" className="grid grid-cols-2 rounded-full border border-line p-1">
        {(["NICKNAME", "RESKIN"] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => setMode(m)}
            className={`min-h-9 rounded-full text-[13px] [@media(pointer:coarse)]:min-h-11 ${mode === m ? "bg-ink text-bg" : "text-muted hover:text-ink"}`}
          >
            {m === "NICKNAME" ? "New nickname" : "Keep the name, new art"}
          </button>
        ))}
      </div>

      {current ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">
            {current.character.tier && <span className="mr-2 font-mono text-xs uppercase">{current.character.tier}</span>}
            {current.character.who}
          </p>
          <p className="whitespace-pre-wrap rounded-3xl border border-line bg-surface px-5 py-4 text-[15px] leading-relaxed">{current.prompt}</p>
          <div className="flex gap-2.5">
            <button type="button" className={btn.primary} onClick={copy}>
              Copy prompt
            </button>
            <button type="button" className={btn.secondary} disabled={busy} onClick={() => run(false)}>
              {busy ? "Working…" : "Generate again"}
            </button>
          </div>
          <div className="flex gap-2.5">
            <input
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              maxLength={1000}
              placeholder="Refine: make the armor darker"
              aria-label="Refine instruction"
              className="min-h-9 w-full rounded-full border border-line bg-surface px-4 text-[13px] text-ink placeholder:text-muted focus:border-ink focus:outline-none [@media(pointer:coarse)]:min-h-11"
            />
            <button type="button" className={btn.secondary} disabled={busy || !instruction.trim()} onClick={() => run(true)}>
              Refine
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className={btn.large.primary} disabled={busy} onClick={() => run(false)}>
          {busy ? "Working…" : "Generate"}
        </button>
      )}

      {proxies.lore.lore === null && <p className="text-sm text-muted">This deck has no lore yet, so results will be generic. Add it under Proxies.</p>}
      {error && (
        <p role="alert" className="rounded-2xl border border-danger-line bg-danger/10 px-4 py-3 text-sm text-ink">
          {error}
        </p>
      )}

      {history.length > 1 && (
        <section aria-label="History" className="flex flex-col gap-2">
          <h3 className="text-sm text-muted">Earlier results</h3>
          <ul className="flex max-h-56 flex-col gap-2 overflow-auto">
            {history.map((g) => (
              <li key={g.id} className="flex items-start justify-between gap-3 rounded-2xl border border-line px-4 py-3 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{g.nickname ?? cardName}</span>
                  <span className="line-clamp-2 text-muted">{g.instruction ? `${g.instruction}: ` : ""}{g.prompt}</span>
                </span>
                {g.id === treatment?.currentGenerationId ? (
                  <span className="shrink-0 font-mono text-xs text-muted">current</span>
                ) : (
                  <button type="button" className={btn.quiet} onClick={() => proxies.choose(cardId, g.id).catch(() => onNotify("Could not switch."))}>
                    Use this
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Write `ProxiesSection.tsx`**

```tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { pending, runBatch } from "@/lib/proxy";
import type { useProxies } from "@/lib/useProxies";
import type { DeckCardLine, ProxyMode } from "@/lib/types";
import { btn } from "@/lib/ui";

type Proxies = ReturnType<typeof useProxies>;

interface Props {
  lines: DeckCardLine[];
  proxies: Proxies;
  onOpen: (cardId: string) => void;
}

const CONCURRENCY = 3;

/** The deck's lore and parameters, every card with its proxy status, and a batch generate over the cards you tick. */
export function ProxiesSection({ lines, proxies, onOpen }: Props) {
  const cards = useMemo(() => {
    const seen = new Map<string, DeckCardLine>();
    for (const line of lines) if (line.board !== "tokens" && !seen.has(line.cardId)) seen.set(line.cardId, line);
    return [...seen.values()];
  }, [lines]);

  const [lore, setLore] = useState(proxies.lore.lore ?? "");
  const [params, setParams] = useState(proxies.lore.mjParams ?? "");
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<ProxyMode>("NICKNAME");
  const [progress, setProgress] = useState<{ finished: number; total: number } | null>(null);
  const [failures, setFailures] = useState<Map<string, string>>(new Map());
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    setLore(proxies.lore.lore ?? "");
    setParams(proxies.lore.mjParams ?? "");
  }, [proxies.lore.lore, proxies.lore.mjParams]);

  const byCard = new Map(proxies.treatments.map((t) => [t.cardId, t]));
  const dirty = lore !== (proxies.lore.lore ?? "") || params !== (proxies.lore.mjParams ?? "");
  const running = progress !== null;

  async function save() {
    try {
      await proxies.saveLore(lore, params);
      setSavedMessage("Saved");
    } catch (err) {
      setSavedMessage(err instanceof ApiError ? err.message : "Could not save");
    }
  }

  async function generateSelected(ids: string[]) {
    if (ids.length === 0) return;
    const controller = new AbortController();
    abort.current = controller;
    setFailures(new Map());
    setProgress({ finished: 0, total: ids.length });
    const result = await runBatch(
      ids,
      async (id) => {
        await proxies.generate(id, mode);
      },
      { concurrency: CONCURRENCY, signal: controller.signal, onProgress: (finished) => setProgress({ finished, total: ids.length }) },
    );
    setFailures(new Map(result.failed.map(({ item, error }) => [item, error instanceof ApiError ? error.message : "Failed"])));
    setProgress(null);
    setSelected(new Set(result.failed.map(({ item }) => item)));
  }

  const toggle = (id: string) =>
    setSelected((previous) => {
      const next = new Set(previous);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <section aria-label="Proxies" className="mt-16 flex flex-col gap-6">
      <h2 className="font-display text-[44px] leading-none">Proxies</h2>

      <div className="flex flex-col gap-2">
        <label htmlFor="deck-lore" className="text-sm text-muted">
          Deck lore. The model reads all of it for every card.
        </label>
        <textarea
          id="deck-lore"
          value={lore}
          onChange={(event) => setLore(event.target.value)}
          maxLength={60000}
          rows={8}
          className="w-full resize-y rounded-3xl border border-line bg-surface px-5 py-4 text-[15px] leading-relaxed text-ink placeholder:text-muted focus:border-ink focus:outline-none"
        />
        <div className="flex items-center gap-2.5">
          <input
            value={params}
            onChange={(event) => setParams(event.target.value)}
            maxLength={200}
            aria-label="Midjourney parameters"
            placeholder="--ar 5:7 --style raw --v 7"
            className="min-h-9 w-full max-w-sm rounded-full border border-line bg-surface px-4 text-[13px] text-ink placeholder:text-muted focus:border-ink focus:outline-none [@media(pointer:coarse)]:min-h-11"
          />
          <button type="button" className={btn.primary} disabled={!dirty} onClick={save}>
            Save
          </button>
          {savedMessage && !dirty && <span className="text-sm text-muted">{savedMessage}</span>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <select value={mode} onChange={(event) => setMode(event.target.value as ProxyMode)} aria-label="Mode for the selected cards" className="min-h-9 rounded-full border border-line bg-surface px-4 text-[13px] text-ink">
          <option value="NICKNAME">New nickname</option>
          <option value="RESKIN">Keep the name, new art</option>
        </select>
        <button type="button" className={btn.primary} disabled={running || selected.size === 0} onClick={() => generateSelected([...selected])}>
          Generate {selected.size > 0 ? selected.size : ""} selected
        </button>
        <button type="button" className={btn.secondary} disabled={running} onClick={() => setSelected(new Set(pending(cards.map((c) => c.cardId), proxies.treatments)))}>
          Select cards without a proxy
        </button>
        {running && (
          <>
            <progress value={progress.finished} max={progress.total} className="w-40" aria-label="Progress" />
            <span className="font-mono text-xs text-muted">
              {progress.finished} / {progress.total}
            </span>
            <button type="button" className={btn.quiet} onClick={() => abort.current?.abort()}>
              Cancel
            </button>
          </>
        )}
      </div>

      <ul className="flex flex-col divide-y divide-line rounded-3xl border border-line">
        {cards.map((card) => {
          const treatment = byCard.get(card.cardId);
          const failure = failures.get(card.cardId);
          return (
            <li key={card.cardId} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <input type="checkbox" aria-label={`Select ${card.name}`} checked={selected.has(card.cardId)} onChange={() => toggle(card.cardId)} disabled={running} />
              <button type="button" className="min-w-0 flex-1 truncate text-left hover:underline" onClick={() => onOpen(card.cardId)}>
                {card.name}
                {treatment?.current?.nickname && <span className="ml-2 text-muted">→ {treatment.current.nickname}</span>}
              </button>
              {failure && <span className="truncate text-xs text-danger" title={failure}>{failure}</span>}
              <span className="shrink-0 font-mono text-xs text-muted">{treatment ? (treatment.mode === "NICKNAME" ? "nickname" : "reskin") : "none"}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
```

- [ ] **Step 4: Add the "Proxy" item to `CardMenu.tsx`**

In `Props` add after `onHistory`:

```ts
  onProxy: (line: DeckCardLine) => void;
```

In the destructured parameters add `onProxy` after `onHistory`. After the "History in this deck" button add:

```tsx
      <button role="menuitem" className={item} onClick={act(() => onProxy(line))}>
        Proxy art prompt
      </button>
```

- [ ] **Step 5: Wire `DeckBuilder.tsx`**

Add imports with the other builder imports:

```ts
import { ProxyPanel } from "./ProxyPanel";
import { ProxiesSection } from "./ProxiesSection";
import { useProxies } from "@/lib/useProxies";
```

Next to the other `useState` declarations (for example near `historyKey`), add:

```ts
  const proxies = useProxies(deck.id);
  const [proxyCardId, setProxyCardId] = useState<string | null>(null);
```

On the `<CardMenu` element add after `onHistory={...}`:

```tsx
        onProxy={(line) => setProxyCardId(line.cardId)}
```

Directly after the `</div>` that closes the `<div className="mt-16"><StatsSection ... /></div>` block add:

```tsx
      <ProxiesSection lines={withOwned} proxies={proxies} onOpen={setProxyCardId} />
```

Just before the closing `</>` / wrapper at the end of the component (next to `<ImportDialog`), add:

```tsx
      <ProxyPanel
        open={proxyCardId !== null}
        onClose={() => setProxyCardId(null)}
        cardId={proxyCardId}
        cardName={lines.find((l) => l.cardId === proxyCardId)?.name ?? ""}
        proxies={proxies}
        onNotify={setToast}
      />
```

If `lines` is named differently in `DeckBuilder`, use the array that `withOwned` is derived from; `grep -n "withOwned" frontend/src/components/builder/DeckBuilder.tsx` shows it.

- [ ] **Step 6: Typecheck and run the logic tests**

Run: `cd frontend && npm run typecheck && npm test`
Expected: no type errors; all `node --test` files pass including `proxy.test.ts`.

- [ ] **Step 7: Commit**

```bash
git add frontend/src
git commit -m "Add the proxy panel, the Proxies section and the batch generate"
```

---

## Task 11: Verify in the running app

**Files:** none.

- [ ] **Step 1: Start the stack with a key**

```bash
docker compose up -d db
cd backend && EREGION_LLM_API_KEY=<your DeepSeek key> EREGION_JWT_SECRET=$(openssl rand -base64 48) ./mvnw spring-boot:run
cd frontend && npm run dev
```

The backend process must be able to reach `api.deepseek.com`. If the JVM cannot connect while `curl` can (as happened in the earlier session), run it from your own terminal, not from the assistant's sandbox.

- [ ] **Step 2: Load the lore and cards**

Open a deck containing Esper Sentinel and Lord of the Void. Scroll to **Proxies**. Paste the contents of `/Users/rodgz_mac/Developer/MTG-CardMaker/assets/cardconjurer/mtg-reskin/themes/vast-accord.md` into the lore box, set parameters (for example `--ar 5:7 --style raw --v 7`), click Save.

- [ ] **Step 3: Check the three cases**

1. Esper Sentinel, **New nickname**. Expect a Lathaar-tier character, calm and gold, in the spirit of the confirmed Sildarion (a coin, a geometric gold pattern, a cliffside). Copy prompt; paste into a text field and confirm the parameters are appended.
2. Lord of the Void, **Keep the name, new art**. Expect no nickname, a Maelgrith-submitted, faceless-but-geometric character, violet as the void light.
3. A card the lore does not cover. Expect a tier chosen from the lore, and a nickname that does not repeat the others.

- [ ] **Step 4: Check refine, history and batch**

Refine one result ("make the robe darker"): expect only that change and a new entry in Earlier results. Click Use this on the older entry: expect the status and prompt to switch back. Tick five cards and Generate: expect a progress bar, about 3 at a time, Cancel stopping new ones, and a failed card marked in its row with the others done.

- [ ] **Step 5: Check the failure paths**

Stop the backend, restart it without `EREGION_LLM_API_KEY`, click Generate: expect "Set EREGION_LLM_API_KEY" in the panel. Another account's deck id on any `/api/decks/{id}/proxies` call returns 404.

- [ ] **Step 6: Report**

Write down what the model produced for the three cards and any rule worth adding to `backend/src/main/resources/proxy-rules.md`. Edit the rules file for anything that drifted, then commit it:

```bash
git add backend/src/main/resources/proxy-rules.md
git commit -m "Tighten the proxy prompt rules after a first run"
```

---

## Self-review against the spec

- Lore text and `mj_params` on the deck: Tasks 1, 6, 8, 10 (lore endpoint, editor, parameters appended on copy).
- `proxy_treatment` unique per `(deck, card)`, outside versions: Task 1.
- `proxy_generation` history, current pick: Tasks 1, 6, 7, 8, 10.
- `LlmClient` + DeepSeek, key from env, clear missing-key message: Tasks 2, 4.
- Prompt service with lore, card, earlier picks, refine context, JSON validation, one retry: Task 3.
- Rules file editable without code: Task 3.
- Server appends `mj_params`, the model is not asked for them: the system rules say so (Task 3) and the copy path appends (Task 9 `fullPrompt`).
- Endpoints (lore get/put, list, generate, history, current), owner-only: Tasks 7, 8.
- Rate limit: Task 5.
- Card panel (mode, generate, refine, history, copy): Task 10.
- Proxies view with status chips, multi-select, batch, progress, cancel, retry of failures, resume of the ones without a treatment: Task 10 (`pending`, `runBatch`).
- Errors: missing key (Task 4), provider failure (Task 4), malformed JSON after retry writes nothing (Tasks 3, 7), empty lore warning (Task 10 panel).
- Tests with fake `LlmClient`, owner-only, current-pick logic, queue logic: Tasks 3, 7, 9. No test calls DeepSeek.
- Manual check with the Vast Accord lore: Task 11.
- Deferred items stay deferred: lore builder, image attach, character reuse, server jobs.

Types used across tasks match: `Mode`, `Character`, `Draft`, `Generation`, `Treatment`, `Pick`, `CardFacts`, `Lore` (Task 2) are the ones used in Tasks 3, 6, 7, 8; frontend `ProxyTreatment`, `ProxyGeneration`, `DeckLore` (Task 9) are the ones used in Task 10. `ProxyService.generate(userId, deckId, cardId, mode, instruction)` is called with that argument order in the controller and the tests. Spec deviation: `character` is stored as `character_json TEXT`, not `jsonb`.
