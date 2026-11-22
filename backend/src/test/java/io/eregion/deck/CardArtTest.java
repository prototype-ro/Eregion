package io.eregion.deck;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import io.eregion.support.PostgresTest;

/** Backdrop art comes from cards in the catalog: a few at random, found by name, or looked up by the printing chosen. */
class CardArtTest extends PostgresTest {

	private static UUID card(String name, String art) {
		UUID scryfall = UUID.randomUUID();
		jdbc.sql("""
				INSERT INTO cards (scryfall_id, name, type_line, primary_type, artist, set_name, image_art_crop)
				VALUES (:s, :n, 'Creature', 'Creature', 'Some Artist', 'Some Set', :a)
				""").param("s", scryfall).param("n", name).param("a", art == null ? "" : art).update();
		return scryfall;
	}

	@Test
	void aShuffleGivesDifferentCardsThatHaveArt() {
		for (int n = 0; n < 6; n++) {
			card("Shuffle Card " + n + " " + UUID.randomUUID(), "https://cards.scryfall.io/art_crop/front/s/" + n + ".jpg");
		}
		card("No Art Card " + UUID.randomUUID(), null);
		List<BackdropRepository.Backdrop> drawn = new CardArt(jdbc).random(4);
		assertThat(drawn).hasSize(4).doesNotHaveDuplicates().allMatch(art -> art.artUrl() != null && art.artUrl().startsWith("https://"));
	}

	@Test
	void cardsAreFoundByPartOfTheirName() {
		String unique = "Zephyrvault " + UUID.randomUUID().toString().substring(0, 6);
		card(unique + " Drake", "https://cards.scryfall.io/art_crop/front/z/1.jpg");
		List<BackdropRepository.Backdrop> found = new CardArt(jdbc).search(unique.toLowerCase());
		assertThat(found).extracting(BackdropRepository.Backdrop::name).containsExactly(unique + " Drake");
		assertThat(new CardArt(jdbc).search("z")).isEmpty();
	}

	@Test
	void aChosenCardIsLookedUpAgainInTheCatalog() {
		UUID id = card("Chosen Card " + UUID.randomUUID(), "https://cards.scryfall.io/art_crop/front/c/1.jpg");
		CardArt art = new CardArt(jdbc);
		assertThat(art.byId(id)).isPresent().get().extracting(BackdropRepository.Backdrop::artUrl).isEqualTo("https://cards.scryfall.io/art_crop/front/c/1.jpg");
		assertThat(art.byId(UUID.randomUUID())).isEmpty();
	}
}
