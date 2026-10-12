package io.eregion.deck;

import static io.eregion.deck.Lines.line;
import static io.eregion.deck.Lines.main;
import static io.eregion.deck.Lines.priced;
import static io.eregion.deck.Lines.withRole;
import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;

import io.eregion.deck.DeckDtos.DeckStats;

class StatsCalculatorTest {

	@Test
	void emptyDeckIsAllZeros() {
		DeckStats stats = StatsCalculator.compute(List.of());

		assertThat(stats.totalCards()).isZero();
		assertThat(stats.averageManaValue()).isZero();
		assertThat(stats.curve()).containsExactly(0, 0, 0, 0, 0, 0, 0);
		assertThat(stats.types()).isEmpty();
	}

	@Test
	void onlyCommanderAndMainCount() {
		DeckStats stats = StatsCalculator.compute(List.of(
				line("Atraxa", "Creature", 4, "commander", 1, 1),
				main("Sol Ring", "Artifact", 1, 1),
				line("Mana Drain", "Instant", 2, "maybe", 1, 0),
				line("Farewell", "Sorcery", 6, "considering", 1, 0)));

		assertThat(stats.totalCards()).isEqualTo(2);
		assertThat(stats.types()).containsOnlyKeys("Creature", "Artifact");
	}

	@Test
	void averageAndCurveLeaveLandsOut() {
		DeckStats stats = StatsCalculator.compute(List.of(
				main("Sol Ring", "Artifact", 1, 1),
				main("Cultivate", "Sorcery", 3, 1),
				main("Forest", "Land", 0, 5)));

		assertThat(stats.totalCards()).isEqualTo(7);
		assertThat(stats.lands()).isEqualTo(5);
		assertThat(stats.averageManaValue()).isEqualTo(2.0);
		assertThat(stats.curve()).containsExactly(0, 1, 0, 1, 0, 0, 0);
	}

	@Test
	void sixOrMoreShareTheLastBucket() {
		DeckStats stats = StatsCalculator.compute(List.of(
				main("Consecrated Sphinx", "Creature", 6, 1),
				main("Craterhoof Behemoth", "Creature", 8, 1)));

		assertThat(stats.curve().get(6)).isEqualTo(2);
	}

	@Test
	void averageIsRoundedToTwoDecimals() {
		DeckStats stats = StatsCalculator.compute(List.of(
				main("A", "Instant", 1, 1),
				main("B", "Instant", 1, 1),
				main("C", "Instant", 2, 1)));

		assertThat(stats.averageManaValue()).isEqualTo(1.33);
	}

	@Test
	void ownedNeverExceedsQuantityAndMissingIsTheRest() {
		DeckStats stats = StatsCalculator.compute(List.of(
				line("Forest", "Land", 0, "main", 3, 10),
				line("Rhystic Study", "Enchantment", 3, "main", 1, 0),
				line("Cultivate", "Sorcery", 3, "main", 2, 1)));

		assertThat(stats.totalCards()).isEqualTo(6);
		assertThat(stats.owned()).isEqualTo(4);
		assertThat(stats.missing()).isEqualTo(2);
	}

	@Test
	void typeCountsKeepAStableOrderAndSkipEmptyTypes() {
		DeckStats stats = StatsCalculator.compute(List.of(
				main("Forest", "Land", 0, 2),
				main("Birds of Paradise", "Creature", 1, 1),
				main("Counterspell", "Instant", 2, 1)));

		assertThat(stats.types().keySet()).containsExactly("Creature", "Instant", "Land");
	}

	@Test
	void totalPriceCountsQuantityAndSkipsUnpricedAndBenchedCards() {
		DeckStats stats = StatsCalculator.compute(List.of(
				priced("Sol Ring", "Artifact", 1, 1, 1.50),
				priced("Forest", "Land", 0, 4, 0.25),
				main("Mystery Card", "Instant", 2, 1),
				line("Mana Drain", "Instant", 2, "maybe", 1, 0)));

		assertThat(stats.totalPriceUsd()).isEqualTo(2.5);
	}

	@Test
	void rolesAreCountedWithoutLandsAndTheUntaggedAreUncategorized() {
		DeckStats stats = StatsCalculator.compute(List.of(
				withRole(main("Sol Ring", "Artifact", 1, 1), "Ramp"),
				withRole(main("Cultivate", "Sorcery", 3, 2), "Ramp"),
				withRole(main("Swords to Plowshares", "Instant", 1, 1), "Removal"),
				main("Grizzly Bears", "Creature", 2, 1),
				withRole(main("Command Tower", "Land", 0, 1), "Ramp")));

		assertThat(stats.roles()).containsExactly(
				java.util.Map.entry("Removal", 1), java.util.Map.entry("Ramp", 3), java.util.Map.entry("Uncategorized", 1));
	}
}
