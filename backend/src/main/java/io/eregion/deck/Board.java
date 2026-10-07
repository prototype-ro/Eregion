package io.eregion.deck;

import io.eregion.common.ApiException;

/** Which part of the deck a card sits in. Only commander and main count toward the 100. */
public enum Board {

	COMMANDER("commander", true),
	MAIN("main", true),
	MAYBE("maybe", false),
	CONSIDERING("considering", false);

	private final String db;
	private final boolean counted;

	Board(String db, boolean counted) {
		this.db = db;
		this.counted = counted;
	}

	public String db() {
		return db;
	}

	public static Board fromDb(String value) {
		for (Board board : values()) {
			if (board.db.equals(value)) {
				return board;
			}
		}
		throw ApiException.badRequest("Unknown board '" + value + "'. Use commander, main, maybe or considering.");
	}

	/** Lenient check for stored rows: unknown values never count. */
	public static boolean isCounted(String value) {
		for (Board board : values()) {
			if (board.db.equals(value)) {
				return board.counted;
			}
		}
		return false;
	}
}
