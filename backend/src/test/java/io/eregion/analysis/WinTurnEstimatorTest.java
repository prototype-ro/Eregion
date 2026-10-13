package io.eregion.analysis;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import io.eregion.analysis.AnalysisDtos.Bracket;
import io.eregion.analysis.AnalysisDtos.Speed;
import io.eregion.analysis.AnalysisDtos.WinTurn;

class WinTurnEstimatorTest {

	private static Bracket bracket(double score, int estimated) {
		return new Bracket(1, estimated, estimated, BracketClassifier.NAMES[estimated], "speed", score, Map.of(),
				BracketClassifier.signals(List.of(), List.of()), List.of(), List.of(), null);
	}

	private static Speed comboAt(Double turn) {
		return new Speed(800, List.of(), null, Map.of(), turn, turn, turn == null ? Map.of() : Map.of("6", 0.5), List.of());
	}

	@Test
	void theScoreMapsOntoTheTurnRangesOfTheBrackets() {
		assertThat(WinTurnEstimator.fromScore(0)).isEqualTo(10);
		assertThat(WinTurnEstimator.fromScore(3)).isEqualTo(8);
		assertThat(WinTurnEstimator.fromScore(7)).isEqualTo(6);
		assertThat(WinTurnEstimator.fromScore(14)).isEqualTo(4);
		assertThat(WinTurnEstimator.fromScore(5)).isCloseTo(7.0, within(1e-9));
		assertThat(WinTurnEstimator.fromScore(99)).isEqualTo(2.5);
	}

	@Test
	void aFasterScoreNeverGivesALaterTurn() {
		double previous = Double.MAX_VALUE;
		for (double score = 0; score <= 30; score += 0.5) {
			double turn = WinTurnEstimator.fromScore(score);
			assertThat(turn).isLessThanOrEqualTo(previous);
			previous = turn;
		}
	}

	@Test
	void theTurnLandsInTheBracketTheScoreSays() {
		assertThat(WinTurnEstimator.estimate(bracket(1.5, 2), null).bracket()).isEqualTo(2);
		assertThat(WinTurnEstimator.estimate(bracket(5.0, 3), null).bracket()).isEqualTo(3);
		assertThat(WinTurnEstimator.estimate(bracket(10.0, 4), null).bracket()).isEqualTo(4);
		assertThat(WinTurnEstimator.estimate(bracket(20.0, 5), null).bracket()).isEqualTo(5);
	}

	@Test
	void aQuickComboPullsTheTurnForwardAndSaysSo() {
		WinTurn turn = WinTurnEstimator.estimate(bracket(5.0, 3), comboAt(5.0));
		assertThat(turn.turn()).isEqualTo(5.0);
		assertThat(turn.basis()).isEqualTo("combo");
		assertThat(WinTurnEstimator.estimate(bracket(5.0, 3), comboAt(9.0)).basis()).isEqualTo("signals");
		assertThat(WinTurnEstimator.estimate(bracket(5.0, 3), comboAt(null)).basis()).isEqualTo("signals");
	}

	@Test
	void withoutTheWholeKitTheTurnStaysInsideBracketFour() {
		assertThat(WinTurnEstimator.estimate(bracket(20.0, 4), null).turn()).isEqualTo(4.0);
		assertThat(WinTurnEstimator.estimate(bracket(20.0, 5), null).turn()).isLessThan(4.0);
	}

	@Test
	void theTurnIsRoundedToOnePlace() {
		assertThat(WinTurnEstimator.estimate(bracket(4.37, 3), null).turn()).isEqualTo(Math.round(WinTurnEstimator.fromScore(4.37) * 10) / 10.0);
	}

	private static Speed commanderAt(Double commanderTurn, double comboByEight) {
		return new Speed(800, List.of(), commanderTurn, Map.of(), null, null, comboByEight > 0 ? Map.of("8", comboByEight) : Map.of(), List.of());
	}

	@Test
	void aDeckCannotCloseBeforeItsExpensiveCommanderIsOut() {
		// Fast signals say turn 4.5, but the commander is only cast on turn 7.
		WinTurn turn = WinTurnEstimator.estimate(bracket(12.0, 4), commanderAt(7.0, 0.0));
		assertThat(turn.turn()).isEqualTo(7.0 + WinTurnEstimator.COMMANDER_LAG);
		assertThat(turn.basis()).isEqualTo("commander");
	}

	@Test
	void aCheapCommanderChangesNothing() {
		WinTurn without = WinTurnEstimator.estimate(bracket(5.0, 3), null);
		WinTurn cheap = WinTurnEstimator.estimate(bracket(5.0, 3), commanderAt(3.0, 0.0));
		assertThat(cheap.turn()).isEqualTo(without.turn());
		assertThat(cheap.basis()).isEqualTo("signals");
	}

	@Test
	void aDeckWithAFastComboDoesNotDependOnItsCommander() {
		WinTurn turn = WinTurnEstimator.estimate(bracket(12.0, 4), commanderAt(9.0, 0.6));
		assertThat(turn.turn()).isLessThan(9.0);
		assertThat(turn.basis()).isNotEqualTo("commander");
	}

	@Test
	void aCommanderThatNeverComesOutIsLeftOutOfIt() {
		assertThat(WinTurnEstimator.estimate(bracket(5.0, 3), commanderAt(null, 0.0)).basis()).isEqualTo("signals");
	}
}
