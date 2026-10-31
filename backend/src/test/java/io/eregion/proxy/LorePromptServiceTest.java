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
