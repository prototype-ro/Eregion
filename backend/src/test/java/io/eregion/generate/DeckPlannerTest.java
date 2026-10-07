package io.eregion.generate;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.Test;

import io.eregion.generate.DeckPlanner.Pick;
import io.eregion.generate.DeckPlanner.Plan;
import io.eregion.generate.DeckPlanner.Pool;

class DeckPlannerTest {

	private static final Set<String> NONE = Set.of();

	@Test
	void fillsEachPoolInOrderTakingTheBestCardsFirst() {
		Plan plan = DeckPlanner.plan(
				List.of(new Pool("Ramp", 2, List.of("Sol Ring", "Arcane Signet", "Mind Stone")),
						new Pool("Draw", 1, List.of("Rhystic Study", "Phyrexian Arena"))),
				List.of(), 3, name -> true, NONE);

		assertThat(plan.picks()).containsExactly(new Pick("Sol Ring", "Ramp"), new Pick("Arcane Signet", "Ramp"),
				new Pick("Rhystic Study", "Draw"));
		assertThat(plan.notes()).isEmpty();
	}

	@Test
	void aCardIsUsedOnlyOnceEvenIfSeveralPoolsWantIt() {
		Plan plan = DeckPlanner.plan(
				List.of(new Pool("Ramp", 1, List.of("Cultivate")), new Pool("Lands matter", 2, List.of("Cultivate", "Explore", "Farseek"))),
				List.of(), 3, name -> true, NONE);

		assertThat(plan.picks()).extracting(Pick::name).containsExactly("Cultivate", "Explore", "Farseek");
	}

	@Test
	void sameCardWithDifferentCapitalizationCountsAsTheSameCard() {
		Plan plan = DeckPlanner.plan(List.of(new Pool("A", 1, List.of("Sol Ring")), new Pool("B", 1, List.of("sol ring", "Mind Stone"))),
				List.of(), 2, name -> true, NONE);

		assertThat(plan.picks()).extracting(Pick::name).containsExactly("Sol Ring", "Mind Stone");
	}

	@Test
	void theCommanderIsNeverPicked() {
		Plan plan = DeckPlanner.plan(List.of(new Pool("Synergy", 2, List.of("Atraxa, Praetors' Voice", "Sol Ring"))), List.of("Mind Stone"),
				2, name -> true, Set.of("Atraxa, Praetors' Voice"));

		assertThat(plan.picks()).extracting(Pick::name).containsExactly("Sol Ring", "Mind Stone");
	}

	@Test
	void onlyAllowedCardsAreUsedAndShortfallsAreReported() {
		Set<String> owned = Set.of("Sol Ring", "Mind Stone");
		Plan plan = DeckPlanner.plan(
				List.of(new Pool("Ramp", 3, List.of("Sol Ring", "Arcane Signet", "Mind Stone"))),
				List.of(), 3, owned::contains, NONE);

		assertThat(plan.picks()).extracting(Pick::name).containsExactly("Sol Ring", "Mind Stone");
		assertThat(plan.notes()).anyMatch(note -> note.contains("Ramp") && note.contains("2 of 3"));
		assertThat(plan.notes()).anyMatch(note -> note.contains("1 cards short"));
	}

	@Test
	void fillerTopsUpAShortDeckAndIsTaggedAsStaples() {
		Plan plan = DeckPlanner.plan(List.of(new Pool("Ramp", 1, List.of("Sol Ring"))), List.of("Swords to Plowshares", "Counterspell"),
				3, name -> true, NONE);

		assertThat(plan.picks()).containsExactly(new Pick("Sol Ring", "Ramp"), new Pick("Swords to Plowshares", "Staples"),
				new Pick("Counterspell", "Staples"));
	}

	@Test
	void neverReturnsMoreThanTheTarget() {
		Plan plan = DeckPlanner.plan(List.of(new Pool("A", 5, List.of("a", "b", "c", "d", "e"))), List.of(), 3, name -> true, NONE);

		assertThat(plan.picks()).hasSize(3);
	}

	@Test
	void themeBudgetIsSharedByWeightAndAddsUpExactly() {
		var themes = List.of(new Playstyle.Theme("A", "q", 4), new Playstyle.Theme("B", "q", 2), new Playstyle.Theme("C", "q", 1));

		var shares = DeckPlanner.allocate(themes, 31);

		assertThat(shares.values().stream().mapToInt(Integer::intValue).sum()).isEqualTo(31);
		assertThat(shares.get(themes.get(0))).isGreaterThan(shares.get(themes.get(1)));
		assertThat(shares.get(themes.get(1))).isGreaterThan(shares.get(themes.get(2)));
	}

	@Test
	void everyPlaystyleHasThemesWithPositiveWeightsAndUniqueIds() {
		assertThat(Playstyle.ALL).extracting(Playstyle::id).doesNotHaveDuplicates();
		for (Playstyle style : Playstyle.ALL) {
			assertThat(style.themes()).isNotEmpty();
			assertThat(style.themes()).allSatisfy(theme -> {
				assertThat(theme.weight()).isPositive();
				assertThat(theme.query()).isNotBlank();
			});
		}
	}
}
