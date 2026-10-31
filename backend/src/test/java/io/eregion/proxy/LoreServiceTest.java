package io.eregion.proxy;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import io.eregion.common.ApiException;
import io.eregion.proxy.LoreDtos.Cosmology;
import io.eregion.proxy.LoreDtos.LoreDoc;
import io.eregion.proxy.LoreDtos.Mechanism;
import io.eregion.proxy.LoreDtos.NamedCharacter;
import io.eregion.proxy.LoreDtos.SignatureColor;
import io.eregion.proxy.LoreDtos.Tier;

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
		var cosmology = new Cosmology("Aelar", List.of("Thin", "Veil"), "Maelgrith");
		var tiers = List.of(
				new Tier("1", "Unfallen", "still whole", Mechanism.ADDITION, "polished stone"),
				new Tier("2", "Void-claimed", "lost name and face", Mechanism.ERASURE, "fraying smoke, no face"));
		var colors = List.of(new SignatureColor("3", "the corruptor", "violet", "void touch"));
		var characters = List.of(new NamedCharacter("4", "Sildarion", "Unfallen", "spirit", "sentinel", "gold coin"));
		return new LoreDoc(cosmology, tiers, colors, characters, "-ion suffix", List.of("an untested tier"));
	}

	@Test
	void renderDigestListsEverySection() {
		String digest = LoreService.renderDigest(fullDoc());

		assertThat(digest).contains("# Cosmology").contains("Maker: Aelar").contains("Corruptor: Maelgrith");
		assertThat(digest).contains("# Spectrum").contains("1. Unfallen (addition)").contains("2. Void-claimed (erasure)");
		assertThat(digest).contains("# Signature colours").contains("violet = the corruptor");
		assertThat(digest).contains("# Named characters").contains("Sildarion");
		assertThat(digest).contains("# Naming conventions").contains("-ion suffix");
		assertThat(digest).contains("# Open gaps").contains("an untested tier");
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
	}

	@Test
	void anOversizedDocIsRefused() {
		var service = new LoreService(new MemoryLoreRepository(true), null, null, null);
		var doc = fullDoc();
		var oversized = new LoreDoc(doc.cosmology(), doc.tiers(), doc.colors(), doc.characters(), "x".repeat(LoreService.MAX_DOC_CHARS + 1), doc.gaps());

		assertThatThrownBy(() -> service.save(USER, DECK, oversized)).isInstanceOf(ApiException.class);
	}
}
