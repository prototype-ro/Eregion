package io.eregion.card;

import java.util.regex.Pattern;

/**
 * Turns what a person types into a safe Scryfall search. Anything that could be read
 * as search syntax (colons, quotes, parentheses, operators) is dropped, so a typed
 * name can only ever be a name search.
 */
public final class ScryfallQuery {

	private static final Pattern DISALLOWED = Pattern.compile("[^\\p{L}\\p{N} ',\\-]");
	private static final Pattern SPACES = Pattern.compile("\\s+");
	private static final Pattern LEADING_HYPHEN = Pattern.compile("(^|\\s)-+");

	private ScryfallQuery() {
	}

	/** Cleaned text, or an empty string when too little is left to search for. */
	public static String sanitize(String raw) {
		if (raw == null) {
			return "";
		}
		String spaced = SPACES.matcher(DISALLOWED.matcher(raw).replaceAll(" ")).replaceAll(" ").trim();
		// A hyphen is fine inside a name (Lim-Dul) but at the start of a word Scryfall reads it as "exclude".
		String cleaned = LEADING_HYPHEN.matcher(spaced).replaceAll("$1").trim();
		return cleaned.length() < 2 ? "" : cleaned;
	}

	/** Bare words match card names in Scryfall. Paper only, so Alchemy-only cards stay out. */
	public static String toScryfall(String cleaned) {
		return cleaned + " game:paper";
	}
}
