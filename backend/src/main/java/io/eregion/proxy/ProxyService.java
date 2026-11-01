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

	/** Saves only the Midjourney parameters; the deck lore itself is owned by the Lore section. */
	public Lore saveMjParams(UUID userId, UUID deckId, String mjParams) {
		owned(deckId, userId);
		repository.saveMjParams(deckId, mjParams);
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
	public Treatment generate(UUID userId, UUID deckId, UUID cardId, Mode mode, String instruction, boolean ignoreCreatureType) {
		owned(deckId, userId);
		Card card = cards.findById(cardId).orElseThrow(() -> ApiException.notFound("Card"));
		Lore lore = repository.lore(deckId);

		Draft previous = repository.treatment(deckId, cardId)
				.map(Treatment::current)
				.map(g -> g == null ? null : new Draft(g.nickname(), g.character(), g.prompt()))
				.orElse(null);

		Draft draft = prompts.generate(lore.lore(), facts(card), mode, repository.picks(deckId, cardId), previous, instruction, ignoreCreatureType);

		repository.record(deckId, cardId, mode, instruction, draft, llm.modelName());
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
		Generation picked = repository.history(treatment.id()).stream().filter(g -> g.id().equals(generationId)).findFirst()
				.orElseThrow(() -> ApiException.notFound("Generation"));
		repository.upsertTreatment(deckId, cardId, picked.nickname() != null ? Mode.NICKNAME : Mode.RESKIN);
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
