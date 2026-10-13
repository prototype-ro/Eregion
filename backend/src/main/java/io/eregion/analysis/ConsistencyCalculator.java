package io.eregion.analysis;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import io.eregion.analysis.AnalysisDtos.Consistency;

/**
 * How reliably the deck does what it should in its first turns, as probabilities from drawing cards without replacement.
 *
 * <p>Conventions, all stated so the numbers can be checked: the library is the main board (the commander waits in the command zone),
 * the player is on the play so turn {@code t} has seen {@code 7 + t - 1} cards, and "cheap ramp" is a non-land card with the Ramp
 * role and mana value 2 or less. The commander's chance counts lands plus cheap ramp as mana sources by the turn equal to its mana value.
 */
public final class ConsistencyCalculator {

	static final int OPENING_HAND = 7;
	static final int CHEAP_RAMP_MAX_VALUE = 2;
	/** An opening hand with 2 to 5 lands can be kept. */
	static final int KEEP_MIN_LANDS = 2;
	static final int KEEP_MAX_LANDS = 5;
	/** Fewer cards than this is a list being started, not a deck, so there is nothing sensible to say yet. */
	static final int MIN_LIBRARY = 20;

	private ConsistencyCalculator() {
	}

	private static int seen(int turn) {
		return OPENING_HAND + turn - 1;
	}

	/** Null while the main board is too small to be a deck. */
	public static Consistency compute(List<AnalysisCard> cards) {
		String identity = CompositionCalculator.identityOf(cards);
		int library = 0;
		int lands = 0;
		int cheapRamp = 0;
		Map<String, Integer> colorSources = new LinkedHashMap<>();
		for (String color : identity.split("")) {
			if (!color.isEmpty()) {
				colorSources.put(color, 0);
			}
		}
		double commanderValue = -1;

		for (AnalysisCard card : cards) {
			if (card.isCommander()) {
				commanderValue = Math.max(commanderValue, card.manaValue());
				continue;
			}
			if (!"main".equals(card.board())) {
				continue;
			}
			library += card.quantity();
			if (card.isLand()) {
				lands += card.quantity();
			}
			else if (card.hasRole("Ramp") && card.manaValue() <= CHEAP_RAMP_MAX_VALUE) {
				cheapRamp += card.quantity();
			}
			for (String color : ManaSources.colorsOf(card, identity)) {
				colorSources.computeIfPresent(color, (key, count) -> count + card.quantity());
			}
		}
		if (library < MIN_LIBRARY) {
			return null;
		}

		Map<String, Double> colorAccess = new LinkedHashMap<>();
		for (Map.Entry<String, Integer> entry : colorSources.entrySet()) {
			colorAccess.put(entry.getKey(), round(Hypergeometric.atLeast(library, entry.getValue(), seen(3), 1)));
		}
		Double commanderOnCurve = null;
		if (commanderValue >= 0) {
			int turn = (int) Math.max(1, Math.ceil(commanderValue));
			commanderOnCurve = round(Hypergeometric.atLeast(library, lands + cheapRamp, seen(turn), turn));
		}
		return new Consistency(
				library,
				lands,
				cheapRamp,
				round(OPENING_HAND * (double) lands / library),
				round(Hypergeometric.atLeast(library, lands, seen(2), 2)),
				round(Hypergeometric.atLeast(library, lands, seen(3), 3)),
				round(Hypergeometric.atLeast(library, lands, seen(4), 4)),
				round(Hypergeometric.atLeast(library, cheapRamp, seen(2), 1)),
				round(Hypergeometric.atLeast(library, cheapRamp, seen(3), 1)),
				round(Hypergeometric.atLeast(library, cheapRamp, seen(3), 2)),
				round(Hypergeometric.between(library, lands, OPENING_HAND, KEEP_MIN_LANDS, KEEP_MAX_LANDS)),
				commanderOnCurve,
				colorAccess);
	}

	private static double round(double value) {
		return Math.round(value * 1000.0) / 1000.0;
	}
}
