package io.eregion.card;

import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Builds the search that is sent to Scryfall from what the advanced search form sends. The person's own text is kept, because
 * advanced search is meant to take Scryfall's syntax, but it is cleaned, and the parts that must not be left to it are set here:
 * which cards count (paper only, one per name), the order, and the options that come from Eregion rather than from the text.
 */
public final class AdvancedSearchQuery {

	public static final int MAX_LENGTH = 400;
	static final Set<String> ORDERS = Set.of("name", "cmc", "power", "toughness", "usd", "rarity", "color", "edhrec", "released");

	private static final Pattern CONTROL = Pattern.compile("\\p{Cntrl}");
	private static final Pattern SPACES = Pattern.compile("\\s+");
	/** Options that change which cards or how many come back. The page decides these, not the text. */
	private static final Pattern OVERRIDES = Pattern.compile("(?i)(^|\\s)-?(unique|prefer|include|order|direction|game|lang):\\S*");

	private AdvancedSearchQuery() {
	}

	/** The person's text with control characters, our own overrides and extra spaces taken out. */
	public static String clean(String raw) {
		if (raw == null) {
			return "";
		}
		String noControl = CONTROL.matcher(raw).replaceAll(" ");
		String noOverrides = OVERRIDES.matcher(noControl).replaceAll(" ");
		return SPACES.matcher(noOverrides).replaceAll(" ").trim();
	}

	/**
	 * The final Scryfall query. Returns null when there is nothing to search for, so an empty form does not ask for every card.
	 *
	 * @param roleTags the Scryfall tags of the role asked for, or empty when none was
	 */
	public static String build(String text, boolean legalInCommander, List<String> roleTags) {
		String cleaned = clean(text);
		if (cleaned.length() > MAX_LENGTH) {
			cleaned = cleaned.substring(0, MAX_LENGTH);
		}
		if (cleaned.isEmpty() && roleTags.isEmpty()) {
			return null;
		}
		StringBuilder query = new StringBuilder();
		if (!cleaned.isEmpty()) {
			query.append(cleaned);
		}
		if (!roleTags.isEmpty()) {
			query.append(" (");
			for (int i = 0; i < roleTags.size(); i++) {
				query.append(i > 0 ? " or " : "").append("otag:").append(roleTags.get(i));
			}
			query.append(')');
		}
		if (legalInCommander) {
			query.append(" f:commander");
		}
		query.append(" game:paper");
		return query.toString().trim();
	}

	public static String order(String requested) {
		String order = requested == null ? "" : requested.toLowerCase(Locale.ROOT);
		return ORDERS.contains(order) ? order : "name";
	}

	public static String direction(String requested) {
		return "desc".equalsIgnoreCase(requested) ? "desc" : "asc";
	}
}
