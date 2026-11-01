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
import io.eregion.render.ArtLookup;
import io.eregion.render.CardRenderService;

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
		public UUID record(UUID deckId, UUID cardId, Mode m, String instruction, Draft draft, String model) {
			UUID treatment = upsertTreatment(deckId, cardId, m);
			UUID generation = insertGeneration(treatment, instruction, draft, model);
			setCurrent(treatment, generation);
			return generation;
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
			return treatment.equals(treatmentId) && generations.stream().anyMatch(g -> g.id().equals(generationId));
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

	/** No art uploaded for any card, so these tests' render triggers are no-ops unless overridden. */
	static class NoArt extends ArtLookup {
		NoArt() {
			super(null);
		}

		@Override
		public byte[] findArtBytes(UUID cardId) {
			return null;
		}
	}

	/** Remembers which (deckId, cardId) pairs were asked to render, instead of actually compositing anything. */
	static class RecordingRenderService extends CardRenderService {
		final List<UUID> renderedCardIds = new ArrayList<>();

		RecordingRenderService() {
			super(null, null, null, null);
		}

		@Override
		public void render(UUID deckId, UUID cardId, byte[] artBytes) {
			renderedCardIds.add(cardId);
		}
	}

	/** A dummy that is never actually invoked, since NoArt always reports no art to render. */
	static final CardRenderService NOT_INVOKED = new RecordingRenderService();

	MemoryRepository repo = new MemoryRepository();
	Counting llm = new Counting();
	ProxyService service = new ProxyService(repo, new OneCard(), new ProxyPromptService(llm), llm, new NoArt(), NOT_INVOKED);

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
		assertThat(refined.current().prompt()).isEqualTo("prompt 2 --ar 5:7");
		assertThat(service.history(USER, DECK, CARD)).extracting(Generation::prompt).containsExactly("prompt 2 --ar 5:7", "prompt 1 --ar 5:7");
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

		assertThat(back.current().prompt()).isEqualTo("prompt 1 --ar 5:7");
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

	@Test
	void pickingAnOlderResultBringsItsModeBack() {
		Treatment a = service.generate(USER, DECK, CARD, Mode.NICKNAME, null);
		service.generate(USER, DECK, CARD, Mode.RESKIN, null);

		Treatment back = service.setCurrent(USER, DECK, CARD, a.current().id());

		assertThat(back.mode()).isEqualTo(Mode.NICKNAME);
	}

	@Test
	void aStrangerCannotReadOrChangeAnything() {
		Treatment mine = service.generate(USER, DECK, CARD, Mode.NICKNAME, null);
		int callsBefore = llm.calls;

		assertThatThrownBy(() -> service.lore(STRANGER, DECK)).isInstanceOf(ApiException.class).hasMessageContaining("Deck not found");
		assertThatThrownBy(() -> service.treatments(STRANGER, DECK)).isInstanceOf(ApiException.class).hasMessageContaining("Deck not found");
		assertThatThrownBy(() -> service.history(STRANGER, DECK, CARD)).isInstanceOf(ApiException.class).hasMessageContaining("Deck not found");
		assertThatThrownBy(() -> service.setCurrent(STRANGER, DECK, CARD, mine.current().id()))
				.isInstanceOf(ApiException.class).hasMessageContaining("Deck not found");
		assertThat(llm.calls).isEqualTo(callsBefore);
	}

	@Test
	void aFailingModelLeavesNothingBehind() {
		var failing = new LlmClient() {
			@Override
			public String complete(String system, String user) {
				throw ApiException.unavailable("down");
			}

			@Override
			public String modelName() {
				return "fake";
			}
		};
		var svc = new ProxyService(repo, new OneCard(), new ProxyPromptService(failing), failing, new NoArt(), NOT_INVOKED);

		assertThatThrownBy(() -> svc.generate(USER, DECK, CARD, Mode.NICKNAME, null)).isInstanceOf(ApiException.class).hasMessageContaining("down");
		assertThat(repo.treatmentId).isNull();
		assertThat(repo.generations).isEmpty();
	}

	@Test
	void generatingRerendersTheCardWhenArtAlreadyExists() {
		var artLookup = new ArtLookup(null) {
			@Override
			public byte[] findArtBytes(UUID cardId) {
				return cardId.equals(CARD) ? new byte[] { 9 } : null;
			}
		};
		var renderService = new RecordingRenderService();
		var svc = new ProxyService(repo, new OneCard(), new ProxyPromptService(llm), llm, artLookup, renderService);

		svc.generate(USER, DECK, CARD, Mode.NICKNAME, null);

		assertThat(renderService.renderedCardIds).containsExactly(CARD);
	}

	@Test
	void settingAnOlderGenerationCurrentAlsoRerendersWhenArtExists() {
		var artLookup = new ArtLookup(null) {
			@Override
			public byte[] findArtBytes(UUID cardId) {
				return cardId.equals(CARD) ? new byte[] { 9 } : null;
			}
		};
		var renderService = new RecordingRenderService();
		var svc = new ProxyService(repo, new OneCard(), new ProxyPromptService(llm), llm, artLookup, renderService);

		Treatment first = svc.generate(USER, DECK, CARD, Mode.NICKNAME, null);
		svc.generate(USER, DECK, CARD, Mode.NICKNAME, null);
		renderService.renderedCardIds.clear();

		svc.setCurrent(USER, DECK, CARD, first.current().id());

		assertThat(renderService.renderedCardIds).containsExactly(CARD);
	}
}
