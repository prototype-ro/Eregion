package io.eregion.proxy;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

import io.eregion.common.ApiException;
import io.eregion.proxy.LoreDtos.Mechanism;
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
			{"cosmology":{"maker":"Aelar","spirits":["Thin","Veil"],"corruptor":"Maelgrith"},"tiers":[
			{"name":"Unfallen","definition":"still whole","mechanism":"ADDITION","vocabulary":"polished stone"},
			{"name":"Void-claimed","definition":"lost name and face","mechanism":"ERASURE","vocabulary":"fraying smoke, no face"}],
			"colors":[{"faction":"the corruptor","color":"violet","meaning":"void touch"}],
			"characters":[{"name":"Sildarion","tier":"Unfallen","race":"spirit","role":"sentinel","signature":"gold coin"}],
			"naming":"-ion suffix","gaps":["an untested tier"]}
			""";

	LorePromptService service(LlmClient llm) {
		return new LorePromptService(llm);
	}

	@Test
	void parseDocReadsEverySectionAndAssignsIds() {
		var doc = LorePromptService.parseDoc(GOOD_DOC);

		assertThat(doc.cosmology().maker()).isEqualTo("Aelar");
		assertThat(doc.cosmology().spirits()).containsExactly("Thin", "Veil");
		assertThat(doc.cosmology().corruptor()).isEqualTo("Maelgrith");

		assertThat(doc.tiers()).hasSize(2);
		assertThat(doc.tiers().get(0).mechanism()).isEqualTo(Mechanism.ADDITION);
		assertThat(doc.tiers().get(1).mechanism()).isEqualTo(Mechanism.ERASURE);
		assertThat(doc.tiers()).extracting(t -> t.id()).doesNotContainNull().doesNotHaveDuplicates();

		assertThat(doc.colors()).hasSize(1);
		assertThat(doc.colors().get(0).color()).isEqualTo("violet");
		assertThat(doc.characters()).hasSize(1);
		assertThat(doc.characters().get(0).name()).isEqualTo("Sildarion");
		assertThat(doc.naming()).isEqualTo("-ion suffix");
		assertThat(doc.gaps()).containsExactly("an untested tier");
	}

	@Test
	void parseDocDropsBlankTiersCharactersAndColors() {
		String json = """
				{"cosmology":{},"tiers":[{"name":"","definition":"x","mechanism":"ADDITION","vocabulary":"y"},{"name":"Real","definition":"d","mechanism":"ADDITION","vocabulary":"v"}],
				"colors":[{"faction":"","color":"","meaning":""}],"characters":[{"name":"","tier":"t"}],"naming":"","gaps":["","real gap"]}
				""";

		var doc = LorePromptService.parseDoc(json);

		assertThat(doc.tiers()).extracting(t -> t.name()).containsExactly("Real");
		assertThat(doc.colors()).isEmpty();
		assertThat(doc.characters()).isEmpty();
		assertThat(doc.gaps()).containsExactly("real gap");
	}

	@Test
	void parseDocReadsACodeFence() {
		assertThat(LorePromptService.parseDoc("```json\n" + GOOD_DOC + "\n```").cosmology().maker()).isEqualTo("Aelar");
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

		var doc = service(llm).draft("THE LORE", "invent a five-tier spectrum");

		assertThat(doc.tiers()).hasSize(2);
		assertThat(llm.users.get(0)).contains("THE LORE").contains("invent a five-tier spectrum");
		assertThat(llm.systems.get(0)).isNotBlank();
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
	void aMalformedReplyIsRetriedOnce() {
		var llm = new Scripted("not json at all", GOOD_DOC);

		var doc = service(llm).draft("L", "x");

		assertThat(doc.cosmology().maker()).isEqualTo("Aelar");
		assertThat(llm.users).hasSize(2);
	}

	@Test
	void twoBadRepliesFailWithAMessage() {
		var llm = new Scripted("nope", "still not json");

		assertThatThrownBy(() -> service(llm).draft("L", "x")).isInstanceOf(ApiException.class).hasMessageContaining("could not be read");
		assertThat(llm.users).hasSize(2);
	}
}
