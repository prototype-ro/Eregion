package io.eregion.analysis;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.Test;

import io.eregion.analysis.AnalysisDtos.Consistency;
import io.eregion.analysis.AnalysisDtos.DeckHealth;
import io.eregion.analysis.AnalysisDtos.HealthPillar;
import io.eregion.analysis.AnalysisDtos.HealthSpoke;

class DeckHealthCalculatorTest {

	private static AnalysisCard role(String name, String role, int quantity) {
		return new AnalysisCard(name, "{2}", 2, "Sorcery", "Sorcery", "", "", role, quantity, "main", Set.of());
	}

	private static List<AnalysisCard> balanced() {
		List<AnalysisCard> deck = new ArrayList<>();
		deck.add(Cards.commander("Atraxa", "{G}{W}{U}{B}", 4, "WUBG"));
		deck.add(Cards.land("Forest", "Basic Land - Forest", "({T}: Add {G}.)", 36));
		deck.add(role("Rampant Growth", "Ramp", 10));
		deck.add(role("Swords", "Removal", 8));
		deck.add(role("Wrath", "Board Wipe", 3));
		deck.add(role("Heroic", "Protection", 3));
		deck.add(role("Divination", "Card Draw", 10));
		deck.add(role("Regrowth", "Recursion", 3));
		deck.add(role("Filler", null, 99 - 36 - 10 - 8 - 3 - 3 - 10 - 3));
		return deck;
	}

	private static HealthSpoke spoke(DeckHealth health, String key) {
		return health.pillars().stream().flatMap(p -> p.spokes().stream()).filter(s -> s.key().equals(key)).findFirst().orElseThrow();
	}

	@Test
	void insideTheRangeScoresFullAndFallsOffAsAStraightLine() {
		assertThat(DeckHealthCalculator.score(8, 8, 12)).isEqualTo(100);
		assertThat(DeckHealthCalculator.score(12, 8, 12)).isEqualTo(100);
		// Below 8 the reach is 4 (half of 8): 6 is half way down.
		assertThat(DeckHealthCalculator.score(6, 8, 12)).isEqualTo(50);
		assertThat(DeckHealthCalculator.score(4, 8, 12)).isZero();
		assertThat(DeckHealthCalculator.score(0, 8, 12)).isZero();
		// Above 12 the reach is 6: 15 is half way down.
		assertThat(DeckHealthCalculator.score(15, 8, 12)).isEqualTo(50);
	}

	@Test
	void aWellBuiltDeckScoresHighEverywhere() {
		List<AnalysisCard> deck = balanced();
		DeckHealth health = DeckHealthCalculator.calculate(deck, ConsistencyCalculator.compute(deck), null);
		assertThat(health.pillars()).extracting(HealthPillar::key).containsExactly("mana", "interaction", "engine");
		assertThat(spoke(health, "ramp").score()).isEqualTo(100);
		assertThat(spoke(health, "removal").score()).isEqualTo(100);
		assertThat(spoke(health, "draw").score()).isEqualTo(100);
		assertThat(health.pillars().get(1).score()).isEqualTo(100);
	}

	@Test
	void aDeckWithNoInteractionOrCardFlowScoresLow() {
		List<AnalysisCard> deck = new ArrayList<>();
		deck.add(Cards.land("Forest", "Basic Land - Forest", "({T}: Add {G}.)", 36));
		deck.add(role("Filler", null, 63));
		DeckHealth health = DeckHealthCalculator.calculate(deck, ConsistencyCalculator.compute(deck), null);
		assertThat(spoke(health, "removal").score()).isZero();
		assertThat(spoke(health, "draw").score()).isZero();
		assertThat(health.pillars().get(1).score()).isZero();
		assertThat(health.score()).isLessThan(60);
	}

	@Test
	void spokesNameTheirCardsAndStateTheirRange() {
		List<AnalysisCard> deck = balanced();
		HealthSpoke removal = spoke(DeckHealthCalculator.calculate(deck, ConsistencyCalculator.compute(deck), null), "removal");
		assertThat(removal.cards()).containsExactly("Swords");
		assertThat(removal.observed()).isEqualTo(8);
		assertThat(removal.min()).isEqualTo(6);
		assertThat(removal.max()).isEqualTo(12);
	}

	@Test
	void aDeckBeingStartedHasNoHealthYet() {
		assertThat(DeckHealthCalculator.calculate(List.of(role("A", "Ramp", 3)), (Consistency) null, null)).isNull();
	}

	@Test
	void theOverallScoreIsTheAverageOfThePillars() {
		List<AnalysisCard> deck = balanced();
		DeckHealth health = DeckHealthCalculator.calculate(deck, ConsistencyCalculator.compute(deck), null);
		assertThat(health.score()).isEqualTo((int) Math.round(health.pillars().stream().mapToInt(HealthPillar::score).average().orElse(0)));
	}
}
