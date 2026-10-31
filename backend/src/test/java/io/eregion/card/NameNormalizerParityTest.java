package io.eregion.card;

import static org.assertj.core.api.Assertions.assertThat;

import io.eregion.support.PostgresTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * The API resolves names by sending {@link NameNormalizer#normalize} output to queries that compare
 * it against {@code eregion_norm(cards.name)}. These tests pin the two implementations together.
 */
class NameNormalizerParityTest extends PostgresTest {

	@ParameterizedTest
	@ValueSource(strings = {
			"Sol Ring",
			"SOL RING",
			"Atraxa, Praetors’ Voice",
			"Atraxa, Praetors‘ Voice",
			"“Quoted”",
			"Lim-Dûl's Vault",
			"Jötun Grunt",
			"Séance",
			"Æther Vial",
			"Aether Vial",
			"Œuvre",
			"Straße",
			"  Sol   Ring \t",
			"Jace—Vryn",
			"Jace‐Vryn",
			"Jace‑Vryn",
			"Jace‒Vryn",
			"Lórien Revealed",
			"Éowyn, Shieldmaiden",
			"K'rrik, Son of Yawgmoth",
			"Fire // Ice",
			"Nissa, Who Shakes the World",
			"Tamiyo, Collector of Tales",
			"Ulamog, the Ceaseless Hunger",
			"Márton Stromgald",
			"Dûnharrow",
			"",
	})
	void sqlMatchesJava(String name) {
		assertThat(normalizeInSql(name)).isEqualTo(NameNormalizer.normalize(name));
	}

	@Test
	void sqlFoldsLigaturesQuotesAndSpaces() {
		assertThat(normalizeInSql("Æther Vial")).isEqualTo("aether vial");
		assertThat(normalizeInSql("Straße")).isEqualTo("strasse");
		assertThat(normalizeInSql("Atraxa, Praetors’ Voice")).isEqualTo("atraxa, praetors' voice");
		assertThat(normalizeInSql("  Sol   Ring \t")).isEqualTo("sol ring");
	}

	private static String normalizeInSql(String name) {
		return jdbc.sql("SELECT eregion_norm(:name)").param("name", name).query(String.class).single();
	}
}
