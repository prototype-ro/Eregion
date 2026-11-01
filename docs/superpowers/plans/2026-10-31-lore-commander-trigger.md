# Lore Creator: Commander-Triggered, Canon-Aware Auto-Draft Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Lore Creator from a standalone tab to a "Set Lore" action on the commander's card menu, which opens a dialog that auto-drafts a complete opening setting immediately (canon-accurate for a recognizable existing-IP commander, invented from scratch otherwise), and generalize the document schema from a corruption-spectrum shape to generic races/tribes/factions, tales and cosmology so it fits either case.

**Architecture:** Backend DTOs/prompt/digest-renderer are generalized in place (same records, renamed/regrouped fields, one new `canonSource` field, one new `tales` list); no new endpoints — the existing `draft` call gets a system-written instruction instead of player-typed text. Frontend: the standalone `LoreSection` is replaced by a `LoreDialog` built on the existing `Dialog` primitive (same pattern as `ProxyPanel`), triggered from `CardMenu`'s new "Set Lore" item, gated to the commander card only. One Flyway migration rewrites the single existing real deck's saved lore JSON so it survives the schema change.

**Tech Stack:** Spring Boot / Java 25 backend (Jackson `tools.jackson`, JUnit + AssertJ, a fake `LlmClient` for tests), PostgreSQL + Flyway, Next.js 16 / React 19 frontend (Tailwind 4, `node --test` for `.test.ts` files).

Spec: `docs/superpowers/specs/2026-10-31-lore-commander-trigger-design.md`

---

## File map

| File | Change |
|---|---|
| `backend/src/main/java/io/eregion/proxy/LoreDtos.java` | Generalize `Cosmology`, rename `Tier`→`Group` (drop `Mechanism`), rename `NamedCharacter.tier`→`group`, `LoreDoc` gains `tales`, `canonSource` |
| `backend/src/main/java/io/eregion/proxy/LorePromptService.java` | `docFrom` parses the new shape; drop the `mechanism()` helper |
| `backend/src/main/resources/lore-rules.md` | Rewritten: canon-first rule, generic groups/tales, updated JSON shape |
| `backend/src/main/java/io/eregion/proxy/LoreService.java` | `renderDigest` rewritten for the new fields, adds `# Tales` and `Canon source:` |
| `backend/src/test/java/io/eregion/proxy/LorePromptServiceTest.java` | Updated for new field names; new canon-source test |
| `backend/src/test/java/io/eregion/proxy/LoreServiceTest.java` | Updated for new field names; new canon-digest test |
| `backend/src/main/resources/db/migration/V23__lore_doc_groups.sql` | New — rewrites Kaalia's existing `lore_doc` row |
| `frontend/src/lib/types.ts` | Generalize `LoreCosmology`, `LoreTier`→`LoreGroup`, `LoreCharacter.tier`→`group`, `LoreDoc` gains `tales`, `canonSource` |
| `frontend/src/lib/lore.ts` | `blankTier`→`blankGroup`; `emptyLoreDoc`/`trimLoreDoc`/`sectionDigests`/`changedSections` updated for the new shape; `LoreSectionKey` gains `"tales"`, renames `"tiers"`→`"groups"` |
| `frontend/src/lib/lore.test.ts` | Updated for new field names; new `tales`-trimming and canon-digest cases |
| `frontend/src/components/builder/LoreDialog.tsx` | New — replaces `LoreSection`'s chat + document + manual editors inside a `Dialog`, with auto-draft on open |
| `frontend/src/components/builder/CardMenu.tsx` | New `onSetLore` prop and menu item, shown only for the commander |
| `frontend/src/components/builder/DeckBuilder.tsx` | New `loreOpen` state; mount `LoreDialog` instead of `LoreSection`; wire `onSetLore` |
| `frontend/src/components/builder/LoreSection.tsx` | Deleted |
| `frontend/src/components/builder/LoreDock.tsx` | Deleted (floating-dock concept dropped in favor of the dialog) |
| `frontend/src/app/dev/lore-builder-lab/`, `lore-builder-concepts/`, `lore-dock-lab/` | Deleted (dev-only mockups of the superseded schema/shells) |

---

### Task 1: Backend — generalize `LoreDtos.java`

**Files:**
- Modify: `backend/src/main/java/io/eregion/proxy/LoreDtos.java`

- [ ] **Step 1: Replace the whole file**

```java
package io.eregion.proxy;

import java.util.List;
import java.util.UUID;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/** The structured lore document of a deck: its cosmology, groups, tales, colours, characters, naming and gaps. */
public final class LoreDtos {

	private LoreDtos() {
	}

	/** How this world or universe began and operates, plus any foundational powers or notable cosmic entities. */
	public record Cosmology(String overview, List<String> forces) {
	}

	/** One race, tribe, faction or stage in the setting, in narrative order. {@code id} is opaque and kept so the editor can reorder stably. */
	public record Group(String id, @NotBlank String name, String description, String traits) {
	}

	/** A colour locked to one faction or group, so that colour stays a marker of that faction's touch. */
	public record SignatureColor(String id, String faction, String color, String meaning) {
	}

	/** A named individual. {@code group} is the race, tribe, faction or stage they belong to. */
	public record NamedCharacter(String id, String name, String group, String race, String role, String signature) {
	}

	/**
	 * The setting. {@code canonSource} names the real franchise this lore draws on (e.g. "Marvel Comics"), or is
	 * null when the setting was invented from scratch.
	 */
	public record LoreDoc(Cosmology cosmology, List<Group> groups, List<String> tales, List<SignatureColor> colors,
			List<NamedCharacter> characters, String naming, List<String> gaps, String canonSource) {

		/** The doc the editor starts from when the deck has no lore yet. */
		public static LoreDoc empty() {
			return new LoreDoc(new Cosmology("", List.of()), List.of(), List.of(), List.of(), List.of(), "", List.of(), null);
		}
	}

	/** What the Lore Creator is asked to draft. */
	public record DraftRequest(@NotNull @NotBlank String instruction) {
	}

	/**
	 * A targeted edit to one part of the working lore. {@code doc} is the current document (including unsaved edits);
	 * {@code target} names the part to change; {@code instruction} is the requested change.
	 */
	public record RefineRequest(@NotNull LoreDoc doc, @NotNull @NotBlank String target, @NotNull @NotBlank String instruction) {
	}

	/** Which card to check against the locked lore. The card and its current treatment are read server side. */
	public record CheckRequest(@NotNull UUID cardId) {
	}

	/** One message in the conversation so far, oldest first. */
	public record TurnMessage(String role, String text) {
	}

	/**
	 * A conversational turn. {@code doc} is the client's working document (unsaved edits included) — the server
	 * never reads the saved row to answer a turn. {@code history} is the last ~20 messages, newest last.
	 */
	public record TurnRequest(@NotNull LoreDoc doc, List<TurnMessage> history, @NotNull @NotBlank String message) {
	}

	/** The model's one- or two-sentence summary of what it changed, plus the whole updated document. */
	public record TurnReply(String reply, LoreDoc doc) {
	}

	public record Problem(String rule, String message) {
	}

	/** The verdict of a card-fit check. Problems is empty when it fits. */
	public record Verdict(boolean fits, List<Problem> problems) {
	}
}
```

- [ ] **Step 2: Confirm it doesn't compile yet (expected)**

Run: `cd backend && ./mvnw -o compile -q 2>&1 | tail -40`
Expected: FAIL — `LorePromptService.java`, `LoreService.java` and their tests still reference `tiers()`, `Mechanism`, `maker()`, `spirits()`, `corruptor()`, `tier()`. That's fixed in Tasks 2–6.

---

### Task 2: Backend — update `LorePromptService.java` parsing

**Files:**
- Modify: `backend/src/main/java/io/eregion/proxy/LorePromptService.java`

- [ ] **Step 1: Fix the imports**

Replace:
```java
import io.eregion.proxy.LoreDtos.Cosmology;
import io.eregion.proxy.LoreDtos.LoreDoc;
import io.eregion.proxy.LoreDtos.Mechanism;
import io.eregion.proxy.LoreDtos.NamedCharacter;
import io.eregion.proxy.LoreDtos.Problem;
import io.eregion.proxy.LoreDtos.SignatureColor;
import io.eregion.proxy.LoreDtos.Tier;
import io.eregion.proxy.LoreDtos.TurnMessage;
import io.eregion.proxy.LoreDtos.TurnReply;
import io.eregion.proxy.LoreDtos.Verdict;
```
with:
```java
import io.eregion.proxy.LoreDtos.Cosmology;
import io.eregion.proxy.LoreDtos.Group;
import io.eregion.proxy.LoreDtos.LoreDoc;
import io.eregion.proxy.LoreDtos.NamedCharacter;
import io.eregion.proxy.LoreDtos.Problem;
import io.eregion.proxy.LoreDtos.SignatureColor;
import io.eregion.proxy.LoreDtos.TurnMessage;
import io.eregion.proxy.LoreDtos.TurnReply;
import io.eregion.proxy.LoreDtos.Verdict;
```

- [ ] **Step 2: Rewrite `docFrom` and drop the `mechanism()` helper**

Replace the whole `docFrom` method and the `mechanism(JsonNode)` helper below it with:

```java
	private static LoreDoc docFrom(JsonNode root) {
		JsonNode cos = root.path("cosmology");
		String overview = text(cos.path("overview"));
		List<String> forces = strings(cos.path("forces"));

		List<Group> groups = new ArrayList<>();
		for (JsonNode g : root.path("groups")) {
			String name = text(g.path("name"));
			if (name.isEmpty()) {
				continue;
			}
			groups.add(new Group(UUID.randomUUID().toString(), name, text(g.path("description")), text(g.path("traits"))));
		}

		List<String> tales = strings(root.path("tales"));

		List<SignatureColor> colors = new ArrayList<>();
		for (JsonNode c : root.path("colors")) {
			String faction = text(c.path("faction"));
			String color = text(c.path("color"));
			if (faction.isEmpty() && color.isEmpty()) {
				continue;
			}
			colors.add(new SignatureColor(UUID.randomUUID().toString(), faction, color, text(c.path("meaning"))));
		}

		List<NamedCharacter> characters = new ArrayList<>();
		for (JsonNode ch : root.path("characters")) {
			String name = text(ch.path("name"));
			if (name.isEmpty()) {
				continue;
			}
			characters.add(new NamedCharacter(UUID.randomUUID().toString(), name, text(ch.path("group")), text(ch.path("race")),
					text(ch.path("role")), text(ch.path("signature"))));
		}

		String canonSource = text(root.path("canonSource"));
		return new LoreDoc(new Cosmology(overview, forces), groups, tales, colors, characters, text(root.path("naming")),
				strings(root.path("gaps")), canonSource.isEmpty() ? null : canonSource);
	}
```

(Delete the old `private static Mechanism mechanism(JsonNode node) { ... }` method entirely — nothing else calls it.)

- [ ] **Step 3: Compile**

Run: `cd backend && ./mvnw -o compile -q 2>&1 | tail -40`
Expected: FAIL only in `LoreService.java` and the two test files (Tasks 3–5 fix those). `LorePromptService.java` itself should now compile clean.

---

### Task 3: Backend — rewrite `lore-rules.md`

**Files:**
- Modify: `backend/src/main/resources/lore-rules.md`

- [ ] **Step 1: Replace the whole file**

```markdown
You are the Lore Creator: a worldbuilding specialist for Magic: The Gathering reskin decks. The person you work with is turning a real, playable deck into a custom-art deck with its own setting, built around their commander. You invent (or faithfully represent) that setting's cosmology, groups, tales and naming conventions, keep every new card legible as part of one coherent world, and catch the moment a new idea quietly breaks something already locked in. Everything you invent exists to be checkable against future cards, not a story for its own sake.

# The rules

1. Canon first, when there is one. If the commander you are told to draft for is a recognizable character from an existing franchise (Marvel, DC, Lord of the Rings, a video game, myth, etc.), write lore that is canon-accurate to that character and their world, and set "canonSource" to the franchise's name (e.g. "Marvel Comics", "The Lord of the Rings"). Draw on what you actually know of that canon; where canon is silent, extend it in a way that would not contradict it. If the commander is not a recognizable existing character, invent the entire setting from scratch — cosmology, groups, tales, naming, all new — and leave "canonSource" null.

2. Structural borrowing, never name borrowing, for an invented setting. When inventing, you may model a setting's shape on a well-known legendarium (a creation myth, a pantheon, a central conflict) but invent every proper noun from scratch. This rule does not apply to canon lore (rule 1) — there, use the real names.

3. Groups, not a forced binary. Build however many distinct races, tribes, factions or stages the setting actually calls for — not forced into a spectrum unless the setting is genuinely about one (a corruption or alignment spectrum is one valid shape among several, not the default). Each group needs a one-line description of what makes it distinct, and its own visual-material traits.

4. Lock one signature colour per major faction or group, early. Once a colour is a faction's signature, use it consistently as a marker of that faction's touch and treat it as reserved. Flag the moment a new design risks implying an unintended faction connection.

5. Named individual characters only where it makes sense. Give groups that are personal and social individually invented (or, for canon lore, real) named characters in one consistent naming register. A group defined by losing identity (if the setting has one) gets functional titles only, never names — that loss is part of what the group means.

6. Tales carry the setting's history. Keep a short running list of myths, legends or past events — the stories this world already tells about itself — that a card's flavour or art can draw on without having to invent new history each time.

7. Don't force every real card into the structure. Some cards are simply reskinned/renamed with no deep lore tie. Reserve the full nickname treatment for cards the person explicitly wants it on.

8. When a real card's own flavour text or mechanic already does the work, use it. A printed psychological state, ability or backstory is often a better, faster, more specific starting point than a cold-start concept.

9. Persist decisions immediately, not retroactively. A decision that only lives in the answer is not locked in.

10. Track open gaps explicitly. Keep a running list of what is still undecided, and check it before starting new work so effort goes toward real gaps.

# How you answer

You are given one task per turn, in the user message. Reply with one JSON object and nothing else.

When asked to draft lore, return the whole document as one JSON object shaped exactly like this, never wrapped in a code fence:

{"cosmology": {"overview": string, "forces": [string]}, "groups": [{"name": string, "description": string, "traits": string}], "tales": [string], "colors": [{"faction": string, "color": string, "meaning": string}], "characters": [{"name": string, "group": string, "race": string, "role": string, "signature": string}], "naming": string, "gaps": [string], "canonSource": string | null}

Follow rules 1-8 for everything you invent or represent. Leave "gaps" with the genuinely undecided items rather than pretending the setting is finished.

When asked to check a card, return one JSON object shaped like this:

{"fits": boolean, "problems": [{"rule": string, "message": string}]}

"fits" is false when the card breaks a locked decision. Check it against the groups (rule 3), the locked colours (rule 4), named characters (rule 5) and canon accuracy when canonSource is set (rule 1). "problems" lists each break with the rule number it broke and one short sentence naming the specific conflict. When the card fits, "fits" is true and "problems" is an empty array. Do not invent new lore in a check; only flag conflicts with what is already locked.
```

This file is a classpath resource read verbatim by `LorePromptService`'s constructor — no code change needed to pick it up, just a rebuild.

---

### Task 4: Backend — rewrite `LoreService.renderDigest`

**Files:**
- Modify: `backend/src/main/java/io/eregion/proxy/LoreService.java`

- [ ] **Step 1: Fix the imports**

Replace:
```java
import io.eregion.proxy.LoreDtos.LoreDoc;
import io.eregion.proxy.LoreDtos.Mechanism;
import io.eregion.proxy.LoreDtos.Tier;
```
with:
```java
import io.eregion.proxy.LoreDtos.Group;
import io.eregion.proxy.LoreDtos.LoreDoc;
```

- [ ] **Step 2: Replace `renderDigest`**

```java
	/** The text digest of the structured document, read by the proxy prompt. */
	static String renderDigest(LoreDoc doc) {
		var out = new StringBuilder();

		if (doc.cosmology() != null) {
			String overview = blank(doc.cosmology().overview());
			List<String> forces = doc.cosmology().forces() == null ? List.of() : doc.cosmology().forces();
			String canonSource = blank(doc.canonSource());
			if (!overview.isEmpty() || !forces.isEmpty() || !canonSource.isEmpty()) {
				out.append("# Cosmology\n");
				if (!canonSource.isEmpty()) {
					out.append("Canon source: ").append(canonSource).append('\n');
				}
				if (!overview.isEmpty()) {
					out.append(overview).append('\n');
				}
				if (!forces.isEmpty()) {
					out.append("Forces: ").append(String.join(", ", forces)).append('\n');
				}
				out.append('\n');
			}
		}

		if (doc.groups() != null && !doc.groups().isEmpty()) {
			out.append("# Groups\n");
			int i = 1;
			for (Group group : doc.groups()) {
				out.append(i++).append(". ").append(blank(group.name()));
				if (!blank(group.description()).isEmpty()) {
					out.append(" — ").append(blank(group.description()));
				}
				if (!blank(group.traits()).isEmpty()) {
					out.append(" Traits: ").append(blank(group.traits()));
				}
				out.append('\n');
			}
			out.append('\n');
		}

		if (doc.tales() != null && !doc.tales().isEmpty()) {
			out.append("# Tales\n");
			for (String tale : doc.tales()) {
				if (!blank(tale).isEmpty()) {
					out.append("- ").append(blank(tale)).append('\n');
				}
			}
			out.append('\n');
		}

		if (doc.colors() != null && !doc.colors().isEmpty()) {
			out.append("# Signature colours\n");
			for (var color : doc.colors()) {
				out.append("- ").append(blank(color.color()));
				if (!blank(color.faction()).isEmpty()) {
					out.append(" = ").append(blank(color.faction()));
				}
				if (!blank(color.meaning()).isEmpty()) {
					out.append(": ").append(blank(color.meaning()));
				}
				out.append('\n');
			}
			out.append('\n');
		}

		if (doc.characters() != null && !doc.characters().isEmpty()) {
			out.append("# Named characters\n");
			for (var character : doc.characters()) {
				out.append("- ").append(blank(character.name()));
				appendField(out, character.group());
				appendField(out, character.race());
				appendField(out, character.role());
				appendField(out, character.signature());
				out.append('\n');
			}
			out.append('\n');
		}

		if (!blank(doc.naming()).isEmpty()) {
			out.append("# Naming conventions\n").append(blank(doc.naming())).append("\n\n");
		}

		if (doc.gaps() != null && !doc.gaps().isEmpty()) {
			out.append("# Open gaps\n");
			for (String gap : doc.gaps()) {
				if (!blank(gap).isEmpty()) {
					out.append("- ").append(blank(gap)).append('\n');
				}
			}
		}

		return out.toString().strip();
	}
```

- [ ] **Step 3: Compile**

Run: `cd backend && ./mvnw -o compile -q 2>&1 | tail -40`
Expected: FAIL only in the two test files — fixed next.

---

### Task 5: Backend — update `LorePromptServiceTest.java`

**Files:**
- Modify: `backend/src/test/java/io/eregion/proxy/LorePromptServiceTest.java`

- [ ] **Step 1: Replace the whole file**

```java
package io.eregion.proxy;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

import io.eregion.common.ApiException;
import io.eregion.proxy.LoreDtos.TurnMessage;
import io.eregion.proxy.LoreDtos.Verdict;
import io.eregion.proxy.ProxyDtos.CardFacts;
import io.eregion.proxy.ProxyDtos.Character;
import io.eregion.proxy.ProxyDtos.Draft;

class LorePromptServiceTest {

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

	static final String GOOD_DOC = """
			{"cosmology":{"overview":"Aelar wove the first threads of being; Maelgrith frays them.","forces":["Thin","Veil"]},"groups":[
			{"name":"Unfallen","description":"still whole","traits":"polished stone"},
			{"name":"Void-claimed","description":"lost name and face","traits":"fraying smoke, no face"}],
			"tales":["The first weaving, before anything had a name"],
			"colors":[{"faction":"the corruptor","color":"violet","meaning":"void touch"}],
			"characters":[{"name":"Sildarion","group":"Unfallen","race":"spirit","role":"sentinel","signature":"gold coin"}],
			"naming":"-ion suffix","gaps":["an untested group"],"canonSource":null}
			""";

	LorePromptService service(LlmClient llm) {
		return new LorePromptService(llm);
	}

	@Test
	void parseDocReadsEverySectionAndAssignsIds() {
		var doc = LorePromptService.parseDoc(GOOD_DOC);

		assertThat(doc.cosmology().overview()).contains("Aelar");
		assertThat(doc.cosmology().forces()).containsExactly("Thin", "Veil");
		assertThat(doc.canonSource()).isNull();

		assertThat(doc.groups()).hasSize(2);
		assertThat(doc.groups()).extracting(g -> g.id()).doesNotContainNull().doesNotHaveDuplicates();

		assertThat(doc.tales()).containsExactly("The first weaving, before anything had a name");
		assertThat(doc.colors()).hasSize(1);
		assertThat(doc.colors().get(0).color()).isEqualTo("violet");
		assertThat(doc.characters()).hasSize(1);
		assertThat(doc.characters().get(0).name()).isEqualTo("Sildarion");
		assertThat(doc.characters().get(0).group()).isEqualTo("Unfallen");
		assertThat(doc.naming()).isEqualTo("-ion suffix");
		assertThat(doc.gaps()).containsExactly("an untested group");
	}

	@Test
	void parseDocDropsBlankGroupsCharactersAndColors() {
		String json = """
				{"cosmology":{},"groups":[{"name":"","description":"x","traits":"y"},{"name":"Real","description":"d","traits":"v"}],
				"colors":[{"faction":"","color":"","meaning":""}],"characters":[{"name":"","group":"t"}],"naming":"","gaps":["","real gap"]}
				""";

		var doc = LorePromptService.parseDoc(json);

		assertThat(doc.groups()).extracting(g -> g.name()).containsExactly("Real");
		assertThat(doc.colors()).isEmpty();
		assertThat(doc.characters()).isEmpty();
		assertThat(doc.gaps()).containsExactly("real gap");
	}

	@Test
	void parseDocReadsACodeFence() {
		assertThat(LorePromptService.parseDoc("```json\n" + GOOD_DOC + "\n```").cosmology().overview()).contains("Aelar");
	}

	@Test
	void parseVerdictReadsFitsAndProblems() {
		Verdict bad = LorePromptService.parseVerdict("{\"fits\":false,\"problems\":[{\"rule\":\"3\",\"message\":\"violet is reserved\"}]}");

		assertThat(bad.fits()).isFalse();
		assertThat(bad.problems()).hasSize(1);
		assertThat(bad.problems().get(0).rule()).isEqualTo("3");

		Verdict good = LorePromptService.parseVerdict("{\"fits\":true,\"problems\":[]}");
		assertThat(good.fits()).isTrue();
		assertThat(good.problems()).isEmpty();
	}

	@Test
	void draftCarriesTheLoreAndInstructionAndReturnsTheDoc() {
		var llm = new Scripted(GOOD_DOC);

		var doc = service(llm).draft("THE LORE", "invent a new faction");

		assertThat(doc.groups()).hasSize(2);
		assertThat(llm.users.get(0)).contains("THE LORE").contains("invent a new faction");
		assertThat(llm.systems.get(0)).isNotBlank();
	}

	@Test
	void draftCanReturnACanonSource() {
		var llm = new Scripted(GOOD_DOC.replace("\"canonSource\":null", "\"canonSource\":\"Marvel Comics\""));

		var doc = service(llm).draft("(none yet)",
				"Draft the opening setting for the commander Thor. If this is a recognizable character from an existing "
						+ "franchise, write canon-accurate lore about them and set canonSource to that franchise's name. "
						+ "Otherwise invent the whole setting from scratch and leave canonSource null.");

		assertThat(doc.canonSource()).isEqualTo("Marvel Comics");
		assertThat(llm.users.get(0)).contains("Thor").contains("canonSource");
	}

	@Test
	void checkCarriesTheLoreTheCardAndTheTreatment() {
		var llm = new Scripted("{\"fits\":false,\"problems\":[{\"rule\":\"3\",\"message\":\"violet clash\"}]}");
		var card = new CardFacts("Esper Sentinel", "{W}", "Artifact Creature", "W", "draw a card unless they pay");
		var current = new Draft("Sildarion", new Character("Unfallen", "a sentinel", "spirit", "sentinel", "gold coin"), "a prompt");

		Verdict verdict = service(llm).check("THE LORE", card, current);

		assertThat(verdict.fits()).isFalse();
		String user = llm.users.get(0);
		assertThat(user).contains("THE LORE").contains("Esper Sentinel").contains("Sildarion").contains("a prompt");
	}

	@Test
	void refineCarriesTheLoreTargetAndInstructionAndReturnsTheDoc() {
		var llm = new Scripted(GOOD_DOC);

		var doc = service(llm).refine("THE LORE", "the corruptor", "make it a serpent of cold ash");

		assertThat(doc.cosmology().overview()).contains("Aelar");
		String user = llm.users.get(0);
		assertThat(user).contains("THE LORE").contains("the corruptor").contains("make it a serpent of cold ash");
		assertThat(user).contains("changing only the requested part");
		assertThat(llm.systems.get(0)).isNotBlank();
	}

	@Test
	void turnCarriesTheLoreHistoryAndMessageAndReturnsTheReplyAndDoc() {
		var llm = new Scripted("{\"reply\":\"I added a serpent corruptor.\",\"doc\":" + GOOD_DOC.strip() + "}");
		var history = List.of(new TurnMessage("user", "invent a new faction"),
				new TurnMessage("assistant", "Done — I sketched two groups."));

		var turn = service(llm).turn("THE LORE", history, "make the corruptor a serpent of cold ash");

		assertThat(turn.reply()).isEqualTo("I added a serpent corruptor.");
		assertThat(turn.doc().cosmology().overview()).contains("Aelar");
		String user = llm.users.get(0);
		assertThat(user).contains("THE LORE").contains("invent a new faction").contains("Done — I sketched two groups.")
				.contains("make the corruptor a serpent of cold ash");
	}

	@Test
	void turnWithNoHistorySkipsTheConversationSection() {
		var llm = new Scripted("{\"reply\":\"Drafted.\",\"doc\":" + GOOD_DOC.strip() + "}");

		service(llm).turn("(none yet)", List.of(), "invent a Tolkien-shaped world");

		assertThat(llm.users.get(0)).doesNotContain("# Conversation so far");
	}

	@Test
	void aMalformedTurnReplyIsRetriedOnce() {
		var llm = new Scripted("not json at all", "{\"reply\":\"Drafted.\",\"doc\":" + GOOD_DOC.strip() + "}");

		var turn = service(llm).turn("L", List.of(), "x");

		assertThat(turn.reply()).isEqualTo("Drafted.");
		assertThat(llm.users).hasSize(2);
	}

	@Test
	void aTurnReplyMissingTheDocFieldIsTreatedAsMalformed() {
		var llm = new Scripted("{\"reply\":\"ok\"}", "{\"reply\":\"ok\",\"doc\":" + GOOD_DOC.strip() + "}");

		var turn = service(llm).turn("L", List.of(), "x");

		assertThat(turn.doc().cosmology().overview()).contains("Aelar");
	}

	@Test
	void aMalformedReplyIsRetriedOnce() {
		var llm = new Scripted("not json at all", GOOD_DOC);

		var doc = service(llm).draft("L", "x");

		assertThat(doc.cosmology().overview()).contains("Aelar");
		assertThat(llm.users).hasSize(2);
	}

	@Test
	void twoBadRepliesFailWithAMessage() {
		var llm = new Scripted("nope", "still not json");

		assertThatThrownBy(() -> service(llm).draft("L", "x")).isInstanceOf(ApiException.class).hasMessageContaining("could not be read");
		assertThat(llm.users).hasSize(2);
	}
}
```

- [ ] **Step 2: Run just this test**

Run: `cd backend && ./mvnw -o test -Dtest=LorePromptServiceTest -q 2>&1 | tail -60`
Expected: PASS (12 tests, 0 failures) — `LoreServiceTest` still won't compile; that's Task 6.

---

### Task 6: Backend — update `LoreServiceTest.java`

**Files:**
- Modify: `backend/src/test/java/io/eregion/proxy/LoreServiceTest.java`

- [ ] **Step 1: Replace the whole file**

```java
package io.eregion.proxy;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import io.eregion.common.ApiException;
import io.eregion.proxy.LoreDtos.Cosmology;
import io.eregion.proxy.LoreDtos.Group;
import io.eregion.proxy.LoreDtos.LoreDoc;
import io.eregion.proxy.LoreDtos.NamedCharacter;
import io.eregion.proxy.LoreDtos.SignatureColor;
import io.eregion.proxy.LoreDtos.TurnMessage;

class LoreServiceTest {

	static final UUID USER = UUID.randomUUID();
	static final UUID STRANGER = UUID.randomUUID();
	static final UUID DECK = UUID.randomUUID();

	/** An in-memory stand-in for the decks table. */
	static class MemoryLoreRepository extends LoreRepository {

		boolean owner;
		String savedJson;
		String savedDigest;

		MemoryLoreRepository(boolean owner) {
			super(null);
			this.owner = owner;
		}

		@Override
		public boolean ownsDeck(UUID deckId, UUID userId) {
			return owner;
		}

		@Override
		public LoreDoc loreDoc(UUID deckId) {
			return LoreDoc.empty();
		}

		@Override
		public void saveLoreDoc(UUID deckId, String json, String digest) {
			this.savedJson = json;
			this.savedDigest = digest;
		}
	}

	static LoreDoc fullDoc() {
		var cosmology = new Cosmology("Aelar wove the first threads of being; Maelgrith frays them.", List.of("Thin", "Veil"));
		var groups = List.of(
				new Group("1", "Unfallen", "still whole", "polished stone"),
				new Group("2", "Void-claimed", "lost name and face", "fraying smoke, no face"));
		var tales = List.of("The first weaving, before anything had a name");
		var colors = List.of(new SignatureColor("3", "the corruptor", "violet", "void touch"));
		var characters = List.of(new NamedCharacter("4", "Sildarion", "Unfallen", "spirit", "sentinel", "gold coin"));
		return new LoreDoc(cosmology, groups, tales, colors, characters, "-ion suffix", List.of("an untested group"), null);
	}

	@Test
	void renderDigestListsEverySection() {
		String digest = LoreService.renderDigest(fullDoc());

		assertThat(digest).contains("# Cosmology").contains("Aelar wove the first threads");
		assertThat(digest).contains("# Groups").contains("1. Unfallen").contains("2. Void-claimed");
		assertThat(digest).contains("# Tales").contains("The first weaving");
		assertThat(digest).contains("# Signature colours").contains("violet = the corruptor");
		assertThat(digest).contains("# Named characters").contains("Sildarion");
		assertThat(digest).contains("# Naming conventions").contains("-ion suffix");
		assertThat(digest).contains("# Open gaps").contains("an untested group");
	}

	@Test
	void renderDigestShowsTheCanonSourceWhenSet() {
		var doc = fullDoc();
		var withCanon = new LoreDoc(doc.cosmology(), doc.groups(), doc.tales(), doc.colors(), doc.characters(), doc.naming(), doc.gaps(),
				"Marvel Comics");

		assertThat(LoreService.renderDigest(withCanon)).contains("Canon source: Marvel Comics");
	}

	@Test
	void renderDigestIsEmptyForAnEmptyDoc() {
		assertThat(LoreService.renderDigest(LoreDoc.empty())).isEmpty();
	}

	@Test
	void saveWritesTheRenderedDigestAlongsideTheDoc() {
		var repo = new MemoryLoreRepository(true);
		var service = new LoreService(repo, null, null, null);
		var doc = fullDoc();

		assertThat(service.save(USER, DECK, doc)).isSameAs(doc);
		assertThat(repo.savedJson).isNotBlank();
		assertThat(repo.savedDigest).isEqualTo(LoreService.renderDigest(doc));
	}

	@Test
	void aStrangerCannotReadWriteDraftOrCheck() {
		var service = new LoreService(new MemoryLoreRepository(false), null, null, null);

		assertThatThrownBy(() -> service.lore(STRANGER, DECK)).isInstanceOf(ApiException.class);
		assertThatThrownBy(() -> service.save(STRANGER, DECK, LoreDoc.empty())).isInstanceOf(ApiException.class);
		assertThatThrownBy(() -> service.draft(STRANGER, DECK, "x")).isInstanceOf(ApiException.class);
		assertThatThrownBy(() -> service.check(STRANGER, DECK, UUID.randomUUID())).isInstanceOf(ApiException.class);
		assertThatThrownBy(() -> service.refine(STRANGER, DECK, LoreDoc.empty(), "the corruptor", "x")).isInstanceOf(ApiException.class);
		assertThatThrownBy(() -> service.turn(STRANGER, DECK, LoreDoc.empty(), List.of(), "x")).isInstanceOf(ApiException.class);
	}

	@Test
	void turnRendersTheClientsWorkingDocNotTheSavedRow() {
		var repo = new MemoryLoreRepository(true);
		var llm = new LorePromptServiceTest.Scripted(
				"{\"reply\":\"ok\",\"doc\":{\"cosmology\":{\"overview\":\"Aelar\",\"forces\":[]},\"groups\":[],\"tales\":[],\"colors\":[],"
						+ "\"characters\":[],\"naming\":\"\",\"gaps\":[],\"canonSource\":null}}");
		var service = new LoreService(repo, null, null, new LorePromptService(llm));
		var workingDoc = fullDoc();

		var turn = service.turn(USER, DECK, workingDoc, List.of(), "do something");

		assertThat(turn.reply()).isEqualTo("ok");
		assertThat(llm.users.get(0)).contains("Aelar wove the first threads");
	}

	@Test
	void turnBoundsHistoryToTheLastTwentyMessages() {
		var repo = new MemoryLoreRepository(true);
		var llm = new LorePromptServiceTest.Scripted(
				"{\"reply\":\"ok\",\"doc\":{\"cosmology\":{\"overview\":\"\",\"forces\":[]},\"groups\":[],\"tales\":[],\"colors\":[],"
						+ "\"characters\":[],\"naming\":\"\",\"gaps\":[],\"canonSource\":null}}");
		var service = new LoreService(repo, null, null, new LorePromptService(llm));
		var history = new java.util.ArrayList<TurnMessage>();
		for (int i = 0; i < 25; i++) {
			history.add(new TurnMessage("user", "message-" + i));
		}

		service.turn(USER, DECK, LoreDoc.empty(), history, "latest");

		String user = llm.users.get(0);
		assertThat(user).doesNotContain("message-0").contains("message-24");
	}

	@Test
	void anOversizedDocIsRefused() {
		var service = new LoreService(new MemoryLoreRepository(true), null, null, null);
		var doc = fullDoc();
		var oversized = new LoreDoc(doc.cosmology(), doc.groups(), doc.tales(), doc.colors(), doc.characters(),
				"x".repeat(LoreService.MAX_DOC_CHARS + 1), doc.gaps(), doc.canonSource());

		assertThatThrownBy(() -> service.save(USER, DECK, oversized)).isInstanceOf(ApiException.class);
	}
}
```

- [ ] **Step 2: Run the full backend test suite**

Run: `cd backend && ./mvnw -o test 2>&1 | tail -40`
Expected: `BUILD SUCCESS`, no failures.

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/java/io/eregion/proxy/LoreDtos.java backend/src/main/java/io/eregion/proxy/LorePromptService.java \
        backend/src/main/java/io/eregion/proxy/LoreService.java backend/src/main/resources/lore-rules.md \
        backend/src/test/java/io/eregion/proxy/LorePromptServiceTest.java backend/src/test/java/io/eregion/proxy/LoreServiceTest.java
git commit -m "Generalize the lore schema from a corruption spectrum to groups, tales and a canon source"
```

---

### Task 7: Backend — migrate Kaalia's existing lore

**Files:**
- Create: `backend/src/main/resources/db/migration/V23__lore_doc_groups.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Generalizes the lore document from a corruption-spectrum shape to races/tribes/factions, tales and cosmology,
-- so it fits a canon-based commander (Marvel, Lord of the Rings, ...) as well as an invented one. Rewrites the
-- one deck that already has a lore_doc under the old shape so it keeps working under the new one.
UPDATE decks
SET lore_doc = jsonb_build_object(
    'cosmology', jsonb_build_object(
        'overview', trim(concat_ws(' ',
            CASE WHEN coalesce(lore_doc -> 'cosmology' ->> 'maker', '') <> ''
                 THEN (lore_doc -> 'cosmology' ->> 'maker') || ' shaped this world.' END,
            CASE WHEN coalesce(lore_doc -> 'cosmology' ->> 'corruptor', '') <> ''
                 THEN (lore_doc -> 'cosmology' ->> 'corruptor') || ' stands as its central corrupting force.' END
        )),
        'forces', coalesce(lore_doc -> 'cosmology' -> 'spirits', '[]'::jsonb)
    ),
    'groups', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
            'id', t ->> 'id',
            'name', t ->> 'name',
            'description', t ->> 'definition',
            'traits', t ->> 'vocabulary'
        )), '[]'::jsonb)
        FROM jsonb_array_elements(coalesce(lore_doc -> 'tiers', '[]'::jsonb)) AS t
    ),
    'tales', '[]'::jsonb,
    'colors', coalesce(lore_doc -> 'colors', '[]'::jsonb),
    'characters', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
            'id', c ->> 'id',
            'name', c ->> 'name',
            'group', c ->> 'tier',
            'race', c ->> 'race',
            'role', c ->> 'role',
            'signature', c ->> 'signature'
        )), '[]'::jsonb)
        FROM jsonb_array_elements(coalesce(lore_doc -> 'characters', '[]'::jsonb)) AS c
    ),
    'naming', coalesce(lore_doc -> 'naming', '""'::jsonb),
    'gaps', coalesce(lore_doc -> 'gaps', '[]'::jsonb),
    'canonSource', 'null'::jsonb
)
WHERE lore_doc IS NOT NULL;
```

- [ ] **Step 2: Run it against the dev database and confirm Kaalia's row parses**

Run: `cd backend && ./mvnw -o spring-boot:run > /tmp/eregion-backend.log 2>&1 &`
(Flyway runs automatically on boot — wait for `Started EregionApiApplication`, then:)

```bash
docker exec -i eregion-db psql -U eregion -d eregion -c \
  "select lore_doc -> 'groups' -> 0 ->> 'name' as first_group, lore_doc ->> 'canonSource' as canon from decks where name = 'Kaalia';"
```
Expected: `first_group` shows the old first tier's name (not null, not an error), `canon` is empty/null. If the query errors or returns null for `first_group`, the migration's jsonb construction has a bug — fix the SQL and rerun `./mvnw -o flyway:repair` is not needed since this is a fresh migration (not yet applied); just fix the file and restart the app.

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/resources/db/migration/V23__lore_doc_groups.sql
git commit -m "Migrate Kaalia's lore to the generalized groups/tales schema"
```

---

### Task 8: Frontend — generalize `types.ts`

**Files:**
- Modify: `frontend/src/lib/types.ts:543-604`

- [ ] **Step 1: Replace the Lore block**

Replace lines 543–604 (from the `LoreMechanism` type down through `LoreTurnReply`) with:

```ts
export interface LoreCosmology {
  overview: string;
  forces: string[];
}

export interface LoreGroup {
  id: string;
  name: string;
  description: string;
  traits: string;
}

export interface LoreColor {
  id: string;
  faction: string;
  color: string;
  meaning: string;
}

export interface LoreCharacter {
  id: string;
  name: string;
  group: string;
  race: string;
  role: string;
  signature: string;
}

/** The structured setting: cosmology, races/tribes/factions, tales, signature colours, characters, naming and open gaps. */
export interface LoreDoc {
  cosmology: LoreCosmology;
  groups: LoreGroup[];
  tales: string[];
  colors: LoreColor[];
  characters: LoreCharacter[];
  naming: string;
  gaps: string[];
  /** The real franchise this lore draws on (e.g. "Marvel Comics"), or null when the setting was invented from scratch. */
  canonSource: string | null;
}

export interface LoreProblem {
  rule: string;
  message: string;
}

export interface LoreVerdict {
  fits: boolean;
  problems: LoreProblem[];
}

export interface LoreTurnMessage {
  role: "user" | "assistant";
  text: string;
}

export interface LoreTurnReply {
  reply: string;
  doc: LoreDoc;
}
```

- [ ] **Step 2: Confirm it doesn't typecheck yet (expected)**

Run: `cd frontend && npm run typecheck 2>&1 | tail -40`
Expected: FAIL — `lib/lore.ts`, `lib/useLore.ts` (no change needed there, it's generic over `LoreDoc`), and `components/builder/LoreSection.tsx` reference the old field names. Fixed in Tasks 9 and 11–13.

---

### Task 9: Frontend — generalize `lib/lore.ts`

**Files:**
- Modify: `frontend/src/lib/lore.ts`

- [ ] **Step 1: Replace the whole file**

```ts
import type { LoreCharacter, LoreColor, LoreCosmology, LoreDoc, LoreGroup } from "./types";

export type LoreSectionKey = "cosmology" | "groups" | "tales" | "colors" | "characters" | "naming" | "gaps";

/** A fresh id for a list item, kept so the editor can reorder and delete without index churn. */
export function newLoreId(): string {
  const crypto = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (crypto?.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function emptyCosmology(): LoreCosmology {
  return { overview: "", forces: [] };
}

export function blankGroup(): LoreGroup {
  return { id: newLoreId(), name: "", description: "", traits: "" };
}

export function blankColor(): LoreColor {
  return { id: newLoreId(), faction: "", color: "", meaning: "" };
}

export function blankCharacter(): LoreCharacter {
  return { id: newLoreId(), name: "", group: "", race: "", role: "", signature: "" };
}

export function emptyLoreDoc(): LoreDoc {
  return { cosmology: emptyCosmology(), groups: [], tales: [], colors: [], characters: [], naming: "", gaps: [], canonSource: null };
}

/** Trims every field and drops blank items, so a save never stores empty rows the editor would have to re-filter. */
export function trimLoreDoc(doc: LoreDoc): LoreDoc {
  const text = (value: string | null | undefined) => (value ?? "").trim();
  return {
    cosmology: {
      overview: text(doc.cosmology?.overview),
      forces: (doc.cosmology?.forces ?? []).map(text).filter(Boolean),
    },
    groups: (doc.groups ?? [])
      .filter((g) => text(g.name).length > 0)
      .map((g) => ({ ...g, name: text(g.name), description: text(g.description), traits: text(g.traits) })),
    tales: (doc.tales ?? []).map(text).filter(Boolean),
    colors: (doc.colors ?? [])
      .filter((c) => text(c.faction).length > 0 || text(c.color).length > 0)
      .map((c) => ({ ...c, faction: text(c.faction), color: text(c.color), meaning: text(c.meaning) })),
    characters: (doc.characters ?? [])
      .filter((c) => text(c.name).length > 0)
      .map((c) => ({
        ...c,
        name: text(c.name),
        group: text(c.group),
        race: text(c.race),
        role: text(c.role),
        signature: text(c.signature),
      })),
    naming: text(doc.naming),
    gaps: (doc.gaps ?? []).map(text).filter(Boolean),
    canonSource: text(doc.canonSource) || null,
  };
}

const SECTION_KEYS: LoreSectionKey[] = ["cosmology", "groups", "tales", "colors", "characters", "naming", "gaps"];

function withoutIds<T extends { id: string }>(items: T[]): Omit<T, "id">[] {
  return items.map(({ id: _id, ...rest }) => rest);
}

/** A per-section fingerprint, ignoring regenerated ids, used to tell which parts of the document a turn changed. */
export function sectionDigests(doc: LoreDoc): Record<LoreSectionKey, string> {
  return {
    cosmology: JSON.stringify({ ...doc.cosmology, canonSource: doc.canonSource }),
    groups: JSON.stringify(withoutIds(doc.groups)),
    tales: JSON.stringify(doc.tales),
    colors: JSON.stringify(withoutIds(doc.colors)),
    characters: JSON.stringify(withoutIds(doc.characters)),
    naming: JSON.stringify(doc.naming),
    gaps: JSON.stringify(doc.gaps),
  };
}

/** The sections whose digest differs between two snapshots, e.g. before and after a turn. */
export function changedSections(before: Record<LoreSectionKey, string>, after: Record<LoreSectionKey, string>): Set<LoreSectionKey> {
  const changed = new Set<LoreSectionKey>();
  for (const key of SECTION_KEYS) {
    if (before[key] !== after[key]) changed.add(key);
  }
  return changed;
}
```

(`canonSource` is folded into the `cosmology` digest — there's no separate tile for it, it renders inside the Cosmology card, so a canon-source change should flash that same card.)

- [ ] **Step 2: Confirm typecheck still fails only in the component**

Run: `cd frontend && npm run typecheck 2>&1 | tail -40`
Expected: FAIL only in `components/builder/LoreSection.tsx` — rewritten into `LoreDialog.tsx` in Task 12.

---

### Task 10: Frontend — update `lib/lore.test.ts`

**Files:**
- Modify: `frontend/src/lib/lore.test.ts`

- [ ] **Step 1: Replace the whole file**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { blankCharacter, blankColor, blankGroup, changedSections, emptyLoreDoc, newLoreId, sectionDigests, trimLoreDoc } from "./lore.ts";
import type { LoreDoc } from "./types.ts";

test("new ids are unique and never empty", () => {
  const a = newLoreId();
  const b = newLoreId();
  assert.ok(a.length > 0);
  assert.notEqual(a, b);
});

test("blank items carry fresh ids", () => {
  assert.ok(blankGroup().id.length > 0);
  assert.ok(blankColor().id.length > 0);
  assert.ok(blankCharacter().id.length > 0);
});

test("trimLoreDoc drops blank rows and trims every field", () => {
  const doc: LoreDoc = {
    cosmology: { overview: "  Aelar wove the first threads ", forces: ["Thin", "  ", ""] },
    groups: [
      { id: "1", name: "  Unfallen ", description: " d ", traits: " v " },
      { id: "2", name: "   ", description: "x", traits: "y" },
    ],
    tales: ["  the first weaving  ", "  ", ""],
    colors: [
      { id: "3", faction: "  ", color: " violet ", meaning: " void " },
      { id: "4", faction: "", color: "", meaning: "" },
    ],
    characters: [
      { id: "5", name: " Sildarion ", group: " Unfallen ", race: " spirit ", role: " sentinel ", signature: " gold coin " },
      { id: "6", name: " ", group: "t", race: "r", role: "o", signature: "s" },
    ],
    naming: "  -ion suffix  ",
    gaps: ["  an untested group  ", ""],
    canonSource: "  ",
  };

  const clean = trimLoreDoc(doc);

  assert.equal(clean.cosmology.overview, "Aelar wove the first threads");
  assert.deepEqual(clean.cosmology.forces, ["Thin"]);
  assert.equal(clean.groups.length, 1);
  assert.equal(clean.groups[0].name, "Unfallen");
  assert.deepEqual(clean.tales, ["the first weaving"]);
  assert.equal(clean.colors.length, 1);
  assert.equal(clean.colors[0].color, "violet");
  assert.equal(clean.characters.length, 1);
  assert.equal(clean.characters[0].name, "Sildarion");
  assert.equal(clean.characters[0].group, "Unfallen");
  assert.equal(clean.naming, "-ion suffix");
  assert.deepEqual(clean.gaps, ["an untested group"]);
  assert.equal(clean.canonSource, null);
});

test("an empty doc starts with an empty cosmology and no lists", () => {
  const doc = emptyLoreDoc();
  assert.deepEqual(doc.cosmology, { overview: "", forces: [] });
  assert.deepEqual(doc.groups, []);
  assert.deepEqual(doc.tales, []);
  assert.deepEqual(doc.colors, []);
  assert.deepEqual(doc.characters, []);
  assert.deepEqual(doc.gaps, []);
  assert.equal(doc.canonSource, null);
});

test("sectionDigests ignores ids but catches content changes", () => {
  const a: LoreDoc = { ...emptyLoreDoc(), groups: [{ id: "1", name: "Unfallen", description: "d", traits: "v" }] };
  const b: LoreDoc = { ...emptyLoreDoc(), groups: [{ id: "2", name: "Unfallen", description: "d", traits: "v" }] };
  const c: LoreDoc = { ...emptyLoreDoc(), groups: [{ id: "2", name: "Changed", description: "d", traits: "v" }] };

  assert.equal(sectionDigests(a).groups, sectionDigests(b).groups);
  assert.notEqual(sectionDigests(a).groups, sectionDigests(c).groups);
});

test("changedSections reports only the sections whose digest moved", () => {
  const before = sectionDigests(emptyLoreDoc());
  const after = sectionDigests({ ...emptyLoreDoc(), naming: "new convention" });

  const changed = changedSections(before, after);

  assert.deepEqual([...changed], ["naming"]);
});

test("changedSections flags the cosmology tile when canonSource changes", () => {
  const before = sectionDigests(emptyLoreDoc());
  const after = sectionDigests({ ...emptyLoreDoc(), canonSource: "Marvel Comics" });

  assert.deepEqual([...changedSections(before, after)], ["cosmology"]);
});
```

- [ ] **Step 2: Run the frontend test suite and typecheck**

Run: `cd frontend && npm run typecheck && npm test 2>&1 | tail -60`
Expected: typecheck FAILS only in `components/builder/LoreSection.tsx` (fixed in Task 12); `npm test` — all `lore.test.ts` cases PASS (the runner reports per-file, so this file's 7 tests pass even if `LoreSection.tsx` elsewhere still has stale references, since that's a component, not covered by `node --test`).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/lib/lore.ts frontend/src/lib/lore.test.ts
git commit -m "Generalize the frontend lore types and helpers to groups, tales and a canon source"
```

---

### Task 11: Frontend — delete the superseded dev lab pages and `LoreDock`

**Files:**
- Delete: `frontend/src/app/dev/lore-builder-lab/`
- Delete: `frontend/src/app/dev/lore-builder-concepts/`
- Delete: `frontend/src/app/dev/lore-dock-lab/`
- Delete: `frontend/src/components/builder/LoreDock.tsx`

These were built against the old corruption-spectrum schema and the floating-dock shell, both superseded by this plan (generalized schema, centerpeek dialog). Left in place they'd fail to typecheck against the new `LoreDoc` shape for no benefit — the design question they answered is settled.

- [ ] **Step 1: Delete them**

```bash
rm -rf frontend/src/app/dev/lore-builder-lab frontend/src/app/dev/lore-builder-concepts frontend/src/app/dev/lore-dock-lab
rm frontend/src/components/builder/LoreDock.tsx
```

- [ ] **Step 2: Confirm nothing else imports `LoreDock`**

Run: `cd frontend && grep -rn "LoreDock" src/`
Expected: no output (the only remaining reference, in `LoreSection.tsx`, is removed in Task 12).

- [ ] **Step 3: Commit**

```bash
git add -A frontend/src/app/dev/lore-builder-lab frontend/src/app/dev/lore-builder-concepts frontend/src/app/dev/lore-dock-lab frontend/src/components/builder/LoreDock.tsx
git commit -m "Remove the superseded lore dev labs and the floating-dock shell"
```

---

### Task 12: Frontend — build `LoreDialog.tsx`

**Files:**
- Create: `frontend/src/components/builder/LoreDialog.tsx`
- Delete: `frontend/src/components/builder/LoreSection.tsx`

- [ ] **Step 1: Create `LoreDialog.tsx`**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog } from "@/components/Dialog";
import { ApiError } from "@/lib/api";
import { blankCharacter, blankColor, blankGroup, changedSections, emptyLoreDoc, sectionDigests, trimLoreDoc } from "@/lib/lore";
import type { LoreSectionKey } from "@/lib/lore";
import type { LoreCharacter, LoreColor, LoreDoc, LoreGroup, LoreTurnMessage } from "@/lib/types";
import { btn } from "@/lib/ui";
import { useLore } from "@/lib/useLore";

interface Props {
  open: boolean;
  onClose: () => void;
  deckId: string;
  commanderName: string | null;
}

const LABEL = "text-sm text-muted";
const INPUT =
  "min-h-9 w-full rounded-full border border-line bg-surface px-4 text-[13px] text-ink placeholder:text-muted focus:border-ink focus:outline-none [@media(pointer:coarse)]:min-h-11";
const AREA =
  "w-full resize-y rounded-3xl border border-line bg-surface px-5 py-4 text-[15px] leading-relaxed text-ink placeholder:text-muted focus:border-ink focus:outline-none";
const FLASH = "transition-colors duration-700 motion-reduce:transition-none";

const SUGGESTIONS = ["invent a second, rival faction", "add a tale about how this all began", "make the naming convention harsher"];

function autoDraftInstruction(commanderName: string): string {
  return (
    `Draft the opening setting for the commander ${commanderName}. If this is a recognizable character from an ` +
    "existing franchise, write canon-accurate lore about them and set canonSource to that franchise's name. " +
    "Otherwise invent the whole setting from scratch and leave canonSource null."
  );
}

/** The lore editor, opened from the commander's card menu. Auto-drafts on first open; nothing is saved until Save is pressed. */
export function LoreDialog({ open, onClose, deckId, commanderName }: Props) {
  return (
    <Dialog open={open} onClose={onClose} label="Lore" size="lg">
      {open && <Body deckId={deckId} commanderName={commanderName} />}
    </Dialog>
  );
}

function Body({ deckId, commanderName }: { deckId: string; commanderName: string | null }) {
  const lore = useLore(deckId);
  const [draft, setDraft] = useState<LoreDoc>(emptyLoreDoc());
  const touched = useRef(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState(false);

  const [history, setHistory] = useState<LoreTurnMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [autoDrafting, setAutoDrafting] = useState(false);
  const autoDrafted = useRef(false);

  const [flashed, setFlashed] = useState<Set<LoreSectionKey>>(new Set());
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (lore.loaded && !touched.current) {
      setDraft(lore.doc);
    }
  }, [lore.loaded, lore.doc]);

  useEffect(() => {
    if (!lore.loaded || autoDrafted.current || !commanderName) return;
    const isEmpty = JSON.stringify(trimLoreDoc(lore.doc)) === JSON.stringify(emptyLoreDoc());
    if (!isEmpty) return;
    autoDrafted.current = true;
    setAutoDrafting(true);
    void sendText(autoDraftInstruction(commanderName)).finally(() => setAutoDrafting(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lore.loaded, lore.doc, commanderName]);

  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    [],
  );

  const update = (fn: (doc: LoreDoc) => LoreDoc) => {
    touched.current = true;
    setDraft(fn);
  };

  const dirty = JSON.stringify(trimLoreDoc(draft)) !== JSON.stringify(lore.doc);

  async function save() {
    setSaving(true);
    try {
      const clean = trimLoreDoc(draft);
      await lore.save(clean);
      setDraft(clean);
      setMessage("Saved");
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  function flash(sections: Set<LoreSectionKey>) {
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setFlashed(sections);
    flashTimer.current = setTimeout(() => setFlashed(new Set()), 1200);
  }

  async function sendText(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setChatError(null);
    setInput("");
    const before = sectionDigests(draft);
    try {
      const { reply, doc } = await lore.turn(draft, history.slice(-20), trimmed);
      touched.current = true;
      setDraft(doc);
      setHistory((h) => [...h, { role: "user", text: trimmed }, { role: "assistant", text: reply }]);
      flash(changedSections(before, sectionDigests(doc)));
    } catch (err) {
      setChatError(err instanceof ApiError ? err.message : "Could not reach the AI");
    } finally {
      setSending(false);
    }
  }

  const cardClass = (section: LoreSectionKey) =>
    `flex flex-col gap-3 rounded-card border border-line bg-surface/60 p-5 ${FLASH} ${flashed.has(section) ? "bg-accent/10" : ""}`;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-display text-[44px] leading-none">Lore</h2>
        {commanderName && <p className="mt-1 text-sm text-muted">Built around {commanderName}</p>}
      </div>

      {lore.loadError && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border border-danger-line bg-danger/10 px-4 py-3 text-sm text-ink">
          <span className="min-w-0 flex-1">{lore.loadError}</span>
          <button type="button" className={btn.secondary} onClick={() => void lore.retry()}>
            Retry
          </button>
        </div>
      )}

      {autoDrafting && commanderName && <p className="text-sm text-muted">Drafting {commanderName}&rsquo;s setting…</p>}

      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[2fr_3fr] lg:items-start">
        <div className="flex flex-col gap-3 rounded-card border border-line bg-surface/60 p-5 lg:sticky lg:top-6">
          <div>
            <h3 className="font-display text-xl">Talk to the AI</h3>
            <p className={LABEL}>Describe what to change. The document on the right fills in as you talk.</p>
          </div>
          <div className="flex max-h-[480px] flex-col gap-2 overflow-y-auto" aria-live="polite">
            {history.length === 0 && !autoDrafting && (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-muted">Try:</p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} type="button" className={btn.quiet} disabled={!lore.loaded || sending} onClick={() => void sendText(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {history.map((m, i) => (
              <div
                key={i}
                className={
                  m.role === "user"
                    ? "max-w-[85%] self-end rounded-3xl bg-accent/20 px-4 py-2 text-[13px] text-ink"
                    : "max-w-[85%] self-start rounded-3xl border border-line bg-surface px-4 py-2 text-[13px] text-ink"
                }
              >
                {m.text}
              </div>
            ))}
            {sending && <div className="self-start text-sm text-muted">Thinking…</div>}
          </div>
          {chatError && <span className="text-sm text-danger">{chatError}</span>}
          <form
            className="flex items-center gap-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              void sendText(input);
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Tell the AI what to change…"
              aria-label="Message"
              className={INPUT}
              disabled={!lore.loaded || sending}
            />
            <button type="submit" className={btn.secondary} disabled={!lore.loaded || sending || !input.trim()}>
              Send
            </button>
          </form>
        </div>

        <div className="flex flex-col gap-6">
          <div className={cardClass("cosmology")}>
            <h3 className="font-display text-xl">Cosmology</h3>
            {draft.canonSource && <p className="text-sm text-accent-text">Canon source: {draft.canonSource}</p>}
            <p className="text-sm">{draft.cosmology.overview || "Nothing drafted yet."}</p>
            {draft.cosmology.forces.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {draft.cosmology.forces.map((f) => (
                  <span key={f} className="rounded-full border border-line px-2.5 py-0.5 text-xs text-muted">
                    {f}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className={cardClass("groups")}>
            <h3 className="font-display text-xl">Races, tribes &amp; factions</h3>
            <div className="flex flex-col gap-2">
              {draft.groups.map((g) => (
                <div key={g.id} className="rounded-2xl border border-line bg-surface px-3.5 py-2.5 text-sm">
                  <span className="font-medium">{g.name}</span>
                  {g.description && <span className="text-muted"> — {g.description}</span>}
                </div>
              ))}
              {draft.groups.length === 0 && <p className="text-sm text-muted">Nothing drafted yet.</p>}
            </div>
          </div>

          <div className={cardClass("tales")}>
            <h3 className="font-display text-xl">Tales</h3>
            <ul className="flex flex-col gap-1.5 text-sm text-muted">
              {draft.tales.map((t, i) => (
                <li key={i}>• {t}</li>
              ))}
              {draft.tales.length === 0 && <li>Nothing drafted yet.</li>}
            </ul>
          </div>

          <div className={cardClass("colors")}>
            <h3 className="font-display text-xl">Signature colours</h3>
            <div className="flex flex-wrap gap-2">
              {draft.colors.map((c) => (
                <span key={c.id} className="rounded-full border border-line px-3 py-1 text-xs">
                  {c.faction} · {c.color}
                </span>
              ))}
              {draft.colors.length === 0 && <p className="text-sm text-muted">No colours locked yet.</p>}
            </div>
          </div>

          <div className={cardClass("characters")}>
            <h3 className="font-display text-xl">Named characters</h3>
            <div className="flex flex-col gap-2">
              {draft.characters.map((c) => (
                <div key={c.id} className="rounded-2xl border border-line bg-surface px-3.5 py-2.5 text-sm">
                  <span className="font-medium">{c.name}</span> <span className="text-muted">— {c.role}</span>
                </div>
              ))}
              {draft.characters.length === 0 && <p className="text-sm text-muted">No named characters yet.</p>}
            </div>
          </div>

          <button type="button" className={btn.quiet} onClick={() => setAdvanced((v) => !v)}>
            {advanced ? "Hide advanced editing" : "Advanced editing"}
          </button>

          {advanced && (
            <div className="flex flex-col gap-6 border-t border-line pt-6">
              <div className={cardClass("cosmology")}>
                <h3 className="font-display text-xl">Cosmology</h3>
                <Field
                  label="Canon source"
                  value={draft.canonSource ?? ""}
                  onChange={(v) => update((d) => ({ ...d, canonSource: v }))}
                  placeholder="Leave empty for an invented setting"
                />
                <label className="flex flex-col gap-1.5">
                  <span className={LABEL}>Overview</span>
                  <textarea
                    className={AREA}
                    rows={3}
                    value={draft.cosmology.overview}
                    onChange={(e) => update((d) => ({ ...d, cosmology: { ...d.cosmology, overview: e.target.value } }))}
                  />
                </label>
                <StringList
                  label="Forces"
                  values={draft.cosmology.forces}
                  placeholder="A foundational power"
                  onChange={(forces) => update((d) => ({ ...d, cosmology: { ...d.cosmology, forces } }))}
                />
              </div>

              <div className={cardClass("groups")}>
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-xl">Races, tribes &amp; factions</h3>
                  <button type="button" className={btn.secondary} onClick={() => update((d) => ({ ...d, groups: [...d.groups, blankGroup()] }))}>
                    Add group
                  </button>
                </div>
                {draft.groups.map((group, index) => (
                  <GroupEditor
                    key={group.id}
                    group={group}
                    index={index}
                    count={draft.groups.length}
                    onChange={(next) => update((d) => ({ ...d, groups: d.groups.map((g) => (g.id === group.id ? next : g)) }))}
                    onRemove={() => update((d) => ({ ...d, groups: d.groups.filter((g) => g.id !== group.id) }))}
                    onMove={(by) =>
                      update((d) => {
                        const next = [...d.groups];
                        const j = index + by;
                        if (j < 0 || j >= next.length) return d;
                        [next[index], next[j]] = [next[j], next[index]];
                        return { ...d, groups: next };
                      })
                    }
                  />
                ))}
              </div>

              <div className={cardClass("tales")}>
                <h3 className="font-display text-xl">Tales</h3>
                <StringList label="Tales" values={draft.tales} placeholder="A myth, legend or past event" onChange={(tales) => update((d) => ({ ...d, tales }))} />
              </div>

              <div className={cardClass("colors")}>
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-xl">Signature colours</h3>
                  <button type="button" className={btn.secondary} onClick={() => update((d) => ({ ...d, colors: [...d.colors, blankColor()] }))}>
                    Add colour
                  </button>
                </div>
                {draft.colors.map((color) => (
                  <ColorEditor
                    key={color.id}
                    color={color}
                    onChange={(next) => update((d) => ({ ...d, colors: d.colors.map((c) => (c.id === color.id ? next : c)) }))}
                    onRemove={() => update((d) => ({ ...d, colors: d.colors.filter((c) => c.id !== color.id) }))}
                  />
                ))}
              </div>

              <div className={cardClass("characters")}>
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-xl">Named characters</h3>
                  <button type="button" className={btn.secondary} onClick={() => update((d) => ({ ...d, characters: [...d.characters, blankCharacter()] }))}>
                    Add character
                  </button>
                </div>
                {draft.characters.map((character) => (
                  <CharacterEditor
                    key={character.id}
                    character={character}
                    onChange={(next) => update((d) => ({ ...d, characters: d.characters.map((c) => (c.id === character.id ? next : c)) }))}
                    onRemove={() => update((d) => ({ ...d, characters: d.characters.filter((c) => c.id !== character.id) }))}
                  />
                ))}
              </div>

              <div className={cardClass("naming")}>
                <h3 className="font-display text-xl">Naming conventions</h3>
                <textarea
                  className={AREA}
                  rows={3}
                  value={draft.naming}
                  onChange={(e) => update((d) => ({ ...d, naming: e.target.value }))}
                  placeholder="Suffix patterns, a shared phonetic family…"
                />
              </div>

              <div className={cardClass("gaps")}>
                <h3 className="font-display text-xl">Open gaps</h3>
                <StringList label="Open gaps" values={draft.gaps} placeholder="Something still undecided" onChange={(gaps) => update((d) => ({ ...d, gaps }))} />
              </div>
            </div>
          )}

          <div className="flex items-center gap-2.5">
            <button type="button" className={btn.primary} disabled={!lore.loaded || !dirty || saving} onClick={() => void save()}>
              Save lore
            </button>
            {message && !dirty && <span className="text-sm text-muted">{message}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className={LABEL}>{label}</span>
      <input className={INPUT} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </label>
  );
}

function StringList({ label, values, onChange, placeholder }: { label: string; values: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <span className={LABEL}>{label}</span>
      {values.map((value, index) => (
        <div key={index} className="flex items-center gap-2">
          <input
            className={INPUT}
            value={value}
            placeholder={placeholder}
            onChange={(e) => onChange(values.map((v, i) => (i === index ? e.target.value : v)))}
          />
          <button type="button" className={btn.quiet} aria-label={`Remove ${value || "entry"}`} onClick={() => onChange(values.filter((_, i) => i !== index))}>
            Remove
          </button>
        </div>
      ))}
      <button type="button" className={btn.quiet} onClick={() => onChange([...values, ""])}>
        + Add
      </button>
    </div>
  );
}

function GroupEditor({
  group,
  index,
  count,
  onChange,
  onRemove,
  onMove,
}: {
  group: LoreGroup;
  index: number;
  count: number;
  onChange: (g: LoreGroup) => void;
  onRemove: () => void;
  onMove: (by: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-3xl border border-line bg-surface p-4">
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-muted">{index + 1}</span>
        <input className={INPUT} value={group.name} aria-label="Group name" placeholder="Group name" onChange={(e) => onChange({ ...group, name: e.target.value })} />
      </div>
      <input
        className={INPUT}
        value={group.description}
        aria-label="Description"
        placeholder="One line: what makes this group distinct"
        onChange={(e) => onChange({ ...group, description: e.target.value })}
      />
      <textarea
        className={AREA}
        rows={2}
        value={group.traits}
        aria-label="Traits"
        placeholder="Visual or behavioural traits"
        onChange={(e) => onChange({ ...group, traits: e.target.value })}
      />
      <div className="flex items-center gap-2">
        <button type="button" className={btn.quiet} disabled={index === 0} onClick={() => onMove(-1)} aria-label="Move group up">
          ↑
        </button>
        <button type="button" className={btn.quiet} disabled={index === count - 1} onClick={() => onMove(1)} aria-label="Move group down">
          ↓
        </button>
        <button type="button" className={btn.quiet} onClick={onRemove}>
          Remove
        </button>
      </div>
    </div>
  );
}

function ColorEditor({ color, onChange, onRemove }: { color: LoreColor; onChange: (c: LoreColor) => void; onRemove: () => void }) {
  return (
    <div className="flex flex-col gap-2 rounded-3xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <input className={`${INPUT} max-w-40`} value={color.faction} aria-label="Faction" placeholder="Faction" onChange={(e) => onChange({ ...color, faction: e.target.value })} />
        <input className={`${INPUT} max-w-40`} value={color.color} aria-label="Colour" placeholder="Colour" onChange={(e) => onChange({ ...color, color: e.target.value })} />
        <input className={`${INPUT} flex-1`} value={color.meaning} aria-label="What it marks" placeholder="What it marks" onChange={(e) => onChange({ ...color, meaning: e.target.value })} />
        <button type="button" className={btn.quiet} onClick={onRemove} aria-label="Remove colour">
          Remove
        </button>
      </div>
    </div>
  );
}

function CharacterEditor({ character, onChange, onRemove }: { character: LoreCharacter; onChange: (c: LoreCharacter) => void; onRemove: () => void }) {
  return (
    <div className="flex flex-col gap-2 rounded-3xl border border-line bg-surface p-4">
      <div className="flex flex-wrap gap-2">
        <input className={`${INPUT} flex-1`} value={character.name} aria-label="Name" placeholder="Name" onChange={(e) => onChange({ ...character, name: e.target.value })} />
        <input className={`${INPUT} max-w-40`} value={character.group} aria-label="Group" placeholder="Group" onChange={(e) => onChange({ ...character, group: e.target.value })} />
        <input className={`${INPUT} max-w-40`} value={character.race} aria-label="Race" placeholder="Race" onChange={(e) => onChange({ ...character, race: e.target.value })} />
      </div>
      <input className={INPUT} value={character.role} aria-label="Role" placeholder="Role" onChange={(e) => onChange({ ...character, role: e.target.value })} />
      <input className={INPUT} value={character.signature} aria-label="Signature detail" placeholder="Signature visual detail" onChange={(e) => onChange({ ...character, signature: e.target.value })} />
      <div className="flex items-center gap-2">
        <button type="button" className={btn.quiet} onClick={onRemove}>
          Remove
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Delete `LoreSection.tsx`**

```bash
rm frontend/src/components/builder/LoreSection.tsx
```

- [ ] **Step 3: Confirm typecheck fails only in `DeckBuilder.tsx` and `CardMenu.tsx` (expected)**

Run: `cd frontend && npm run typecheck 2>&1 | tail -40`
Expected: FAIL — `DeckBuilder.tsx` still imports and mounts the deleted `LoreSection`. Fixed in Tasks 13–14.

---

### Task 13: Frontend — wire `CardMenu.tsx`

**Files:**
- Modify: `frontend/src/components/builder/CardMenu.tsx`

- [ ] **Step 1: Add the `onSetLore` prop**

In the `Props` interface, add a new line right after `onProxy`:
```ts
  onProxy: (line: DeckCardLine) => void;
  onSetLore: (line: DeckCardLine) => void;
```

- [ ] **Step 2: Accept it in the function signature**

Change:
```ts
export function CardMenu({ target, onClose, onPeek, onPrinting, onTags, onQuantity, onMove, onSetCommander, onSetBackground, onSetPartner, onHistory, onProxy, onRemove, onNotify }: Props) {
```
to:
```ts
export function CardMenu({ target, onClose, onPeek, onPrinting, onTags, onQuantity, onMove, onSetCommander, onSetBackground, onSetPartner, onHistory, onProxy, onSetLore, onRemove, onNotify }: Props) {
```

- [ ] **Step 3: Add the menu item**

Right after the "Proxy art prompt" button, add (gated on `isCommander`, which is already computed above as `const isCommander = line.board === "commander";`):

```tsx
      <button role="menuitem" className={item} onClick={act(() => onProxy(line))}>
        Proxy art prompt
      </button>
      {isCommander && (
        <button role="menuitem" className={item} onClick={act(() => onSetLore(line))}>
          Set Lore
        </button>
      )}
      <button role="menuitem" className={item} onClick={copyName}>
        Copy card name
      </button>
```

- [ ] **Step 4: Confirm typecheck fails only in `DeckBuilder.tsx` (expected)**

Run: `cd frontend && npm run typecheck 2>&1 | tail -40`
Expected: FAIL — `<CardMenu>` in `DeckBuilder.tsx` is now missing the required `onSetLore` prop, and still imports/mounts `LoreSection`. Fixed in Task 14.

---

### Task 14: Frontend — wire `DeckBuilder.tsx`

**Files:**
- Modify: `frontend/src/components/builder/DeckBuilder.tsx:24` (import), `:192` (state, next to `proxyCardId`), `:1076` (mount), `:1298` (CardMenu props), `:1313` (near ProxyPanel mount)

- [ ] **Step 1: Swap the import**

Replace:
```ts
import { LoreSection } from "./LoreSection";
```
with:
```ts
import { LoreDialog } from "./LoreDialog";
```

- [ ] **Step 2: Add state next to `proxyCardId`**

Find:
```ts
  const [proxyCardId, setProxyCardId] = useState<string | null>(null);
```
Add right after it:
```ts
  const [loreOpen, setLoreOpen] = useState(false);
```

- [ ] **Step 3: Remove the inline mount**

Delete this line (around line 1076):
```tsx
      <LoreSection deckId={deck.id} />
```
(No replacement at this spot — the Lore editor is now a dialog, mounted near the other dialogs, not inline on the page.)

- [ ] **Step 4: Wire `onSetLore` on `<CardMenu>`**

Find the `<CardMenu ... onProxy={(line) => setProxyCardId(line.cardId)}` block and add a new prop right after it:
```tsx
        onProxy={(line) => setProxyCardId(line.cardId)}
        onSetLore={() => setLoreOpen(true)}
```

- [ ] **Step 5: Mount `<LoreDialog>` near `<ProxyPanel>`**

Find the `<ProxyPanel ... />` block (around line 1313) and add the new dialog right after its closing `/>`:
```tsx
      <ProxyPanel
        open={proxyCardId !== null}
        onClose={() => setProxyCardId(null)}
        cardId={proxyCardId}
        cardName={lines.find((l) => l.cardId === proxyCardId)?.name ?? ""}
        deckId={deck.id}
        proxies={proxies}
        onNotify={setToast}
      />
      <LoreDialog open={loreOpen} onClose={() => setLoreOpen(false)} deckId={deck.id} commanderName={deck.commanderName} />
```

- [ ] **Step 6: Typecheck**

Run: `cd frontend && npm run typecheck 2>&1 | tail -40`
Expected: clean — no errors.

- [ ] **Step 7: Run the full frontend test suite**

Run: `cd frontend && npm test 2>&1 | tail -20`
Expected: all tests pass (same 149 as before, minus nothing — no test file covered `LoreSection.tsx`/`LoreDock.tsx` directly, so the count is unchanged).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/builder/LoreDialog.tsx frontend/src/components/builder/LoreSection.tsx \
        frontend/src/components/builder/CardMenu.tsx frontend/src/components/builder/DeckBuilder.tsx
git commit -m "Trigger the Lore Creator from the commander's card menu with an auto-drafting dialog"
```

---

### Task 15: Final verification

**Files:** none — this task only runs checks.

- [ ] **Step 1: Full backend test suite**

Run: `cd backend && ./mvnw -o test 2>&1 | tail -20`
Expected: `BUILD SUCCESS`, 0 failures.

- [ ] **Step 2: Full frontend typecheck and test suite**

Run: `cd frontend && npm run typecheck && npm test 2>&1 | tail -30`
Expected: typecheck clean; all tests pass.

- [ ] **Step 3: Confirm the dev lab deletions didn't leave a dangling route**

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/dev/lore-builder-lab`
Expected: `404` (the route no longer exists; if the dev server is still running the old build, restart it first).

- [ ] **Step 4: Manual note for the next live session**

This plan does not include a live LLM smoke test (each `draft`/`turn` call is a paid request). Before calling the feature done end-to-end, open a real deck with a commander in the browser, click the commander's card menu → "Set Lore", and confirm: the dialog opens, drafting starts automatically with no typing, and the result shows a filled cosmology/groups/tales. Try once with a commander that's a known IP character (expect `canonSource` to show under Cosmology) and once with an original character (expect `canonSource` to stay empty).

---

## Self-review notes

- **Spec coverage:** schema generalization (Tasks 1, 4, 8–9), canon-first draft instruction (Tasks 3, 5, 12), trigger from the commander's card menu (Tasks 13–14), dialog shell replacing the standalone tab (Task 12, 14), Advanced toggle reusing the existing manual editors (Task 12), Kaalia migration (Task 7) — every section of the spec has a task.
- **Deferred items carried over from the spec, not tasks here:** per-item regenerate buttons, and feeding `canonSource` into `ProxyPromptService` — both explicitly out of scope.
- **Type consistency check:** `LoreGroup`/`Group` used consistently from Task 1 (backend) through Task 9 (frontend `lore.ts`) and Task 12 (`LoreDialog.tsx`); `character.group` (not `tier`) used consistently in Tasks 1, 5, 6, 8, 9, 10, 12; `canonSource` present on every `LoreDoc` construction in the updated tests (Tasks 5, 6) and the frontend (Tasks 8–10, 12).
