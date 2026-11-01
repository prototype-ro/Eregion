package io.eregion.render;

import static org.assertj.core.api.Assertions.assertThat;

import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.List;
import java.util.UUID;

import javax.imageio.ImageIO;

import org.junit.jupiter.api.Test;

import io.eregion.card.Card;
import io.eregion.card.CardRepository;
import io.eregion.deck.DeckRepository;
import io.eregion.support.PostgresTest;

/**
 * Follows the hand-wired convention used elsewhere in this package (see {@code DeckFrameSettingsControllerTest}):
 * no Spring context, the real repositories and service wired by hand against a real Postgres.
 */
class CardRenderServiceTest extends PostgresTest {

	@Test
	void render_compositesArtFrameAndText_andStoresAReadableImage() throws IOException {
		CardRepository cardRepository = new CardRepository(jdbc);
		CardRenderRepository renderRepository = new CardRenderRepository(jdbc);
		DeckFrameSettingsRepository frameSettingsRepository = new DeckFrameSettingsRepository(jdbc);
		DeckRepository decks = new DeckRepository(jdbc, new org.springframework.jdbc.core.JdbcTemplate(dataSource));

		CardRenderService service = new CardRenderService(
				cardRepository, renderRepository, new FrameLayoutLoader(), frameSettingsRepository);

		UUID ownerId = newUser("card-render-service@example.com");
		UUID deckId = decks.insertDeck(ownerId, "Render Service Test Deck", "commander");

		Card card = cardRepository.upsert(new Card(
				UUID.randomUUID(), UUID.randomUUID(), "Grizzly Bears", "{1}{G}", 2.0, "Creature — Bear", "Creature",
				"G", "G", "", "2", "2", "set", "Test Set", "1", "common", "Test Artist", null, null, null, null,
				"legal", null, null, List.of()));

		byte[] artBytes = tinyPng();

		service.render(deckId, card.id(), artBytes);

		CardRenderRepository.CardRenderRow row = renderRepository.findVisibleTo(deckId, card.id(), ownerId).orElseThrow();

		assertThat(row.imageData()).isNotEmpty();
		BufferedImage decoded = ImageIO.read(new ByteArrayInputStream(row.imageData()));
		assertThat(decoded.getWidth()).isEqualTo(FrameLayout.CARD_WIDTH);
		assertThat(decoded.getHeight()).isEqualTo(FrameLayout.CARD_HEIGHT);
	}

	private static byte[] tinyPng() throws IOException {
		BufferedImage art = new BufferedImage(10, 10, BufferedImage.TYPE_INT_RGB);
		ByteArrayOutputStream out = new ByteArrayOutputStream();
		ImageIO.write(art, "png", out);
		return out.toByteArray();
	}

	private static UUID newUser(String email) {
		jdbc.sql("INSERT INTO users (email, password_hash, display_name) VALUES (:email, 'x', 'Player') "
				+ "ON CONFLICT DO NOTHING").param("email", email).update();
		return jdbc.sql("SELECT id FROM users WHERE email = :email").param("email", email).query(UUID.class).single();
	}
}
