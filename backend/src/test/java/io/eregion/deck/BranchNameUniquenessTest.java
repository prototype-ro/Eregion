package io.eregion.deck;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.UUID;

import io.eregion.support.PostgresTest;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;

/**
 * Branch names are compared ignoring case, like emails and card names. The migration also has to
 * clean up decks that already hold two spellings of the same name.
 */
class BranchNameUniquenessTest extends PostgresTest {

	@Test
	void variantsOfOneNameCannotCoexist() {
		UUID deck = newDeck("case-conflict@example.com");
		insertBranch(deck, "Side", null);

		assertThatThrownBy(() -> insertBranch(deck, "side", null))
				.isInstanceOf(DataIntegrityViolationException.class);
	}

	@Test
	void twoDecksMayUseTheSameBranchName() {
		UUID first = newDeck("first-deck@example.com");
		UUID second = newDeck("second-deck@example.com");

		insertBranch(first, "Side", null);
		insertBranch(second, "side", null);

		assertThat(jdbc.sql("SELECT COUNT(*) FROM deck_branches WHERE lower(name) = 'side'")
				.query(Integer.class).single()).isEqualTo(2);
	}

	@Test
	void migrationRenamesExistingDuplicates() {
		String schema = "branch_dedup";
		jdbc.sql("CREATE SCHEMA " + schema).update();

		Flyway.configure().dataSource(dataSource).schemas(schema).defaultSchema(schema).target("20").load().migrate();

		jdbc.sql("INSERT INTO " + schema + ".users (email, password_hash, display_name) "
				+ "VALUES ('dup@example.com', 'x', 'Dup')").update();
		UUID deck = jdbc.sql("INSERT INTO " + schema + ".decks (owner_id, name) "
				+ "SELECT id, 'Deck' FROM " + schema + ".users WHERE email = 'dup@example.com' "
				+ "RETURNING id").query(UUID.class).single();
		jdbc.sql("INSERT INTO " + schema + ".deck_branches (deck_id, name, created_at) "
				+ "VALUES (:deck, 'Side', now() - interval '3 minutes'), "
				+ "(:deck, 'side', now() - interval '2 minutes'), "
				+ "(:deck, 'SIDE', now() - interval '1 minute')")
				.param("deck", deck).update();

		Flyway.configure().dataSource(dataSource).schemas(schema).defaultSchema(schema).load().migrate();

		List<String> names = jdbc.sql("SELECT name FROM " + schema + ".deck_branches "
				+ "WHERE deck_id = :deck ORDER BY created_at").param("deck", deck).query(String.class).list();
		assertThat(names).containsExactly("Side", "side 2", "SIDE 3");
	}

	private static UUID newDeck(String email) {
		jdbc.sql("INSERT INTO users (email, password_hash, display_name) VALUES (:email, 'x', 'Player') "
				+ "ON CONFLICT DO NOTHING").param("email", email).update();
		return jdbc.sql("INSERT INTO decks (owner_id, name) "
				+ "SELECT id, 'Deck' FROM users WHERE email = :email RETURNING id")
				.param("email", email).query(UUID.class).single();
	}

	private static void insertBranch(UUID deck, String name, UUID forkedFrom) {
		jdbc.sql("INSERT INTO deck_branches (deck_id, name, forked_from_version_id) VALUES (:deck, :name, :fork)")
				.param("deck", deck).param("name", name).param("fork", forkedFrom).update();
	}
}
