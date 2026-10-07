package io.eregion.card;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class NameNormalizerTest {

	@Test
	void caseDoesNotMatter() {
		assertThat(NameNormalizer.normalize("SOL RING")).isEqualTo("sol ring").isEqualTo(NameNormalizer.normalize("Sol Ring"));
	}

	@Test
	void curlyQuotesBecomePlainOnes() {
		assertThat(NameNormalizer.normalize("Atraxa, Praetors’ Voice")).isEqualTo("atraxa, praetors' voice");
		assertThat(NameNormalizer.normalize("Atraxa, Praetors‘ Voice")).isEqualTo("atraxa, praetors' voice");
		assertThat(NameNormalizer.normalize("“Quoted”")).isEqualTo("\"quoted\"");
	}

	@Test
	void accentsAreDropped() {
		assertThat(NameNormalizer.normalize("Lim-Dûl's Vault")).isEqualTo("lim-dul's vault");
		assertThat(NameNormalizer.normalize("Jötun Grunt")).isEqualTo(NameNormalizer.normalize("Jotun Grunt"));
		assertThat(NameNormalizer.normalize("Séance")).isEqualTo("seance");
	}

	@Test
	void ligaturesAreSpelledOut() {
		assertThat(NameNormalizer.normalize("Æther Vial")).isEqualTo("aether vial").isEqualTo(NameNormalizer.normalize("Aether Vial"));
		assertThat(NameNormalizer.normalize("Œuvre")).isEqualTo("oeuvre");
		assertThat(NameNormalizer.normalize("Straße")).isEqualTo("strasse");
	}

	@Test
	void spacesAreCollapsedAndTrimmed() {
		assertThat(NameNormalizer.normalize("  Sol   Ring \t")).isEqualTo("sol ring");
	}

	@Test
	void dashesBecomePlainHyphens() {
		assertThat(NameNormalizer.normalize("Jace—Vryn")).isEqualTo("jace-vryn");
	}

	@Test
	void nullIsEmpty() {
		assertThat(NameNormalizer.normalize(null)).isEmpty();
	}

	@Test
	void searchFormKeepsAccentsButStraightensQuotes() {
		assertThat(NameNormalizer.forSearch("  Atraxa, Praetors’  Voice ")).isEqualTo("Atraxa, Praetors' Voice");
		assertThat(NameNormalizer.forSearch("Æther Vial")).isEqualTo("Æther Vial");
	}
}
