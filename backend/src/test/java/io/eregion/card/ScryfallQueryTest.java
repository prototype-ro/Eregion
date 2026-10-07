package io.eregion.card;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class ScryfallQueryTest {

	@Test
	void plainNamesPassThrough() {
		assertThat(ScryfallQuery.sanitize("garland")).isEqualTo("garland");
		assertThat(ScryfallQuery.sanitize("  Atraxa, Praetors' Voice ")).isEqualTo("Atraxa, Praetors' Voice");
		assertThat(ScryfallQuery.sanitize("Mana   Drain")).isEqualTo("Mana Drain");
	}

	@Test
	void searchSyntaxIsStrippedSoOnlyNamesCanBeSearched() {
		assertThat(ScryfallQuery.sanitize("o:flying t:creature")).isEqualTo("o flying t creature");
		assertThat(ScryfallQuery.sanitize("\"mana\" OR (cmc>=3)")).isEqualTo("mana OR cmc 3");
		assertThat(ScryfallQuery.sanitize("-is:funny")).isEqualTo("is funny");
		assertThat(ScryfallQuery.sanitize("mana -drain")).isEqualTo("mana drain");
	}

	@Test
	void tooShortOrEmptyInputGivesNothing() {
		assertThat(ScryfallQuery.sanitize(null)).isEmpty();
		assertThat(ScryfallQuery.sanitize("")).isEmpty();
		assertThat(ScryfallQuery.sanitize("a")).isEmpty();
		assertThat(ScryfallQuery.sanitize(":::")).isEmpty();
	}

	@Test
	void accentedLettersSurvive() {
		assertThat(ScryfallQuery.sanitize("Lim-Dul")).isEqualTo("Lim-Dul");
		assertThat(ScryfallQuery.sanitize("Jötun Grunt")).isEqualTo("Jötun Grunt");
	}

	@Test
	void restrictsResultsToPaperCards() {
		assertThat(ScryfallQuery.toScryfall("garland")).isEqualTo("garland game:paper");
	}
}
