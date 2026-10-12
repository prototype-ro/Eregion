package io.eregion.card;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;

/** The three columns that say what a card does in a deck, for any query that has a card id to look them up by. */
public final class FunctionalTagSql {

	private FunctionalTagSql() {
	}

	/**
	 * The card's main role, where that role came from, and its other roles (most confident first), as the columns
	 * {@code role}, {@code role_source} and {@code secondary_roles}.
	 */
	public static String columns(String cardId) {
		return "(SELECT t.category FROM card_functional_tags t WHERE t.card_id = " + cardId + " AND t.is_primary) AS role,\n"
				+ "(SELECT t.source FROM card_functional_tags t WHERE t.card_id = " + cardId + " AND t.is_primary) AS role_source,\n"
				+ "(SELECT array_agg(t.category ORDER BY t.confidence DESC, t.category) FROM card_functional_tags t"
				+ " WHERE t.card_id = " + cardId + " AND NOT t.is_primary) AS secondary_roles";
	}

	public static List<String> secondary(ResultSet rs) throws SQLException {
		java.sql.Array array = rs.getArray("secondary_roles");
		return array == null ? List.of() : List.of((String[]) array.getArray());
	}
}
