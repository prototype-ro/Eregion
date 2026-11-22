package io.eregion.auth;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;

import io.eregion.ratelimit.RateLimitProperties;
import io.eregion.ratelimit.RateLimits;
import io.eregion.support.PostgresTest;
import tools.jackson.databind.json.JsonMapper;

/** The data download holds the player's decks, versions and cards, and turns into JSON (Postgres arrays included). */
class DataExportTest extends PostgresTest {

	@Test
	@SuppressWarnings("unchecked")
	void exportsDecksVersionsAndCardsAsJson() {
		UUID user = jdbc.sql("INSERT INTO users (email, password_hash, display_name) VALUES ('export@example.com', 'x', 'Exporter') RETURNING id")
				.query(UUID.class).single();
		UUID card = jdbc.sql("INSERT INTO cards (scryfall_id, name, type_line, primary_type) VALUES (gen_random_uuid(), 'Export Ring', 'Artifact', 'Artifact') RETURNING id")
				.query(UUID.class).single();
		UUID deck = jdbc.sql("INSERT INTO decks (owner_id, name) VALUES (:u, 'Export deck') RETURNING id").param("u", user).query(UUID.class).single();
		UUID branch = jdbc.sql("INSERT INTO deck_branches (deck_id, name, is_main) VALUES (:d, 'main', true) RETURNING id").param("d", deck)
				.query(UUID.class).single();
		UUID version = jdbc.sql("INSERT INTO deck_versions (deck_id, branch_id, version_number, note) VALUES (:d, :b, 1, 'first') RETURNING id")
				.param("d", deck).param("b", branch).query(UUID.class).single();
		jdbc.sql("INSERT INTO deck_version_cards (version_id, card_id, board, quantity, tags) VALUES (:v, :c, 'main', 1, ARRAY['ramp','early'])")
				.param("v", version).param("c", card).update();

		RateLimits open = new RateLimits(new RateLimitProperties(false, false, "", 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1));
		Jwt jwt = Jwt.withTokenValue("t").header("alg", "none").claim("sub", user.toString()).issuedAt(Instant.now())
				.expiresAt(Instant.now().plusSeconds(60)).build();
		Map<String, Object> export = new DataExportController(jdbc, open).export(jwt).getBody();

		String json = JsonMapper.builder().build().writeValueAsString(export);
		assertThat(json).contains("Export deck", "Export Ring", "ramp, early", "first");
		List<Map<String, Object>> decks = (List<Map<String, Object>>) export.get("decks");
		assertThat(decks).hasSize(1);
		assertThat((List<?>) decks.get(0).get("versions")).hasSize(1);
	}
}
