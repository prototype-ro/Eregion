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

	@Test
	void anOverLongFieldIsRejectedAndTheRetrySucceeds() {
		String tooLong = GOOD_NICKNAME.replace("a calm toll-keeper", "x".repeat(401));
		var llm = new Scripted(tooLong, GOOD_NICKNAME);

		Draft draft = service(llm).generate("L", SENTINEL, Mode.NICKNAME, List.of(), null, null);

		assertThat(draft.character().who()).isEqualTo("a calm toll-keeper");
		assertThat(llm.users).hasSize(2);
	}
}
