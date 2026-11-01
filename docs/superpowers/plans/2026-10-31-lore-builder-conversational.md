# Lore Builder Conversational Rework — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the form-based Lore Creator with a conversational co-builder: one `POST /lore-doc/turn` endpoint and a two-pane chat+document frontend, per `docs/superpowers/specs/2026-10-31-lore-builder-design.md`.

**Architecture:** Backend adds `turn` alongside the existing `draft`/`refine`/`check` (kept as thin wrappers, no longer called by the frontend). `LorePromptService.parseDoc` is refactored to share its section-parsing with a new `parseTurn` that also reads a `reply` sentence. `LoreService.turn` renders the client's working doc to a digest and bounds history to 20 messages before prompting. Frontend rewrites `LoreSection.tsx` in place (same export, same mount point in `DeckBuilder.tsx`) as a two-pane chat/document view; a new pure `sectionDigests`/`changedSections` pair in `lore.ts` drives the post-turn flash.

**Tech Stack:** Spring Boot (Java records, Jackson `tools.jackson`), JUnit + AssertJ with a fake `LlmClient`; Next.js/React 19 + Tailwind 4, `node --test` for pure-logic tests.

---

### Task 1: Backend DTOs for a turn

**Files:**
- Modify: `backend/src/main/java/io/eregion/proxy/LoreDtos.java`

- [ ] **Step 1: Add the turn records**

Add after `CheckRequest`:

```java
	/** One message in the conversation so far, oldest first. */
	public record TurnMessage(String role, String text) {
	}

	/**
	 * A conversational turn. {@code doc} is the client's working document (unsaved edits included) — the server never
	 * reads the saved row to answer a turn. {@code history} is the last ~20 messages, newest last.
	 */
	public record TurnRequest(@NotNull LoreDoc doc, List<TurnMessage> history, @NotNull @NotBlank String message) {
	}

	/** The model's one- or two-sentence summary of what it changed, plus the whole updated document. */
	public record TurnReply(String reply, LoreDoc doc) {
	}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/main/java/io/eregion/proxy/LoreDtos.java
git commit -m "Add the turn DTOs for the conversational lore builder"
```

---

### Task 2: Prompt assembly and parsing for a turn

**Files:**
- Modify: `backend/src/main/java/io/eregion/proxy/LorePromptService.java`
- Test: `backend/src/test/java/io/eregion/proxy/LorePromptServiceTest.java`

- [ ] **Step 1: Write the failing tests**

Add to `LorePromptServiceTest`:

```java
	@Test
	void turnCarriesTheLoreHistoryAndMessageAndReturnsTheReplyAndDoc() {
		var llm = new Scripted("{\"reply\":\"I added a serpent corruptor.\",\"doc\":" + GOOD_DOC.strip() + "}");
		var history = List.of(new io.eregion.proxy.LoreDtos.TurnMessage("user", "invent a five-tier spectrum"),
				new io.eregion.proxy.LoreDtos.TurnMessage("assistant", "Done — I sketched five tiers."));

		var turn = service(llm).turn("THE LORE", history, "make the corruptor a serpent of cold ash");

		assertThat(turn.reply()).isEqualTo("I added a serpent corruptor.");
		assertThat(turn.doc().cosmology().maker()).isEqualTo("Aelar");
		String user = llm.users.get(0);
		assertThat(user).contains("THE LORE").contains("invent a five-tier spectrum").contains("Done — I sketched five tiers.")
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

		assertThat(turn.doc().cosmology().maker()).isEqualTo("Aelar");
	}
```

Add `import java.util.List;` is already present; add `import io.eregion.proxy.LoreDtos.TurnMessage;` and `import io.eregion.proxy.LoreDtos.TurnReply;` at the top of the test file instead of the fully-qualified references above once the service method exists (keep fully-qualified in the diff above only to scope the step; use the imports in the real edit).

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && ./mvnw -o test -Dtest=LorePromptServiceTest`
Expected: FAIL — `turn` method does not exist on `LorePromptService`.

- [ ] **Step 3: Refactor `parseDoc` to share section-parsing, then add `parseTurn` and `turn`**

In `LorePromptService.java`, replace the body of `parseDoc` so section parsing is reusable from a `JsonNode`, and add the turn pieces:

```java
	/** Drafts a whole setting from the current lore and the instruction, with fresh ids on every item. */
	public LoreDoc draft(String loreDigest, String instruction) {
		String user = "# Current lore\n\n" + digest(loreDigest) + "\n\n# What to draft\n\n" + instruction.strip()
				+ "\n\nDraft the whole setting as one JSON object in the documented shape.";
		return retry(() -> parseDoc(llm.complete(rules, user)));
	}

	/** Refines one part of the working lore in place, keeping the rest exactly as given. */
	public LoreDoc refine(String loreDigest, String target, String instruction) {
		String user = "# Current lore\n\n" + digest(loreDigest) + "\n\n"
				+ "# Part to refine\n\n" + target.strip() + "\n\n"
				+ "# Instruction\n\n" + instruction.strip()
				+ "\n\nReturn the whole document as one JSON object in the documented shape, changing only the requested part and keeping everything else exactly as written.";
		return retry(() -> parseDoc(llm.complete(rules, user)));
	}

	/**
	 * One turn of the conversation: the current lore, the bounded history and the player's new message. The model may
	 * draft the whole thing (when the document is still empty) or change just what was asked; either way it returns
	 * the whole document plus a one- or two-sentence summary of what it did.
	 */
	public LoreDoc.Problem unused; // removed below — placeholder not used

	public io.eregion.proxy.LoreDtos.TurnReply turn(String loreDigest, List<io.eregion.proxy.LoreDtos.TurnMessage> history, String message) {
		var user = new StringBuilder();
		user.append("# Current lore\n\n").append(digest(loreDigest)).append("\n\n");
		if (history != null && !history.isEmpty()) {
			user.append("# Conversation so far\n\n");
			for (var m : history) {
				user.append("assistant".equalsIgnoreCase(m.role()) ? "AI: " : "Player: ").append(m.text().strip()).append('\n');
			}
			user.append('\n');
		}
		user.append("# New message\n\n").append(message.strip()).append("\n\n")
				.append("Make only the change this message asks for — if the current lore is \"(none yet)\", draft a whole setting per the message instead — ")
				.append("keep everything else exactly as written, and reply with one JSON object: ")
				.append("{\"reply\": a one or two sentence summary of what you changed, \"doc\": the whole document in the documented shape}.");
		return retry(() -> parseTurn(llm.complete(rules, user.toString())));
	}
```

Delete the stray `public LoreDoc.Problem unused;` line above — it was left in by mistake; the real edit never includes it. (Written out here only so the diff doesn't silently lose the surrounding methods; the actual file must not contain it.)

Then replace `parseDoc` and add `docFrom`/`parseTurn`:

```java
	static LoreDoc parseDoc(String reply) {
		return docFrom(read(reply));
	}

	private static LoreDoc docFrom(JsonNode root) {
		JsonNode cos = root.path("cosmology");
		String maker = text(cos.path("maker"));
		List<String> spirits = strings(cos.path("spirits"));
		String corruptor = text(cos.path("corruptor"));

		List<Tier> tiers = new ArrayList<>();
		for (JsonNode t : root.path("tiers")) {
			String name = text(t.path("name"));
			if (name.isEmpty()) {
				continue;
			}
			tiers.add(new Tier(UUID.randomUUID().toString(), name, text(t.path("definition")), mechanism(t.path("mechanism")), text(t.path("vocabulary"))));
		}

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
			characters.add(new NamedCharacter(UUID.randomUUID().toString(), name, text(ch.path("tier")), text(ch.path("race")), text(ch.path("role")), text(ch.path("signature"))));
		}

		return new LoreDoc(new Cosmology(maker, spirits, corruptor), tiers, colors, characters, text(root.path("naming")), strings(root.path("gaps")));
	}

	static io.eregion.proxy.LoreDtos.TurnReply parseTurn(String reply) {
		JsonNode root = read(reply);
		if (!root.has("doc")) {
			throw new BadReply("missing doc");
		}
		return new io.eregion.proxy.LoreDtos.TurnReply(text(root.path("reply")), docFrom(root.path("doc")));
	}
```

Add the two imports `io.eregion.proxy.LoreDtos.TurnMessage` and `io.eregion.proxy.LoreDtos.TurnReply` at the top and drop the fully-qualified references above for readability (follow the existing import style in the file — flat type imports, no `io.eregion.proxy.LoreDtos.` prefix in the method bodies).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && ./mvnw -o test -Dtest=LorePromptServiceTest`
Expected: PASS, all tests green including the new ones.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/io/eregion/proxy/LorePromptService.java backend/src/test/java/io/eregion/proxy/LorePromptServiceTest.java
git commit -m "Add the conversational turn prompt and reply parsing"
```

---

### Task 3: `LoreService.turn`

**Files:**
- Modify: `backend/src/main/java/io/eregion/proxy/LoreService.java`
- Test: `backend/src/test/java/io/eregion/proxy/LoreServiceTest.java`

- [ ] **Step 1: Write the failing tests**

Add to `LoreServiceTest` (needs a fake `LorePromptService`-less path, so test via a `Scripted`-style `LlmClient` wired through the real `LorePromptService`, matching the existing `fullDoc()`/`MemoryLoreRepository` fixtures):

```java
	@Test
	void turnRendersTheClientsWorkingDocNotTheSavedRow() {
		var repo = new MemoryLoreRepository(true);
		var llm = new LorePromptServiceTest.Scripted(
				"{\"reply\":\"ok\",\"doc\":{\"cosmology\":{\"maker\":\"Aelar\",\"spirits\":[],\"corruptor\":\"\"},\"tiers\":[],\"colors\":[],\"characters\":[],\"naming\":\"\",\"gaps\":[]}}");
		var service = new LoreService(repo, null, null, new LorePromptService(llm));
		var workingDoc = fullDoc();

		var turn = service.turn(USER, DECK, workingDoc, List.of(), "do something");

		assertThat(turn.reply()).isEqualTo("ok");
		assertThat(llm.users.get(0)).contains("Maker: Aelar").contains("Corruptor: Maelgrith");
	}

	@Test
	void turnBoundsHistoryToTheLastTwentyMessages() {
		var repo = new MemoryLoreRepository(true);
		var llm = new LorePromptServiceTest.Scripted(
				"{\"reply\":\"ok\",\"doc\":{\"cosmology\":{\"maker\":\"\",\"spirits\":[],\"corruptor\":\"\"},\"tiers\":[],\"colors\":[],\"characters\":[],\"naming\":\"\",\"gaps\":[]}}");
		var service = new LoreService(repo, null, null, new LorePromptService(llm));
		var history = new java.util.ArrayList<io.eregion.proxy.LoreDtos.TurnMessage>();
		for (int i = 0; i < 25; i++) {
			history.add(new io.eregion.proxy.LoreDtos.TurnMessage("user", "message-" + i));
		}

		service.turn(USER, DECK, LoreDoc.empty(), history, "latest");

		String user = llm.users.get(0);
		assertThat(user).doesNotContain("message-0").contains("message-24");
	}

	@Test
	void aStrangerCannotTurn() {
		var service = new LoreService(new MemoryLoreRepository(false), null, null, null);
		assertThatThrownBy(() -> service.turn(STRANGER, DECK, LoreDoc.empty(), List.of(), "x")).isInstanceOf(ApiException.class);
	}
```

`LorePromptServiceTest.Scripted` must be visible to this test file — make it package-visible (drop `static` is not needed, it already is package-private; it's fine since both test classes are in `io.eregion.proxy`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && ./mvnw -o test -Dtest=LoreServiceTest`
Expected: FAIL — `LoreService.turn` does not exist.

- [ ] **Step 3: Implement `turn`**

In `LoreService.java`, add after `refine`:

```java
	/**
	 * One turn of the conversation. {@code doc} is the client's working document (unsaved edits included); the
	 * digest sent to the model is rendered from it, never from the saved row. History is bounded to the last 20
	 * messages so the prompt stays small.
	 */
	public io.eregion.proxy.LoreDtos.TurnReply turn(UUID userId, UUID deckId, LoreDoc doc, List<io.eregion.proxy.LoreDtos.TurnMessage> history, String message) {
		owned(deckId, userId);
		List<io.eregion.proxy.LoreDtos.TurnMessage> bounded = history == null ? List.of()
				: history.size() > 20 ? history.subList(history.size() - 20, history.size()) : history;
		return prompts.turn(renderDigest(doc), bounded, message);
	}
```

Add `import io.eregion.proxy.LoreDtos.TurnMessage;` and `import io.eregion.proxy.LoreDtos.TurnReply;` and drop the fully-qualified prefixes in the method signature to match the file's existing import style.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && ./mvnw -o test -Dtest=LoreServiceTest`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/io/eregion/proxy/LoreService.java backend/src/test/java/io/eregion/proxy/LoreServiceTest.java
git commit -m "Add LoreService.turn: render the working doc, bound history to 20 messages"
```

---

### Task 4: `POST /lore-doc/turn` endpoint

**Files:**
- Modify: `backend/src/main/java/io/eregion/proxy/LoreController.java`

- [ ] **Step 1: Add the endpoint**

```java
	/** Each turn is a paid call to the language model. */
	@PostMapping("/turn")
	public io.eregion.proxy.LoreDtos.TurnReply turn(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID deckId, @Valid @RequestBody io.eregion.proxy.LoreDtos.TurnRequest request) {
		UUID userId = CurrentUser.id(jwt);
		limits.lore(userId);
		return service.turn(userId, deckId, request.doc(), request.history(), request.message());
	}
```

Add `import io.eregion.proxy.LoreDtos.TurnReply;` and `import io.eregion.proxy.LoreDtos.TurnRequest;` at the top and drop the fully-qualified prefixes, matching the existing imports (`CheckRequest`, `DraftRequest`, etc.).

- [ ] **Step 2: Build and run the full backend test suite**

Run: `cd backend && ./mvnw -o test`
Expected: PASS, no regressions.

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/java/io/eregion/proxy/LoreController.java
git commit -m "Expose POST /lore-doc/turn"
```

---

### Task 5: Frontend types for a turn

**Files:**
- Modify: `frontend/src/lib/types.ts`

- [ ] **Step 1: Add the turn types**

After `LoreVerdict`:

```ts
export interface LoreTurnMessage {
  role: "user" | "assistant";
  text: string;
}

export interface LoreTurnReply {
  reply: string;
  doc: LoreDoc;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/lib/types.ts
git commit -m "Add the frontend types for a lore turn"
```

---

### Task 6: Section-digest change detection (pure logic)

**Files:**
- Modify: `frontend/src/lib/lore.ts`
- Test: `frontend/src/lib/lore.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `lore.test.ts`:

```ts
import { changedSections, sectionDigests } from "./lore.ts";

test("sectionDigests ignores ids but catches content changes", () => {
  const a: LoreDoc = { ...emptyLoreDoc(), tiers: [{ id: "1", name: "Unfallen", definition: "d", mechanism: "ADDITION", vocabulary: "v" }] };
  const b: LoreDoc = { ...emptyLoreDoc(), tiers: [{ id: "2", name: "Unfallen", definition: "d", mechanism: "ADDITION", vocabulary: "v" }] };
  const c: LoreDoc = { ...emptyLoreDoc(), tiers: [{ id: "2", name: "Changed", definition: "d", mechanism: "ADDITION", vocabulary: "v" }] };

  assert.equal(sectionDigests(a).tiers, sectionDigests(b).tiers);
  assert.notEqual(sectionDigests(a).tiers, sectionDigests(c).tiers);
});

test("changedSections reports only the sections whose digest moved", () => {
  const before = sectionDigests(emptyLoreDoc());
  const after = sectionDigests({ ...emptyLoreDoc(), naming: "new convention" });

  const changed = changedSections(before, after);

  assert.deepEqual([...changed], ["naming"]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm test`
Expected: FAIL — `sectionDigests`/`changedSections` not exported.

- [ ] **Step 3: Implement**

Append to `lore.ts`:

```ts
export type LoreSectionKey = "cosmology" | "tiers" | "colors" | "characters" | "naming" | "gaps";

const SECTION_KEYS: LoreSectionKey[] = ["cosmology", "tiers", "colors", "characters", "naming", "gaps"];

function withoutIds<T extends { id: string }>(items: T[]): Omit<T, "id">[] {
  return items.map(({ id: _id, ...rest }) => rest);
}

/** A per-section fingerprint, ignoring regenerated ids, used to tell which parts of the document a turn changed. */
export function sectionDigests(doc: LoreDoc): Record<LoreSectionKey, string> {
  return {
    cosmology: JSON.stringify(doc.cosmology),
    tiers: JSON.stringify(withoutIds(doc.tiers)),
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

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/lore.ts frontend/src/lib/lore.test.ts
git commit -m "Add section-digest change detection for the lore turn flash"
```

---

### Task 7: `useLore.turn`

**Files:**
- Modify: `frontend/src/lib/useLore.ts`

- [ ] **Step 1: Add the call**

```ts
import type { LoreDoc, LoreTurnMessage, LoreTurnReply, LoreVerdict } from "./types";
// ...
  const turn = useCallback(
    (doc: LoreDoc, history: LoreTurnMessage[], message: string) =>
      api<LoreTurnReply>(`/api/decks/${deckId}/lore-doc/turn`, { method: "POST", body: { doc, history, message } }),
    [deckId],
  );

  return { doc, loaded, loadError, retry: reload, save, draft, refine, check, turn };
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/useLore.ts
git commit -m "Add useLore.turn"
```

---

### Task 8: Rewrite `LoreSection.tsx` as the two-pane co-builder

**Files:**
- Modify: `frontend/src/components/builder/LoreSection.tsx`

No test file — this is a UI component; verified by typecheck, `npm run lint`-equivalent (there is none configured beyond typecheck/test per `package.json`), and manual check in the browser.

- [ ] **Step 1: Replace the component body**

Keep `Field`, `StringList`, `TierEditor`, `ColorEditor`, `CharacterEditor` exactly as they are (they're reused unchanged by the document pane). Replace everything from the top of the file through the end of the `LoreSection` function (i.e. everything above `function Field(...)`) with:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { blankCharacter, blankColor, blankTier, changedSections, emptyLoreDoc, sectionDigests, trimLoreDoc } from "@/lib/lore";
import type { LoreCharacter, LoreColor, LoreDoc, LoreMechanism, LoreSectionKey, LoreTier, LoreTurnMessage } from "@/lib/types";
import { btn } from "@/lib/ui";
import { useLore } from "@/lib/useLore";

interface Props {
  deckId: string;
}

const LABEL = "text-sm text-muted";
const INPUT = "min-h-9 w-full rounded-full border border-line bg-surface px-4 text-[13px] text-ink placeholder:text-muted focus:border-ink focus:outline-none [@media(pointer:coarse)]:min-h-11";
const AREA =
  "w-full resize-y rounded-3xl border border-line bg-surface px-5 py-4 text-[15px] leading-relaxed text-ink placeholder:text-muted focus:border-ink focus:outline-none";
const FLASH = "transition-colors duration-700 motion-reduce:transition-none";

const SUGGESTIONS = [
  "invent a five-tier corruption spectrum",
  "make it feel like an alternate Tolkien world",
  "rename the corruptor to something harsher",
];

/**
 * The deck's invented setting, built in conversation. The player talks and the AI drafts/edits the structured
 * document; every field stays hand-editable for the final tailoring. Nothing is saved until Save is pressed.
 */
export function LoreSection({ deckId }: Props) {
  const lore = useLore(deckId);
  const [draft, setDraft] = useState<LoreDoc>(emptyLoreDoc());
  const touched = useRef(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [history, setHistory] = useState<LoreTurnMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const [flashed, setFlashed] = useState<Set<LoreSectionKey>>(new Set());
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (lore.loaded && !touched.current) {
      setDraft(lore.doc);
    }
  }, [lore.loaded, lore.doc]);

  useEffect(() => () => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
  }, []);

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
    <section aria-label="Lore" className="mt-16 flex flex-col gap-6">
      <h2 className="font-display text-[44px] leading-none">Lore</h2>

      {lore.loadError && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border border-danger-line bg-danger/10 px-4 py-3 text-sm text-ink">
          <span className="min-w-0 flex-1">{lore.loadError}</span>
          <button type="button" className={btn.secondary} onClick={() => void lore.retry()}>
            Retry
          </button>
        </div>
      )}

      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[2fr_3fr] lg:items-start">
        {/* Chat */}
        <div className="flex flex-col gap-3 rounded-card border border-line bg-surface/60 p-5 lg:sticky lg:top-6">
          <div>
            <h3 className="font-display text-xl">Talk to the AI</h3>
            <p className={LABEL}>Describe what to build or change. The document on the right fills in as you talk.</p>
          </div>
          <div className="flex max-h-[480px] flex-col gap-2 overflow-y-auto" aria-live="polite">
            {history.length === 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-muted">Nothing drafted yet. Try:</p>
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
              placeholder="Tell the AI what to build or change…"
              aria-label="Message"
              className={INPUT}
              disabled={!lore.loaded || sending}
            />
            <button type="submit" className={btn.secondary} disabled={!lore.loaded || sending || !input.trim()}>
              Send
            </button>
          </form>
        </div>

        {/* Document */}
        <div className="flex flex-col gap-6">
          <div className={cardClass("cosmology")}>
            <h3 className="font-display text-xl">Cosmology</h3>
            <p className={LABEL}>Structural borrowing, never name borrowing. Invent every proper noun from scratch.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Maker" value={draft.cosmology.maker} onChange={(v) => update((d) => ({ ...d, cosmology: { ...d.cosmology, maker: v } }))} placeholder="The supreme maker" />
              <Field label="Corruptor" value={draft.cosmology.corruptor} onChange={(v) => update((d) => ({ ...d, cosmology: { ...d.cosmology, corruptor: v } }))} placeholder="The one who rebels and corrupts" />
            </div>
            <StringList
              label="Lesser spirits"
              values={draft.cosmology.spirits}
              placeholder="A spirit's name"
              onChange={(spirits) => update((d) => ({ ...d, cosmology: { ...d.cosmology, spirits } }))}
            />
          </div>

          <div className={cardClass("tiers")}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display text-xl">Corruption spectrum</h3>
                <p className={LABEL}>Ordered from un-fallen to most-lost. Mutation keeps personhood; erasure loses name and face.</p>
              </div>
              <button type="button" className={btn.secondary} onClick={() => update((d) => ({ ...d, tiers: [...d.tiers, blankTier()] }))}>
                Add tier
              </button>
            </div>
            {draft.tiers.map((tier, index) => (
              <TierEditor
                key={tier.id}
                tier={tier}
                index={index}
                count={draft.tiers.length}
                onChange={(next) => update((d) => ({ ...d, tiers: d.tiers.map((t) => (t.id === tier.id ? next : t)) }))}
                onRemove={() => update((d) => ({ ...d, tiers: d.tiers.filter((t) => t.id !== tier.id) }))}
                onMove={(by) =>
                  update((d) => {
                    const next = [...d.tiers];
                    const j = index + by;
                    if (j < 0 || j >= next.length) return d;
                    [next[index], next[j]] = [next[j], next[index]];
                    return { ...d, tiers: next };
                  })
                }
              />
            ))}
            {draft.tiers.length === 0 && <p className="text-sm text-muted">No tiers yet. A spectrum of several tiers, not a binary.</p>}
          </div>

          <div className={cardClass("colors")}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display text-xl">Signature colours</h3>
                <p className={LABEL}>One colour locked to each faction, kept as its marker on every card.</p>
              </div>
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
            {draft.colors.length === 0 && <p className="text-sm text-muted">No colours locked yet.</p>}
          </div>

          <div className={cardClass("characters")}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display text-xl">Named characters</h3>
                <p className={LABEL}>Only tiers that keep personhood get names, in one consistent register.</p>
              </div>
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
            {draft.characters.length === 0 && <p className="text-sm text-muted">No named characters yet.</p>}
          </div>

          <div className={cardClass("naming")}>
            <h3 className="font-display text-xl">Naming conventions</h3>
            <textarea className={AREA} rows={3} value={draft.naming} onChange={(e) => update((d) => ({ ...d, naming: e.target.value }))} placeholder="Suffix patterns, a shared phonetic family…" />
          </div>

          <div className={cardClass("gaps")}>
            <h3 className="font-display text-xl">Open gaps</h3>
            <StringList label="Open gaps" values={draft.gaps} placeholder="Something still undecided" onChange={(gaps) => update((d) => ({ ...d, gaps }))} />
          </div>

          <div className="flex items-center gap-2.5">
            <button type="button" className={btn.primary} disabled={!lore.loaded || !dirty || saving} onClick={() => void save()}>
              Save lore
            </button>
            {message && !dirty && <span className="text-sm text-muted">{message}</span>}
          </div>
        </div>
      </div>
    </section>
  );
}
```

Note: the naming and gaps cards were previously one card sharing a single `RefineBox`; they're now split into two flashable sections (`naming`, `gaps`) since `LoreSectionKey` tracks them separately. Delete the old `RefineBox` function entirely (no longer called).

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Manual check in the browser**

Run the dev server, open a deck's builder, scroll to Lore:
- Empty state shows suggestion chips; clicking one sends it and the chat shows "Thinking…" then the reply, and the document fills in.
- Typing a targeted change (e.g. "make the corruptor a serpent of cold ash") updates only the cosmology card, which flashes briefly.
- Hand-editing a field marks Save enabled; Save persists and clears the dirty state.
- Resize to a narrow viewport: chat and document stack instead of sitting side by side.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/builder/LoreSection.tsx
git commit -m "Rework the Lore Creator into a two-pane chat and document co-builder"
```

---

### Task 9: Full verification pass

- [ ] **Step 1: Backend**

Run: `cd backend && ./mvnw -o test`
Expected: PASS.

- [ ] **Step 2: Frontend**

Run: `cd frontend && npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 3: Commit if anything was left unstaged**

```bash
git status
```

If clean, nothing further to commit.
