package io.eregion.render;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.Jwt;

import io.eregion.deck.DeckRepository;
import io.eregion.render.DeckFrameSettingsService.FrameSettingsRequest;
import io.eregion.support.PostgresTest;

/**
 * No MockMvc/web-layer test harness exists elsewhere in this codebase (controller behaviour is
 * exercised by wiring the real classes against Postgres, as in BranchNameUniquenessTest). This test
 * follows that convention: it wires the real repository, service and controller by hand and drives
 * the controller's own methods, rather than inventing a new MockMvc setup for this one endpoint.
 */
class DeckFrameSettingsControllerTest extends PostgresTest {

	private DeckFrameSettingsController controller;
	private UUID deckId;
	private Jwt jwt;

	@BeforeEach
	void setUp() {
		JdbcTemplate template = new JdbcTemplate(dataSource);
		DeckRepository decks = new DeckRepository(jdbc, template);
		DeckFrameSettingsRepository repository = new DeckFrameSettingsRepository(jdbc);
		DeckRenderTrigger renderTrigger = new DeckRenderTrigger(mock(CardRenderService.class), mock(ArtLookup.class), decks);
		DeckFrameSettingsService service = new DeckFrameSettingsService(repository, decks, renderTrigger);
		controller = new DeckFrameSettingsController(service);

		UUID userId = newUser("frame-settings@example.com");
		deckId = decks.insertDeck(userId, "Frame Test Deck", "commander");
		jwt = Jwt.withTokenValue("test-token")
				.header("alg", "none")
				.claim("sub", userId.toString())
				.issuedAt(Instant.now())
				.expiresAt(Instant.now().plusSeconds(3600))
				.build();
	}

	@Test
	void putThenGet_roundTripsSettings() {
		controller.put(jwt, deckId, new FrameSettingsRequest("Jane Doe", "ERG", "m15"));

		DeckFrameSettingsRepository.FrameSettingsRow settings = controller.get(jwt, deckId);

		assertThat(settings.artistName()).isEqualTo("Jane Doe");
		assertThat(settings.collectionCode()).isEqualTo("ERG");
		assertThat(settings.frameFamily()).isEqualTo("m15");
	}

	@Test
	void getBeforeAnySave_returnsDefaults() {
		DeckFrameSettingsRepository.FrameSettingsRow settings = controller.get(jwt, deckId);

		assertThat(settings.artistName()).isNull();
		assertThat(settings.collectionCode()).isNull();
		assertThat(settings.frameFamily()).isEqualTo("m15");
	}

	private static UUID newUser(String email) {
		jdbc.sql("INSERT INTO users (email, password_hash, display_name) VALUES (:email, 'x', 'Player') "
				+ "ON CONFLICT DO NOTHING").param("email", email).update();
		return jdbc.sql("SELECT id FROM users WHERE email = :email").param("email", email).query(UUID.class).single();
	}
}
