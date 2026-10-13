package io.eregion.analysis;

import java.util.Set;

/** Test helper: builds the cards of a deck. */
final class Cards {

	private Cards() {
	}

	static AnalysisCard land(String name, String typeLine, String text, int quantity) {
		return new AnalysisCard(name, "", 0, "Land", typeLine, text, "", null, quantity, "main", Set.of());
	}

	static AnalysisCard spell(String name, String cost, double value, String type, String role, int quantity) {
		return new AnalysisCard(name, cost, value, type, type, "", "", role, quantity, "main", Set.of());
	}

	static AnalysisCard spell(String name, String cost, double value, String type, String text, String role, int quantity, String... flags) {
		return new AnalysisCard(name, cost, value, type, type, text, "", role, quantity, "main", Set.of(flags));
	}

	static AnalysisCard commander(String name, String cost, double value, String identity) {
		return new AnalysisCard(name, cost, value, "Creature", "Legendary Creature", "", identity, null, 1, "commander", Set.of());
	}
}
