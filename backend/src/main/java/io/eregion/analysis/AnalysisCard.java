package io.eregion.analysis;

import java.util.Set;

import io.eregion.deck.Board;

/**
 * One card of the deck being analysed, with everything the calculators read. Built from the catalog by {@link AnalysisService};
 * the calculators themselves never touch the database, so they can be tested with plain values.
 */
public record AnalysisCard(
		String name,
		String manaCost,
		double manaValue,
		String primaryType,
		String typeLine,
		String oracleText,
		String colorIdentity,
		/** The card's main role (Ramp, Tutor, ...), or null when nothing is known. */
		String role,
		int quantity,
		String board,
		/** Bracket flags the card carries, see {@link BracketFlags}. */
		Set<String> flags) {

	public AnalysisCard {
		manaCost = manaCost == null ? "" : manaCost;
		typeLine = typeLine == null ? "" : typeLine;
		oracleText = oracleText == null ? "" : oracleText;
		colorIdentity = colorIdentity == null ? "" : colorIdentity;
		flags = flags == null ? Set.of() : Set.copyOf(flags);
	}

	/** Only commander and main count toward the deck. */
	public boolean counted() {
		return Board.isCounted(board);
	}

	public boolean isLand() {
		return "Land".equals(primaryType);
	}

	public boolean isCommander() {
		return "commander".equals(board);
	}

	public boolean has(String flag) {
		return flags.contains(flag);
	}

	public boolean hasRole(String wanted) {
		return wanted.equals(role);
	}
}
