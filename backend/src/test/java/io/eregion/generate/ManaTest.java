package io.eregion.generate;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

class ManaTest {

	@Test
	void countsColoredSymbolsAndIgnoresGenericOnes() {
		assertThat(Mana.pips("{2}{W}{U}{U}")).containsEntry('W', 1).containsEntry('U', 2).hasSize(2);
		assertThat(Mana.pips("{4}")).isEmpty();
		assertThat(Mana.pips("{X}{R}{R}")).containsEntry('R', 2);
		assertThat(Mana.pips(null)).isEmpty();
		assertThat(Mana.pips("")).isEmpty();
	}

	@Test
	void hybridCountsForBothColorsAndPhyrexianForItsColor() {
		assertThat(Mana.pips("{W/U}{W/U}")).containsEntry('W', 2).containsEntry('U', 2);
		assertThat(Mana.pips("{G/P}")).containsEntry('G', 1);
		assertThat(Mana.pips("{2/W}")).containsEntry('W', 1);
	}

	@Test
	void splitsBasicsInProportionToColorSymbols() {
		var split = Mana.splitBasics(20, "WU", List.of(Map.of('W', 3), Map.of('U', 1)));

		assertThat(split.values().stream().mapToInt(Integer::intValue).sum()).isEqualTo(20);
		assertThat(split.get('W')).isGreaterThan(split.get('U'));
		assertThat(split.get('U')).isGreaterThanOrEqualTo(1);
	}

	@Test
	void everyColorGetsAtLeastOneLandEvenIfNoSpellNeedsIt() {
		var split = Mana.splitBasics(10, "WUB", List.of(Map.of('W', 5)));

		assertThat(split.get('U')).isGreaterThanOrEqualTo(1);
		assertThat(split.get('B')).isGreaterThanOrEqualTo(1);
		assertThat(split.values().stream().mapToInt(Integer::intValue).sum()).isEqualTo(10);
	}

	@Test
	void withNoSymbolsAtAllTheSplitIsEven() {
		var split = Mana.splitBasics(9, "WUB", List.of());

		assertThat(split.values()).containsOnly(3);
	}

	@Test
	void aSingleColorGetsEveryLand() {
		assertThat(Mana.splitBasics(14, "G", List.of(Map.of('G', 8)))).containsEntry('G', 14);
	}

	@Test
	void colorlessCommandersGetNoColoredBasics() {
		assertThat(Mana.splitBasics(12, "", List.of())).isEmpty();
	}

	@Test
	void fewerLandsThanColorsStillAddsUp() {
		var split = Mana.splitBasics(2, "WUBRG", List.of());

		assertThat(split.values().stream().mapToInt(Integer::intValue).sum()).isEqualTo(2);
	}
}
