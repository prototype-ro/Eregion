package io.eregion.render;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.jwt.Jwt;

import io.eregion.card.Card;
import io.eregion.card.CardRepository;
import io.eregion.deck.DeckRepository;
import io.eregion.support.PostgresTest;

/**
 * No MockMvc/web-layer test harness exists elsewhere in this codebase (see
 * DeckFrameSettingsControllerTest). This follows the same convention: wire the real repository and
 * controller by hand against a real Postgres and drive the controller's own methods.
 *
 * <p>No test here exercises a public deck's render: making a deck's visibility 'public' requires a
 * published version (see {@code DeckRepository.publish}), which in turn needs a deck version with
 * cards wired up — that fixture is awkward to build here and isn't needed to prove the privacy fix
 * this task cares about (a stranger must not read a private deck's render). The SQL in
 * {@code findVisibleTo} does include the public-deck branch; it mirrors
 * {@code CustomPrintingRepository.imageFor}'s already-tested pattern.
 */
class CardRenderControllerTest extends PostgresTest {

	@Test
	void getImage_ownerCanReadOwnPrivateDecksRender() {
		CardRenderRepository repository = new CardRenderRepository(jdbc);
		CardRenderController controller = new CardRenderController(repository, newRenderService(repository));
		DeckRepository decks = new DeckRepository(jdbc, template());
		UUID ownerId = newUser("render-owner@example.com");
		UUID deckId = decks.insertDeck(ownerId, "Render Test Deck", "commander");
		UUID cardId = insertCard("Render Test Card");
		byte[] fakePng = new byte[] { (byte) 0x89, 'P', 'N', 'G' };
		repository.upsert(deckId, cardId, fakePng, "hash-123");
		Jwt ownerJwt = jwtFor(ownerId);

		ResponseEntity<byte[]> response = controller.getImage(ownerJwt, deckId, cardId);

		assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
		assertThat(response.getHeaders().getContentType()).isEqualTo(org.springframework.http.MediaType.IMAGE_PNG);
		assertThat(response.getBody()).isEqualTo(fakePng);
	}

	@Test
	void getImage_strangerCannotReadPrivateDecksRender() {
		CardRenderRepository repository = new CardRenderRepository(jdbc);
		CardRenderController controller = new CardRenderController(repository, newRenderService(repository));
		DeckRepository decks = new DeckRepository(jdbc, template());
		UUID ownerId = newUser("render-owner-2@example.com");
		UUID strangerId = newUser("render-stranger@example.com");
		UUID deckId = decks.insertDeck(ownerId, "Render Test Deck 2", "commander");
		UUID cardId = insertCard("Render Test Card 2");
		repository.upsert(deckId, cardId, new byte[] { (byte) 0x89, 'P', 'N', 'G' }, "hash-456");

		ResponseEntity<byte[]> strangerResponse = controller.getImage(jwtFor(strangerId), deckId, cardId);
		ResponseEntity<byte[]> anonymousResponse = controller.getImage(null, deckId, cardId);

		assertThat(strangerResponse.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
		assertThat(anonymousResponse.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
	}

	@Test
	void getImage_missingRender_returns404() {
		CardRenderRepository repository = new CardRenderRepository(jdbc);
		CardRenderController controller = new CardRenderController(repository, newRenderService(repository));
		DeckRepository decks = new DeckRepository(jdbc, template());
		UUID ownerId = newUser("render-owner-3@example.com");
		UUID deckId = decks.insertDeck(ownerId, "Render Test Deck 3", "commander");

		ResponseEntity<byte[]> response = controller.getImage(jwtFor(ownerId), deckId, UUID.randomUUID());

		assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
	}

	/**
	 * None of this class's tests actually exercise {@code render(...)} (they seed renders directly via
	 * {@code repository.upsert}), so the service's other dependencies only need to exist, not do anything real.
	 */
	private static CardRenderService newRenderService(CardRenderRepository repository) {
		return new CardRenderService(
				new io.eregion.card.CardRepository(jdbc), repository, new FrameLayoutLoader(), new DeckFrameSettingsRepository(jdbc));
	}

	private static Jwt jwtFor(UUID userId) {
		return Jwt.withTokenValue("test-token")
				.header("alg", "none")
				.claim("sub", userId.toString())
				.issuedAt(Instant.now())
				.expiresAt(Instant.now().plusSeconds(3600))
				.build();
	}

	private static org.springframework.jdbc.core.JdbcTemplate template() {
		return new org.springframework.jdbc.core.JdbcTemplate(dataSource);
	}

	private static UUID newUser(String email) {
		jdbc.sql("INSERT INTO users (email, password_hash, display_name) VALUES (:email, 'x', 'Player') "
				+ "ON CONFLICT DO NOTHING").param("email", email).update();
		return jdbc.sql("SELECT id FROM users WHERE email = :email").param("email", email).query(UUID.class).single();
	}

	private static UUID insertCard(String name) {
		CardRepository cards = new CardRepository(jdbc);
		Card inserted = cards.upsert(new Card(UUID.randomUUID(), UUID.randomUUID(), name, "{1}{U}", 2, "Creature - Test",
				"Creature", "U", "U", "Test oracle text.", "set", "Test Set", "1", "common", "Test Artist", 1.0,
				null, null, null, "legal"));
		return inserted.id();
	}
}
