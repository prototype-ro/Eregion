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
	void renderDigestShowsTheCanonSourceEvenWithNoCosmology() {
		var doc = new LoreDoc(null, List.of(), List.of(), List.of(), List.of(), "", List.of(), "Marvel Comics");

		assertThat(LoreService.renderDigest(doc)).contains("Canon source: Marvel Comics");
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
