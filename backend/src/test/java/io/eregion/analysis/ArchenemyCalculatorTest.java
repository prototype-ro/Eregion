package io.eregion.analysis;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.Test;

import io.eregion.analysis.AnalysisDtos.Archenemy;
import io.eregion.analysis.AnalysisDtos.ComboInfo;

class ArchenemyCalculatorTest {

	private static AnalysisCard text(String name, String oracle, String role, String... flags) {
		return new AnalysisCard(name, "{2}", 2, "Sorcery", "Sorcery", oracle, "", role, 1, "main", Set.of(flags));
	}

	private static Archenemy rate(List<AnalysisCard> deck, List<ComboInfo> combos) {
		return ArchenemyCalculator.calculate(deck, BracketClassifier.signals(deck, combos));
	}

	private static List<AnalysisCard> many(int count, String prefix, String oracle, String role) {
		List<AnalysisCard> cards = new ArrayList<>();
		for (int i = 0; i < count; i++) {
			cards.add(text(prefix + i, oracle, role));
		}
		return cards;
	}

	@Test
	void aFriendlyDeckIsChill() {
		Archenemy result = rate(many(30, "Bear", "Draw a card.", null), List.of());
		assertThat(result.score()).isZero();
		assertThat(result.level()).isZero();
		assertThat(result.name()).isEqualTo("Chill");
		assertThat(result.patterns()).isEmpty();
		assertThat(result.levels()).hasSize(10);
	}

	@Test
	void millCardsMakeItAContender() {
		Archenemy result = rate(many(4, "Mill", "Target player mills ten cards.", null), List.of());
		assertThat(result.patterns()).extracting(p -> p.key()).contains("mill");
		assertThat(result.score()).isEqualTo(2.8);
		assertThat(result.name()).isEqualTo("Contender");
	}

	@Test
	void eachPatternIsCappedSoOneThingCannotMaxOutTheScale() {
		Archenemy result = rate(many(20, "Mill", "Each opponent mills five cards.", null), List.of());
		assertThat(result.score()).isEqualTo(3.0);
	}

	@Test
	void massLandDenialIsHeavy() {
		List<AnalysisCard> deck = List.of(text("Armageddon", "Destroy all lands.", null, BracketFlags.MASS_LAND_DENIAL));
		Archenemy result = rate(deck, List.of());
		assertThat(result.patterns()).extracting(p -> p.key()).contains("land_denial");
		assertThat(result.score()).isGreaterThanOrEqualTo(2.0);
	}

	@Test
	void anEarlyTwoCardComboCountsMoreThanALateOne() {
		ComboInfo early = new ComboInfo("1", List.of("A", "B"), List.of(), List.of("Win the game"), "", "", 3, "S", 1);
		ComboInfo late = new ComboInfo("2", List.of("A", "B", "C"), List.of(), List.of("Win the game"), "", "", 9, "S", 1);
		double fast = rate(List.of(), List.of(early)).score();
		double slow = rate(List.of(), List.of(late)).score();
		assertThat(fast).isGreaterThan(slow);
		assertThat(slow).isGreaterThan(0);
	}

	@Test
	void aFewWipesAreNormalButManyAreNot() {
		assertThat(rate(many(2, "Wipe", "Destroy all creatures.", "Board Wipe"), List.of()).patterns()).isEmpty();
		assertThat(rate(many(5, "Wipe", "Destroy all creatures.", "Board Wipe"), List.of()).patterns()).extracting(p -> p.key()).contains("wipes");
	}

	@Test
	void theLevelNeverRunsPastTheTopOfTheScale() {
		List<AnalysisCard> deck = new ArrayList<>();
		deck.addAll(many(10, "Mill", "Each opponent mills five cards.", null));
		deck.addAll(many(10, "Theft", "Gain control of target creature.", null));
		deck.addAll(many(10, "Stax", "Players can't cast spells.", "Stax"));
		deck.addAll(many(10, "Turn", "Take an extra turn after this one.", null));
		for (int i = 0; i < 10; i++) {
			deck.add(text("Turn" + i, "", null, BracketFlags.EXTRA_TURN));
			deck.add(text("Mox" + i, "", null, BracketFlags.FAST_MANA));
			deck.add(text("Wrath" + i, "Destroy all creatures.", "Board Wipe"));
			deck.add(text("Armageddon" + i, "", null, BracketFlags.MASS_LAND_DENIAL));
		}
		Archenemy result = rate(deck, List.of());
		assertThat(result.score()).isEqualTo(10.0);
		assertThat(result.level()).isEqualTo(9);
		assertThat(result.name()).isEqualTo("Archenemy");
		assertThat(result.patterns()).hasSize(4);
	}

	@Test
	void patternsComeBiggestFirst() {
		List<AnalysisCard> deck = new ArrayList<>();
		deck.addAll(many(1, "Mill", "Target player mills ten cards.", null));
		deck.addAll(many(3, "Theft", "Gain control of target creature.", null));
		List<Double> points = rate(deck, List.of()).patterns().stream().map(p -> p.points()).toList();
		assertThat(points).isSortedAccordingTo(java.util.Comparator.reverseOrder());
	}
}
