package io.eregion.deck;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import io.eregion.card.ScryfallCard;

/** Which Scryfall cards can be a backdrop, and how a typed name becomes a Scryfall search. No network. */
class ArtSeriesTest {

	private static ScryfallCard card(String setName, ScryfallCard.ImageUris faceImages) {
		var face = new ScryfallCard.Face("Wurmcoil Engine", null, "Card", null, "Raymond Swanland", faceImages, null, null);
		return new ScryfallCard(UUID.randomUUID().toString(), "Wurmcoil Engine // Wurmcoil Engine", null, 0.0, "Card // Card", List.of(), List.of(), null,
				"aso", setName, "12", "2021-01-01", "common", "Raymond Swanland", null, null, List.of(face, face), null, null, null);
	}

	@Test
	void anArtSeriesCardBecomesABackdrop() {
		var art = ArtSeries.toBackdrop(card("Scars of Mirrodin Art Series", new ScryfallCard.ImageUris("s", "n", "https://cards.scryfall.io/art_crop/x.jpg")));
		assertThat(art).isPresent();
		assertThat(art.get().name()).isEqualTo("Wurmcoil Engine");
		assertThat(art.get().artist()).isEqualTo("Raymond Swanland");
		assertThat(art.get().artUrl()).isEqualTo("https://cards.scryfall.io/art_crop/x.jpg");
	}

	@Test
	void otherCardsCardsWithoutArtAndOtherHostsAreRefused() {
		assertThat(ArtSeries.toBackdrop(card("Scars of Mirrodin", new ScryfallCard.ImageUris("s", "n", "https://cards.scryfall.io/art_crop/x.jpg")))).isEmpty();
		assertThat(ArtSeries.toBackdrop(card("Scars of Mirrodin Art Series", null))).isEmpty();
		assertThat(ArtSeries.toBackdrop(card("Scars of Mirrodin Art Series", new ScryfallCard.ImageUris("s", "n", "https://example.com/x.jpg")))).isEmpty();
	}

	@Test
	void aShuffleDrawsDifferentCardsFromThePool() {
		List<BackdropRepository.Backdrop> pool = java.util.stream.IntStream.range(0, 20)
				.mapToObj(n -> new BackdropRepository.Backdrop(UUID.randomUUID(), "Card " + n, null, "Set Art Series", "https://cards.scryfall.io/art_crop/" + n + ".jpg"))
				.toList();
		var drawn = ArtSeries.pick(pool, 4, new java.util.Random(7));
		assertThat(drawn).hasSize(4).doesNotHaveDuplicates().allMatch(pool::contains);
		// A small pool gives what it has.
		assertThat(ArtSeries.pick(pool.subList(0, 2), 4, new java.util.Random(7))).hasSize(2);
		assertThat(ArtSeries.pick(List.of(), 4, new java.util.Random(7))).isEmpty();
	}

	@Test
	void searchTextIsCleanedBeforeItReachesScryfall() {
		assertThat(ArtSeries.query("  Wurmcoil \"Engine\"  ")).isEqualTo("layout:art-series name:\"Wurmcoil Engine\"");
		assertThat(ArtSeries.query("a")).isNull();
		assertThat(ArtSeries.query(null)).isNull();
	}
}
