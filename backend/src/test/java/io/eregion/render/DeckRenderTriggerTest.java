package io.eregion.render;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import io.eregion.card.Card;
import io.eregion.card.CardRepository;
import io.eregion.deck.DeckDtos.DeckCardInput;
import io.eregion.deck.DeckRepository;
import io.eregion.support.PostgresTest;

/**
 * Follows the hand-wired convention used elsewhere in this package (see {@code CardRenderServiceTest}): no
 * Spring context, the real repositories wired by hand against a real Postgres. CardRenderService and ArtLookup
 * are plain Mockito mocks since this test is only about which (deckId, cardId, artBytes) calls rerenderDeck
 * makes, not about compositing or art resolution themselves.
 */
class DeckRenderTriggerTest extends PostgresTest {

	@Test
	void rerenderDeck_rendersEveryCardInDeckThatHasArt() {
		CardRepository cardRepository = new CardRepository(jdbc);
		DeckRepository decks = new DeckRepository(jdbc, new JdbcTemplate(dataSource));

		UUID ownerId = newUser("deck-render-trigger@example.com");
		UUID deckId = decks.insertDeck(ownerId, "Render Trigger Test Deck", "commander");
		UUID branchId = decks.insertMainBranch(deckId, "main");

		Card cardA = cardRepository.upsert(card("Grizzly Bears"));
		Card cardB = cardRepository.upsert(card("Runeclaw Bear"));

		int number = decks.nextVersionNumber(deckId);
		UUID versionId = decks.insertVersion(deckId, number, "v1", branchId, null, null);
		decks.insertVersionCards(versionId, List.of(
				new DeckCardInput(cardA.id(), 1, "main", null, List.of(), null),
				new DeckCardInput(cardB.id(), 1, "main", null, List.of(), null)));

		CardRenderService cardRenderService = mock(CardRenderService.class);
		ArtLookup artLookup = mock(ArtLookup.class);
		when(artLookup.findArtBytes(cardA.id())).thenReturn(new byte[] { 1 });
		when(artLookup.findArtBytes(cardB.id())).thenReturn(new byte[] { 2 });

		DeckRenderTrigger trigger = new DeckRenderTrigger(cardRenderService, artLookup, decks);

		trigger.rerenderDeck(deckId);

		verify(cardRenderService, times(1)).render(eq(deckId), eq(cardA.id()), any());
		verify(cardRenderService, times(1)).render(eq(deckId), eq(cardB.id()), any());
	}

	@Test
	void rerenderDeck_skipsCardsWithNoArt() {
		CardRepository cardRepository = new CardRepository(jdbc);
		DeckRepository decks = new DeckRepository(jdbc, new JdbcTemplate(dataSource));

		UUID ownerId = newUser("deck-render-trigger-noart@example.com");
		UUID deckId = decks.insertDeck(ownerId, "Render Trigger No Art Deck", "commander");
		UUID branchId = decks.insertMainBranch(deckId, "main");

		Card card = cardRepository.upsert(card("Hill Giant"));

		int number = decks.nextVersionNumber(deckId);
		UUID versionId = decks.insertVersion(deckId, number, "v1", branchId, null, null);
		decks.insertVersionCards(versionId, List.of(
				new DeckCardInput(card.id(), 1, "main", null, List.of(), null)));

		CardRenderService cardRenderService = mock(CardRenderService.class);
		ArtLookup artLookup = mock(ArtLookup.class);
		when(artLookup.findArtBytes(card.id())).thenReturn(null);

		DeckRenderTrigger trigger = new DeckRenderTrigger(cardRenderService, artLookup, decks);

		trigger.rerenderDeck(deckId);

		verify(cardRenderService, times(0)).render(any(), any(), any());
	}

	private static Card card(String name) {
		return new Card(
				UUID.randomUUID(), UUID.randomUUID(), name, "{1}{G}", 2.0, "Creature — Bear", "Creature",
				"G", "G", "", "2", "2", "set", "Test Set", "1", "common", "Test Artist", null, null, null, null,
				"legal", null, null, List.of());
	}

	private static UUID newUser(String email) {
		jdbc.sql("INSERT INTO users (email, password_hash, display_name) VALUES (:email, 'x', 'Player') "
				+ "ON CONFLICT DO NOTHING").param("email", email).update();
		return jdbc.sql("SELECT id FROM users WHERE email = :email").param("email", email).query(UUID.class).single();
	}
}
