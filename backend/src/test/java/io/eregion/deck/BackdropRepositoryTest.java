package io.eregion.deck;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;

import org.junit.jupiter.api.Test;

import io.eregion.support.PostgresTest;

/** A deck shows its commander's art until the owner chooses other art, which replaces any earlier choice. */
class BackdropRepositoryTest extends PostgresTest {

	private static UUID deck() {
		UUID owner = jdbc.sql("INSERT INTO users (email, password_hash, display_name) VALUES (:e, 'x', 'x') RETURNING id")
				.param("e", "backdrop-" + UUID.randomUUID() + "@example.com").query(UUID.class).single();
		return jdbc.sql("INSERT INTO decks (owner_id, name) VALUES (:o, 'Backdrop deck') RETURNING id").param("o", owner).query(UUID.class).single();
	}

	@Test
	void aDeckShowsItsCommanderUntilTheOwnerChoosesArt() {
		BackdropRepository backdrops = new BackdropRepository(jdbc);
		UUID deck = deck();
		assertThat(backdrops.find(deck)).isEmpty();

		var art = new BackdropRepository.Backdrop(UUID.randomUUID(), "Wurmcoil Engine", "Raymond Swanland", "Scars Art Series",
				"https://cards.scryfall.io/art_crop/front/a/b/x.jpg");
		backdrops.save(deck, art);
		assertThat(backdrops.find(deck)).contains(art);

		var other = new BackdropRepository.Backdrop(UUID.randomUUID(), "Sol Ring", null, null, "https://cards.scryfall.io/art_crop/front/c/d/y.jpg");
		backdrops.save(deck, other);
		assertThat(backdrops.find(deck)).contains(other);

		backdrops.clear(deck);
		assertThat(backdrops.find(deck)).isEmpty();
	}
}
