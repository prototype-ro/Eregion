package io.eregion.custom;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.oauth2.jwt.Jwt;

import io.eregion.card.Card;
import io.eregion.card.CardRepository;
import io.eregion.custom.CustomPrintingRepository.CustomPrinting;
import io.eregion.deck.DeckDtos.DeckCardInput;
import io.eregion.deck.DeckRepository;
import io.eregion.ratelimit.RateLimitProperties;
import io.eregion.ratelimit.RateLimits;
import io.eregion.render.CardRenderService;
import io.eregion.support.PostgresTest;

/**
 * No MockMvc/web-layer test harness exists in this codebase (see DeckFrameSettingsControllerTest,
 * CardRenderControllerTest). This follows the same convention: wire the real repository and
 * controller by hand against a real Postgres and call the controller's own methods directly.
 */
class CustomPrintingControllerTest extends PostgresTest {

	private static final byte[] FAKE_PNG = new byte[] {
			(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0 };

	/** Remembers which cardIds were asked to render, instead of actually compositing anything. */
	static class RecordingRenderService extends CardRenderService {
		final List<UUID> renderedCardIds = new java.util.ArrayList<>();

		RecordingRenderService() {
			super(null, null, null, null);
		}

		@Override
		public void render(UUID deckId, UUID cardId, byte[] artBytes) {
			renderedCardIds.add(cardId);
		}
	}

	@Test
	void upload_storesTheCustomPrinting() throws Exception {
		CustomPrintingRepository repository = new CustomPrintingRepository(jdbc);
		CardRepository cards = new CardRepository(jdbc);
		DeckRepository decks = new DeckRepository(jdbc, new JdbcTemplate(dataSource));
		RecordingRenderService renderService = new RecordingRenderService();
		CustomPrintingController controller = new CustomPrintingController(
				repository, cards, noLimits(), decks, renderService);

		UUID userId = newUser("custom-upload@example.com");
		Card card = cards.upsert(card("Upload Test Card"));
		Jwt jwt = jwtFor(userId);
		MockMultipartFile file = new MockMultipartFile("file", "art.png", "image/png", FAKE_PNG);

		CustomPrinting created = controller.upload(jwt, card.id(), file, "My Art");

		assertThat(created.cardId()).isEqualTo(card.id());
		assertThat(created.label()).isEqualTo("My Art");
		assertThat(repository.findOwned(created.id(), userId)).isPresent();
	}

	@Test
	void upload_rerendersEveryDeckContainingTheCard() throws Exception {
		CustomPrintingRepository repository = new CustomPrintingRepository(jdbc);
		CardRepository cards = new CardRepository(jdbc);
		DeckRepository decks = new DeckRepository(jdbc, new JdbcTemplate(dataSource));
		RecordingRenderService renderService = new RecordingRenderService();
		CustomPrintingController controller = new CustomPrintingController(
				repository, cards, noLimits(), decks, renderService);

		UUID userId = newUser("custom-upload-trigger@example.com");
		Card card = cards.upsert(card("Upload Trigger Test Card"));

		UUID deckId = decks.insertDeck(userId, "Upload Trigger Deck", "commander");
		UUID branchId = decks.insertMainBranch(deckId, "main");
		int number = decks.nextVersionNumber(deckId);
		UUID versionId = decks.insertVersion(deckId, number, "v1", branchId, null, null);
		decks.insertVersionCards(versionId, List.of(
				new DeckCardInput(card.id(), 1, "main", null, List.of(), null)));

		Jwt jwt = jwtFor(userId);
		MockMultipartFile file = new MockMultipartFile("file", "art.png", "image/png", FAKE_PNG);

		controller.upload(jwt, card.id(), file, "My Art");

		assertThat(renderService.renderedCardIds).contains(card.id());
	}

	private static RateLimits noLimits() {
		return new RateLimits(new RateLimitProperties(
				false, false, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1));
	}

	private static Card card(String name) {
		return new Card(
				UUID.randomUUID(), UUID.randomUUID(), name, "{1}{G}", 2.0, "Creature — Bear", "Creature",
				"G", "G", "", "2", "2", "set", "Test Set", "1", "common", "Test Artist", null, null, null, null,
				"legal", null, null, List.of());
	}

	private static Jwt jwtFor(UUID userId) {
		return Jwt.withTokenValue("test-token")
				.header("alg", "none")
				.claim("sub", userId.toString())
				.issuedAt(Instant.now())
				.expiresAt(Instant.now().plusSeconds(3600))
				.build();
	}

	private static UUID newUser(String email) {
		jdbc.sql("INSERT INTO users (email, password_hash, display_name) VALUES (:email, 'x', 'Player') "
				+ "ON CONFLICT DO NOTHING").param("email", email).update();
		return jdbc.sql("SELECT id FROM users WHERE email = :email").param("email", email).query(UUID.class).single();
	}
}
