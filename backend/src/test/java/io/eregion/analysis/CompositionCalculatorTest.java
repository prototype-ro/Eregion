package io.eregion.analysis;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.Test;

import io.eregion.analysis.AnalysisDtos.Composition;

class CompositionCalculatorTest {

	@Test
	void countsPipsAndSplitsHybrids() {
		Composition result = CompositionCalculator.compute(List.of(
				Cards.spell("Counterspell", "{U}{U}", 2, "Instant", null, 2),
				Cards.spell("Boros Charm", "{R/W}{R/W}", 2, "Instant", null, 1),
				Cards.spell("Phyrexian", "{1}{W/P}", 2, "Instant", null, 1)));
		assertThat(result.pips().get("U")).isEqualTo(4.0);
		assertThat(result.pips().get("R")).isEqualTo(1.0);
		assertThat(result.pips().get("W")).isEqualTo(2.0);
		assertThat(result.pips().get("B")).isZero();
	}

	@Test
	void medianUsesQuantityAndSkipsLands() {
		Composition result = CompositionCalculator.compute(List.of(
				Cards.land("Forest", "Basic Land - Forest", "({T}: Add {G}.)", 30),
				Cards.spell("A", "{1}", 1, "Creature", null, 3),
				Cards.spell("B", "{3}", 3, "Creature", null, 1),
				Cards.spell("C", "{5}", 5, "Creature", null, 1)));
		assertThat(result.medianManaValue()).isEqualTo(1.0);
	}

	@Test
	void evenCountMedianAveragesTheMiddlePair() {
		assertThat(CompositionCalculator.median(List.of(1.0, 2.0, 3.0, 10.0))).isEqualTo(2.5);
		assertThat(CompositionCalculator.median(List.of())).isZero();
	}

	@Test
	void countsSourcesByColourAndHonoursTheIdentity() {
		AnalysisCard commander = Cards.commander("Atraxa", "{G}{W}{U}{B}", 4, "WUBG");
		Composition result = CompositionCalculator.compute(List.of(
				commander,
				Cards.land("Forest", "Basic Land - Forest", "({T}: Add {G}.)", 10),
				Cards.land("Command Tower", "Land", "{T}: Add one mana of any color in your commander's color identity.", 1),
				Cards.land("Mountain", "Basic Land - Mountain", "({T}: Add {R}.)", 5),
				Cards.land("Wastes", "Basic Land", "{T}: Add {C}.", 2)));
		assertThat(result.sources().get("G")).isEqualTo(11);
		assertThat(result.sources().get("R")).isZero();
		assertThat(result.sources().get("C")).isEqualTo(2);
	}

	@Test
	void readsNonLandProducersToo() {
		Composition result = CompositionCalculator.compute(List.of(
				new AnalysisCard("Sol Ring", "{1}", 1, "Artifact", "Artifact", "{T}: Add {C}{C}.", "", "Ramp", 1, "main", Set.of()),
				new AnalysisCard("Birds of Paradise", "{G}", 1, "Creature", "Creature", "{T}: Add one mana of any color.", "", "Ramp", 1, "main", Set.of())));
		assertThat(result.sources().get("C")).isEqualTo(1);
		assertThat(result.sources().get("W")).isEqualTo(1);
	}

	@Test
	void aDualLandIsOneProducerThoughItMakesTwoColours() {
		AnalysisCard commander = Cards.commander("Niv", "{W}{U}{B}{R}{G}", 5, "UR");
		Composition result = CompositionCalculator.compute(List.of(
				commander,
				Cards.land("Volcanic Island", "Land - Island Mountain", "({T}: Add {U} or {R}.)", 4),
				Cards.land("Mountain", "Basic Land - Mountain", "({T}: Add {R}.)", 6),
				Cards.land("Wastes", "Basic Land", "{T}: Add {C}.", 2)));
		assertThat(result.sources().get("U")).isEqualTo(4);
		assertThat(result.sources().get("R")).isEqualTo(10);
		assertThat(result.producers()).isEqualTo(10);
	}

	@Test
	void sideboardsDoNotCount() {
		AnalysisCard maybe = new AnalysisCard("Island", "", 0, "Land", "Basic Land - Island", "({T}: Add {U}.)", "", null, 5, "maybe", Set.of());
		assertThat(CompositionCalculator.compute(List.of(maybe)).sources().get("U")).isZero();
	}
}
