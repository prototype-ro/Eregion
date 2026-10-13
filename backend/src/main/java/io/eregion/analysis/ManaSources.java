package io.eregion.analysis;

import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Which colours of mana a card can make, read from its rules text and basic land types. */
final class ManaSources {

	static final String COLORS = "WUBRG";

	private static final Pattern ADD_CLAUSE = Pattern.compile("add ([^.\\n]*)");
	private static final Pattern SYMBOL = Pattern.compile("\\{([wubrgc])\\}");

	private ManaSources() {
	}

	/**
	 * The colours (W U B R G, and C for colourless) the card can add. A card that adds "any color" makes all five. When the deck has a
	 * colour identity, colours outside it are dropped, since mana of those colours cannot be spent on anything in the deck.
	 */
	static Set<String> colorsOf(AnalysisCard card, String identity) {
		Set<String> found = new LinkedHashSet<>();
		String text = card.oracleText().toLowerCase(Locale.ROOT);
		Matcher clause = ADD_CLAUSE.matcher(text);
		while (clause.find()) {
			String added = clause.group(1);
			if (added.contains("any color") || added.contains("any one color") || added.contains("any type")) {
				COLORS.chars().forEach(c -> found.add(String.valueOf((char) c)));
			}
			Matcher symbol = SYMBOL.matcher(added);
			while (symbol.find()) {
				found.add(symbol.group(1).toUpperCase(Locale.ROOT));
			}
		}
		String type = card.typeLine();
		if (type.contains("Plains")) {
			found.add("W");
		}
		if (type.contains("Island")) {
			found.add("U");
		}
		if (type.contains("Swamp")) {
			found.add("B");
		}
		if (type.contains("Mountain")) {
			found.add("R");
		}
		if (type.contains("Forest")) {
			found.add("G");
		}
		if (!identity.isBlank()) {
			found.removeIf(color -> !"C".equals(color) && !identity.contains(color));
		}
		return found;
	}

	/** Whether the card makes any mana at all. */
	static boolean produces(AnalysisCard card, String identity) {
		return !colorsOf(card, identity).isEmpty();
	}
}
