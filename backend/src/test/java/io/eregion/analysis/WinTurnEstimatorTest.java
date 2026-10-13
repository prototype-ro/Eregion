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
	void theBracketShownIsTheOneWhoseRangeHoldsTheTurnShown() {
		for (double score : new double[] { 0.5, 1.5, 3.5, 5.0, 8.0, 10.0, 14.0, 20.0 }) {
			WinTurn turn = WinTurnEstimator.estimate(bracket(score, 3), null);
			assertThat(turn.bracket()).isEqualTo(WinTurnEstimator.bracketOf(turn.turn()));
		}
		assertThat(WinTurnEstimator.estimate(bracket(20.0, 5), null).bracket()).isEqualTo(5);
	}

	@Test
	void theTurnIsPulledTowardTheMiddleButKeepsItsOrder() {
		assertThat(WinTurnEstimator.calibrate(6.5)).isEqualTo(6.5);
		assertThat(WinTurnEstimator.calibrate(9.8)).isCloseTo(8.48, org.assertj.core.data.Offset.offset(0.001));
		assertThat(WinTurnEstimator.calibrate(5.0)).isCloseTo(5.6, org.assertj.core.data.Offset.offset(0.001));
		// Below the fitted range the turn keeps its own scale, joined to the compressed one at 5.0.
		assertThat(WinTurnEstimator.calibrate(3.0)).isCloseTo(3.6, org.assertj.core.data.Offset.offset(0.001));
		double previous = Double.MAX_VALUE;
		for (double turn = 12; turn >= 2; turn -= 0.25) {
			double calibrated = WinTurnEstimator.calibrate(turn);
			assertThat(calibrated).isLessThan(previous);
			previous = calibrated;
		}
	}

	@Test
	void aQuickComboPullsTheTurnForwardAndSaysSo() {
		WinTurn turn = WinTurnEstimator.estimate(bracket(5.0, 3), comboAt(5.0));
		assertThat(turn.turn()).isEqualTo(Math.round(WinTurnEstimator.calibrate(5.0) * 10) / 10.0);
		assertThat(turn.basis()).isEqualTo("combo");
		assertThat(WinTurnEstimator.estimate(bracket(5.0, 3), comboAt(9.0)).basis()).isEqualTo("signals");
		assertThat(WinTurnEstimator.estimate(bracket(5.0, 3), comboAt(null)).basis()).isEqualTo("signals");
	}

	@Test
	void withoutTheWholeKitTheTurnStaysInsideBracketFour() {
		assertThat(WinTurnEstimator.estimate(bracket(20.0, 4), null).turn()).isEqualTo(Math.round(WinTurnEstimator.calibrate(4.0) * 10) / 10.0);
		assertThat(WinTurnEstimator.estimate(bracket(20.0, 5), null).turn()).isLessThan(4.0);
	}

	@Test
	void theTurnIsRoundedToOnePlace() {
		assertThat(WinTurnEstimator.estimate(bracket(4.37, 3), null).turn()).isEqualTo(Math.round(WinTurnEstimator.calibrate(WinTurnEstimator.fromScore(4.37)) * 10) / 10.0);
	}

	private static Speed commanderAt(Double commanderTurn, double comboByEight) {
		return new Speed(800, List.of(), commanderTurn, Map.of(), null, null, comboByEight > 0 ? Map.of("8", comboByEight) : Map.of(), List.of());
	}

	private static Bracket withReanimation(int spells) {
		List<AnalysisCard> cards = new java.util.ArrayList<>();
		for (int i = 0; i < spells; i++) {
			cards.add(new AnalysisCard("Reanimate " + i, "{1}{B}", 2, "Sorcery", "Sorcery", "Put target creature card from a graveyard onto the battlefield under your control.",
					"", null, 1, "main", java.util.Set.of()));
		}
		return new Bracket(1, 3, 3, "Upgraded", "speed", 5.0, Map.of(), BracketClassifier.signals(cards, List.of()), List.of(), List.of(), null);
	}

	@Test
	void aDeckCannotCloseBeforeItsExpensiveCommanderIsOut() {
		// Fast signals say turn 4.5, but the commander is only cast on turn 7.
		WinTurn turn = WinTurnEstimator.estimate(bracket(12.0, 4), commanderAt(7.0, 0.0));
		assertThat(turn.turn()).isEqualTo(Math.round(WinTurnEstimator.calibrate(7.0 + WinTurnEstimator.COMMANDER_LAG) * 10) / 10.0);
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

	@Test
	void aReanimatorPlanNeverNeedsItsCommander() {
		Speed slowCommander = commanderAt(8.0, 0.0);
		WinTurn reanimator = WinTurnEstimator.estimate(withReanimation(WinTurnEstimator.REANIMATOR_PLAN), slowCommander);
		assertThat(reanimator.basis()).isEqualTo("signals");
		assertThat(reanimator.turn()).isLessThan(8.0);
		// One short of a plan, and the commander still limits the deck.
		WinTurn almost = WinTurnEstimator.estimate(withReanimation(WinTurnEstimator.REANIMATOR_PLAN - 1), slowCommander);
		assertThat(almost.basis()).isEqualTo("commander");
		assertThat(almost.turn()).isEqualTo(Math.round(WinTurnEstimator.calibrate(8.0 + WinTurnEstimator.COMMANDER_LAG) * 10) / 10.0);
	}
}
