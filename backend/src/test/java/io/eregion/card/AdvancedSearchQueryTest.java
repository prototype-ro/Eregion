package io.eregion.card;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;

class AdvancedSearchQueryTest {

	@Test
	void thePersonsSyntaxIsKeptAndEregionsOwnOptionsAreAdded() {
		assertThat(AdvancedSearchQuery.build("t:dragon c:r mv<=5", true, List.of()))
				.isEqualTo("t:dragon c:r mv<=5 f:commander game:paper");
		assertThat(AdvancedSearchQuery.build("t:dragon", false, List.of())).isEqualTo("t:dragon game:paper");
	}

	@Test
	void aRoleBecomesAnOrOfItsTags() {
		assertThat(AdvancedSearchQuery.build("c:g", true, List.of("ramp", "mana-rock")))
				.isEqualTo("c:g (otag:ramp or otag:mana-rock) f:commander game:paper");
		assertThat(AdvancedSearchQuery.build("", true, List.of("removal"))).isEqualTo("(otag:removal) f:commander game:paper");
	}

	@Test
	void anEmptySearchIsNotASearchForEverything() {
		assertThat(AdvancedSearchQuery.build("   ", true, List.of())).isNull();
		assertThat(AdvancedSearchQuery.build(null, true, List.of())).isNull();
	}

	@Test
	void optionsThePageOwnsCannotBeSetFromTheText() {
		assertThat(AdvancedSearchQuery.clean("t:elf unique:prints prefer:oldest order:usd game:arena -include:extras lang:ja"))
				.isEqualTo("t:elf");
	}

	@Test
	void controlCharactersAreTakenOutAndLongTextIsCut() {
		assertThat(AdvancedSearchQuery.clean("t:elf\nc:g\u0000")).isEqualTo("t:elf c:g");
		String long400 = "a".repeat(500);
		assertThat(AdvancedSearchQuery.build(long400, false, List.of())).startsWith("a".repeat(400) + " game:paper");
	}

	@Test
	void orderAndDirectionFallBackToSafeValues() {
		assertThat(AdvancedSearchQuery.order("EDHREC")).isEqualTo("edhrec");
		assertThat(AdvancedSearchQuery.order("drop table")).isEqualTo("name");
		assertThat(AdvancedSearchQuery.direction("DESC")).isEqualTo("desc");
		assertThat(AdvancedSearchQuery.direction("sideways")).isEqualTo("asc");
	}
}
