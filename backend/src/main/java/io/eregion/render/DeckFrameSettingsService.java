package io.eregion.render;

import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import io.eregion.common.ApiException;
import io.eregion.deck.DeckRepository;

@Service
public class DeckFrameSettingsService {

	private static final String DEFAULT_FRAME_FAMILY = "m15";

	public record FrameSettingsRequest(String artistName, String collectionCode, String frameFamily) {
	}

	private final DeckFrameSettingsRepository repository;
	private final DeckRepository decks;
	private final DeckRenderTrigger renderTrigger;

	public DeckFrameSettingsService(DeckFrameSettingsRepository repository, DeckRepository decks, DeckRenderTrigger renderTrigger) {
		this.repository = repository;
		this.decks = decks;
		this.renderTrigger = renderTrigger;
	}

	@Transactional(readOnly = true)
	public DeckFrameSettingsRepository.FrameSettingsRow get(UUID deckId, UUID userId) {
		owned(deckId, userId);
		return repository.findByDeckId(deckId)
				.orElse(new DeckFrameSettingsRepository.FrameSettingsRow(deckId, null, null, DEFAULT_FRAME_FAMILY));
	}

	@Transactional
	public DeckFrameSettingsRepository.FrameSettingsRow save(UUID deckId, UUID userId, FrameSettingsRequest request) {
		owned(deckId, userId);
		String frameFamily = request.frameFamily() == null || request.frameFamily().isBlank()
				? DEFAULT_FRAME_FAMILY
				: request.frameFamily().trim();
		DeckFrameSettingsRepository.FrameSettingsRow saved = repository.upsert(deckId,
				blankToNull(request.artistName()), blankToNull(request.collectionCode()), frameFamily);
		renderTrigger.rerenderDeck(deckId);
		return saved;
	}

	private void owned(UUID deckId, UUID userId) {
		decks.findOwned(deckId, userId).orElseThrow(() -> ApiException.notFound("Deck"));
	}

	private static String blankToNull(String value) {
		return value == null || value.isBlank() ? null : value.trim();
	}
}
