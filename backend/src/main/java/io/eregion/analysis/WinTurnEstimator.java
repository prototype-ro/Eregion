package io.eregion.analysis;

import io.eregion.analysis.AnalysisDtos.Bracket;
import io.eregion.analysis.AnalysisDtos.Speed;
import io.eregion.analysis.AnalysisDtos.WinTurn;

/**
 * Turns the bracket's speed score into a turn number, so the bracket scale (10+ turns down to cEDH, under 4) can show where in its range
 * a deck sits. This is an estimate read from signals and simulated setup, not a prediction from a model trained on played games, which
 * needs decks labelled with the turn they won on. The points below fix the score to the turn ranges of the brackets themselves, and
 * between them the turn falls in a straight line.
 */
public final class WinTurnEstimator {

	/** (score, turn) pairs, matching the cut-offs in {@link BracketClassifier}: 3 is where bracket 3 starts, 7 bracket 4, 14 bracket 5. */
	private static final double[][] POINTS = { { 0, 10 }, { 3, 8 }, { 7, 6 }, { 14, 4 }, { 24, 2.5 } };
	/** A deck without a fast combo wins through its commander, which then needs a little under half a turn to matter. */
	static final double COMMANDER_LAG = 0.4;
	/** At this share of games with a game-ending combo ready by turn 8, the deck no longer depends on its commander. */
	static final double COMBO_INDEPENDENCE = 0.5;
	static final double SLOWEST = 12;
	static final double FASTEST = 2.5;

	private WinTurnEstimator() {
	}

	public static WinTurn estimate(Bracket bracket, Speed speed) {
		double turn = fromScore(bracket.score());
		String basis = "signals";
		// The average turn the combo can run, not the middle one: a combo deck that sometimes stumbles wins later on average than on a
		// typical good game, and the expected turn is what a pod will see.
		if (speed != null && speed.comboMean() != null && speed.comboMean() < turn) {
			turn = speed.comboMean();
			basis = "combo";
		}
		// Without a fast combo a deck cannot win before its commander is out, however fast its mana: a six mana commander that is cast on turn
		// six keeps the deck from closing earlier, whatever the score says.
		if (speed != null && speed.commanderTurn() != null && speed.comboByTurn().getOrDefault("8", 0.0) < COMBO_INDEPENDENCE) {
			double earliest = speed.commanderTurn() + COMMANDER_LAG;
			if (earliest > turn) {
				turn = earliest;
				basis = "commander";
			}
		}
		// Bracket 5 needs the whole kit. Without it the turn does not run past the end of bracket 4, so the two readings agree.
		if (bracket.estimated() < 5) {
			turn = Math.max(turn, 4.0);
		}
		turn = Math.max(FASTEST, Math.min(SLOWEST, turn));
		double rounded = Math.round(turn * 10.0) / 10.0;
		return new WinTurn(rounded, basis, bracketOf(rounded));
	}

	static double fromScore(double score) {
		if (score <= POINTS[0][0]) {
			return POINTS[0][1];
		}
		for (int i = 1; i < POINTS.length; i++) {
			if (score <= POINTS[i][0]) {
				double share = (score - POINTS[i - 1][0]) / (POINTS[i][0] - POINTS[i - 1][0]);
				return POINTS[i - 1][1] + share * (POINTS[i][1] - POINTS[i - 1][1]);
			}
		}
		return POINTS[POINTS.length - 1][1];
	}

	/** The bracket whose turn range holds this turn: 10 or more is 1, then 8, 6 and 4 are the edges of 2, 3 and 4. */
	static int bracketOf(double turn) {
		if (turn >= 10) {
			return 1;
		}
		if (turn >= 8) {
			return 2;
		}
		if (turn >= 6) {
			return 3;
		}
		if (turn >= 4) {
			return 4;
		}
		return 5;
	}
}
