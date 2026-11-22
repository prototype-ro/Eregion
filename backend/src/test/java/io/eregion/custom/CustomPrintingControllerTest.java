package io.eregion.custom;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.oauth2.jwt.Jwt;

import io.eregion.card.Card;
import io.eregion.card.CardRepository;
import io.eregion.custom.CustomPrintingRepository.CustomPrinting;
import io.eregion.ratelimit.RateLimitProperties;
import io.eregion.ratelimit.RateLimits;
import io.eregion.support.PostgresTest;

/**
 * No MockMvc/web-layer test harness exists in this codebase (see CustomPrintingRepositoryTest). This
 * follows the same convention: wire the real repository and controller by hand against a real
 * Postgres and call the controller's own methods directly.
 */
class CustomPrintingControllerTest extends PostgresTest {

	/** A real 488 x 680 PNG: uploads are checked for a readable size, so a bare signature is refused. */
	private static final byte[] PNG = png(488, 680);

	private static byte[] png(int width, int height) {
		try {
			var out = new java.io.ByteArrayOutputStream();
			javax.imageio.ImageIO.write(new java.awt.image.BufferedImage(width, height, java.awt.image.BufferedImage.TYPE_INT_RGB), "png", out);
			return out.toByteArray();
		}
		catch (java.io.IOException ex) {
			throw new IllegalStateException(ex);
		}
	}

	@Test
	void upload_storesTheCustomPrinting() throws Exception {
		CustomPrintingRepository repository = new CustomPrintingRepository(jdbc);
		CardRepository cards = new CardRepository(jdbc);
		CustomPrintingController controller = new CustomPrintingController(repository, cards, noLimits(), new ArtStorage(jdbc, new io.eregion.common.AdvisoryLock(dataSource), (ArtStore) null), 100, 20480);

		UUID userId = newUser("custom-upload@example.com");
		Card card = cards.upsert(card("Upload Test Card"));
		Jwt jwt = jwtFor(userId);
		MockMultipartFile file = new MockMultipartFile("file", "art.png", "image/png", PNG);

		CustomPrinting created = controller.upload(jwt, card.id(), file, "My Art");

		assertThat(created.cardId()).isEqualTo(card.id());
		assertThat(created.label()).isEqualTo("My Art");
		assertThat(repository.findOwned(created.id(), userId)).isPresent();
	}

	private static RateLimits noLimits() {
		return new RateLimits(new RateLimitProperties(
				false, false, "", 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1));
	}

	private static Card card(String name) {
		return new Card(
				UUID.randomUUID(), UUID.randomUUID(), name, "{1}{G}", 2.0, "Creature — Bear", "Creature",
				"G", "G", "", "2", "2", "set", "Test Set", "1", "common", "Test Artist", null, "", "", "",
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
