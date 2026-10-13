package io.eregion.analysis;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

import io.eregion.analysis.AnalysisDtos.Consistency;

class ConsistencyCalculatorTest {

	/** A 99 card library: 37 lands, 10 cheap ramp, the rest filler. */
	private static List<AnalysisCard> typicalDeck(int lands, int ramp) {
		List<AnalysisCard> cards = new ArrayList<>();
		cards.add(Cards.commander("Atraxa", "{G}{W}{U}{B}", 4, "WUBG"));
		cards.add(Cards.land("Forest", "Basic Land - Forest", "({T}: Add {G}.)", lands));
		cards.add(Cards.spell("Signet", "{2}", 2, "Artifact", "Ramp", ramp));
		cards.add(Cards.spell("Filler", "{3}", 3, "Creature", null, 99 - lands - ramp));
		return cards;
	}

	@Test
	void matchesTheHypergeometricFigures() {
		Consistency result = ConsistencyCalculator.compute(typicalDeck(37, 10));
		assertThat(result.libraryCards()).isEqualTo(99);
		assertThat(result.lands()).isEqualTo(37);
		assertThat(result.cheapRamp()).isEqualTo(10);
		assertThat(result.expectedOpeningLands()).isCloseTo(7 * 37 / 99.0, within(0.001));
		assertThat(result.landDropTurn2()).isCloseTo(Hypergeometric.atLeast(99, 37, 8, 2), within(0.001));
		assertThat(result.landDropTurn4()).isCloseTo(Hypergeometric.atLeast(99, 37, 10, 4), within(0.001));
		assertThat(result.keepableOpener()).isBetween(0.8, 0.95);
	}

	@Test
	void moreLandsMeansBetterLandDrops() {
		Consistency thin = ConsistencyCalculator.compute(typicalDeck(30, 10));
		Consistency full = ConsistencyCalculator.compute(typicalDeck(40, 10));
		assertThat(full.landDropTurn3()).isGreaterThan(thin.landDropTurn3());
		assertThat(full.commanderOnCurve()).isGreaterThan(thin.commanderOnCurve());
	}

	@Test
	void commanderIsOptionalAndOnlyThenIsItAnswered() {
		List<AnalysisCard> noCommander = new ArrayList<>(typicalDeck(37, 10));
		noCommander.removeIf(AnalysisCard::isCommander);
		Consistency result = ConsistencyCalculator.compute(noCommander);
		assertThat(result.commanderOnCurve()).isNull();
		assertThat(result.colorAccessTurn3()).isEmpty();
	}

	@Test
	void colourAccessIsReportedPerIdentityColour() {
		Consistency result = ConsistencyCalculator.compute(typicalDeck(37, 10));
		assertThat(result.colorAccessTurn3()).containsOnlyKeys("W", "U", "B", "G");
		assertThat(result.colorAccessTurn3().get("G")).isGreaterThan(0.95);
		assertThat(result.colorAccessTurn3().get("W")).isZero();
	}

	@Test
	void aDeckBeingStartedGetsNoNumbers() {
		assertThat(ConsistencyCalculator.compute(List.of(Cards.spell("Lonely", "{1}", 1, "Creature", null, 5)))).isNull();
	}
}
