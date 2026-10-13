package io.eregion.analysis;

import java.util.ArrayList;
import java.util.List;

import io.eregion.analysis.AnalysisDtos.Consistency;
import io.eregion.analysis.AnalysisDtos.DeckHealth;
import io.eregion.analysis.AnalysisDtos.Engine;
import io.eregion.analysis.AnalysisDtos.HealthPillar;
import io.eregion.analysis.AnalysisDtos.HealthSpoke;

/**
 * Scores how well the deck is put together against the ranges Commander players usually aim for: lands and ramp, removal and wipes, card
 * flow and a clear plan. A measure inside its range scores 100 and falls off in a straight line outside it, to 0 at half the range's own
 * edge away. The ranges are common rules of thumb, not measured from decks of the same commander, and the counts are of each card's main
 * role, so a deck whose cards are not yet tagged shows low counts. The pillars are weighted equally.
 */
public final class DeckHealthCalculator {

	static final int MIN_LIBRARY = ConsistencyCalculator.MIN_LIBRARY;

	private DeckHealthCalculator() {
	}

	/** Null while the deck is too small to judge. */
	public static DeckHealth calculate(List<AnalysisCard> deck, Consistency consistency, Engine engine) {
		if (consistency == null) {
			return null;
		}
		List<HealthSpoke> mana = new ArrayList<>();
		mana.add(spoke("lands", "Lands", consistency.lands(), 33, 38, "Lands in the 99", List.of()));
		mana.add(roleSpoke(deck, "ramp", "Ramp", "Ramp", 8, 12, "Mana rocks, mana creatures and land fetching"));
		mana.add(spoke("keepable", "Keepable hands", Math.round(consistency.keepableOpener() * 100), 80, 100, "Percent of openers with 2 to 5 lands", List.of()));
		double weakest = consistency.colorAccessTurn3().values().stream().mapToDouble(Double::doubleValue).min().orElse(1.0);
		mana.add(spoke("colors", "Colour access", Math.round(weakest * 100), 90, 100, "Chance of your scarcest colour by turn 3", List.of()));

		List<HealthSpoke> interaction = new ArrayList<>();
		interaction.add(roleSpoke(deck, "removal", "Removal", "Removal", 6, 12, "Cards that answer a single threat"));
		interaction.add(roleSpoke(deck, "wipes", "Board wipes", "Board Wipe", 2, 5, "Cards that reset the board"));
		interaction.add(roleSpoke(deck, "protection", "Protection", "Protection", 2, 6, "Cards that protect your own permanents"));

		List<HealthSpoke> flow = new ArrayList<>();
		flow.add(roleSpoke(deck, "draw", "Card draw", "Card Draw", 8, 12, "Cards that refill your hand"));
		flow.add(roleSpoke(deck, "recursion", "Recursion", "Recursion", 2, 6, "Cards that bring things back"));
		double focus = engine == null || engine.themes().isEmpty() ? 0 : engine.themes().get(0).score();
		flow.add(spoke("focus", "Plan focus", focus, 12, 60, "Percent of spells leaning on the main plan",
				engine == null ? List.of() : engine.signatureCards()));

		List<HealthPillar> pillars = List.of(pillar("mana", "Mana", mana), pillar("interaction", "Interaction", interaction), pillar("engine", "Engine", flow));
		int score = (int) Math.round(pillars.stream().mapToInt(HealthPillar::score).average().orElse(0));
		return new DeckHealth(score, pillars,
				"Ranges are common Commander rules of thumb, not measured from decks of the same commander. Counts use each card's main role.");
	}

	private static HealthSpoke roleSpoke(List<AnalysisCard> deck, String key, String label, String role, double min, double max, String hint) {
		List<String> names = new ArrayList<>();
		int count = 0;
		for (AnalysisCard card : deck) {
			if (card.counted() && !card.isLand() && card.hasRole(role)) {
				count += card.quantity();
				names.add(card.name());
			}
		}
		return spoke(key, label, count, min, max, hint, names);
	}

	static HealthSpoke spoke(String key, String label, double observed, double min, double max, String hint, List<String> cards) {
		return new HealthSpoke(key, label, observed, min, max, score(observed, min, max), hint, cards.stream().limit(8).toList());
	}

	/** 100 inside the range, then falling in a straight line to 0 at half the range's near edge away from it (at least 2 units). */
	static int score(double observed, double min, double max) {
		if (observed >= min && observed <= max) {
			return 100;
		}
		if (observed < min) {
			double reach = Math.max(2, min * 0.5);
			return (int) Math.round(100 * Math.max(0, 1 - (min - observed) / reach));
		}
		double reach = Math.max(2, max * 0.5);
		return (int) Math.round(100 * Math.max(0, 1 - (observed - max) / reach));
	}

	private static HealthPillar pillar(String key, String label, List<HealthSpoke> spokes) {
		int score = (int) Math.round(spokes.stream().mapToInt(HealthSpoke::score).average().orElse(0));
		return new HealthPillar(key, label, score, spokes);
	}
}
