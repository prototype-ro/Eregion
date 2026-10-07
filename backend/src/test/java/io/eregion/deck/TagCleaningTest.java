package io.eregion.deck;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Arrays;
import java.util.List;

import org.junit.jupiter.api.Test;

class TagCleaningTest {

	@Test
	void trimsAndSingleSpacesTags() {
		assertThat(DeckService.cleanTags(List.of("  Mana   Rocks ", "Ramp"))).containsExactly("Mana Rocks", "Ramp");
	}

	@Test
	void dropsDuplicatesIgnoringCaseAndKeepsTheFirstSpelling() {
		assertThat(DeckService.cleanTags(List.of("Ramp", "ramp", " RAMP ", "Draw"))).containsExactly("Ramp", "Draw");
	}

	@Test
	void ignoresBlankTags() {
		assertThat(DeckService.cleanTags(Arrays.asList("", "   ", null, "Win condition"))).containsExactly("Win condition");
	}

	@Test
	void nullMeansNoTags() {
		assertThat(DeckService.cleanTags(null)).isEmpty();
	}
}
