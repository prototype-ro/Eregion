package io.eregion.analysis;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;

import org.junit.jupiter.api.Test;

import io.eregion.support.PostgresTest;

/** Which versions get a bracket worked out: the ones a list shows, once they are a whole deck. */
class BracketCacheTest extends PostgresTest {

	private static UUID card(String name) {
		return jdbc.sql("INSERT INTO cards (scryfall_id, name, type_line, primary_type) VALUES (gen_random_uuid(), :name, 'Land', 'Land') RETURNING id")
				.param("name", name).query(UUID.class).single();
	}

	private static UUID version(UUID deck, int number, UUID card, int copies) {
		UUID branch = jdbc.sql("SELECT id FROM deck_branches WHERE deck_id = :d").param("d", deck).query(UUID.class).optional()
				.orElseGet(() -> jdbc.sql("INSERT INTO deck_branches (deck_id, name, is_main) VALUES (:d, 'main', true) RETURNING id").param("d", deck)
						.query(UUID.class).single());
		UUID version = jdbc.sql("INSERT INTO deck_versions (deck_id, branch_id, version_number) VALUES (:d, :b, :n) RETURNING id")
				.param("d", deck).param("b", branch).param("n", number).query(UUID.class).single();
		jdbc.sql("INSERT INTO deck_version_cards (version_id, card_id, board, quantity) VALUES (:v, :c, 'main', :q)")
				.param("v", version).param("c", card).param("q", copies).update();
		return version;
	}

	@Test
	void picksEachDecksLatestWholeVersionAndSkipsTheRest() {
		UUID owner = jdbc.sql("INSERT INTO users (email, password_hash, display_name) VALUES ('bracket-cache@example.com', 'x', 'P') RETURNING id")
				.query(UUID.class).single();
		UUID deck = jdbc.sql("INSERT INTO decks (owner_id, name) VALUES (:o, 'Whole') RETURNING id").param("o", owner).query(UUID.class).single();
		UUID small = jdbc.sql("INSERT INTO decks (owner_id, name) VALUES (:o, 'Small') RETURNING id").param("o", owner).query(UUID.class).single();
		UUID forest = card("Bracket Cache Forest");

		UUID older = version(deck, 1, forest, 99);
		UUID latest = version(deck, 2, forest, 99);
		UUID tiny = version(small, 1, forest, 20);

		BracketCache cache = new BracketCache(jdbc, null, null);
		assertThat(cache.pending(100)).contains(latest).doesNotContain(older, tiny);

		jdbc.sql("INSERT INTO version_brackets (version_id, bracket, name) VALUES (:v, 3, 'Upgraded')").param("v", latest).update();
		assertThat(cache.pending(100)).doesNotContain(latest);
	}
}
