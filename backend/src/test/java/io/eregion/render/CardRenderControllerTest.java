package io.eregion.render;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import io.eregion.card.Card;
import io.eregion.card.CardRepository;
import io.eregion.support.PostgresTest;

/**
 * No MockMvc/web-layer test harness exists elsewhere in this codebase (see
 * DeckFrameSettingsControllerTest). This follows the same convention: wire the real repository and
 * controller by hand against a real Postgres and drive the controller's own methods.
 */
class CardRenderControllerTest extends PostgresTest {

	@Test
	void getImage_returnsStoredPng() {
		CardRenderRepository repository = new CardRenderRepository(jdbc);
		CardRenderController controller = new CardRenderController(repository, new CardRenderService());
		UUID cardId = insertCard("Render Test Card");
		byte[] fakePng = new byte[] { (byte) 0x89, 'P', 'N', 'G' };

		repository.upsert(cardId, fakePng, "hash-123");

		ResponseEntity<byte[]> response = controller.getImage(cardId);

		assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
		assertThat(response.getHeaders().getContentType()).isEqualTo(org.springframework.http.MediaType.IMAGE_PNG);
		assertThat(response.getBody()).isEqualTo(fakePng);
	}

	@Test
	void getImage_missingRender_returns404() {
		CardRenderRepository repository = new CardRenderRepository(jdbc);
		CardRenderController controller = new CardRenderController(repository, new CardRenderService());

		ResponseEntity<byte[]> response = controller.getImage(UUID.randomUUID());

		assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
	}

	private static UUID insertCard(String name) {
		CardRepository cards = new CardRepository(jdbc);
		Card inserted = cards.upsert(new Card(UUID.randomUUID(), UUID.randomUUID(), name, "{1}{U}", 2, "Creature - Test",
				"Creature", "U", "U", "Test oracle text.", "set", "Test Set", "1", "common", "Test Artist", 1.0,
				null, null, null, "legal"));
		return inserted.id();
	}
}
