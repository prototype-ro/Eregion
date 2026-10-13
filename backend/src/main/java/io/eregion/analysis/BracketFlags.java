package io.eregion.analysis;

/** The facts about a card that decide a Commander bracket, kept in {@code card_bracket_flags}. */
public final class BracketFlags {

	public static final String GAME_CHANGER = "game_changer";
	public static final String EXTRA_TURN = "extra_turn";
	public static final String MASS_LAND_DENIAL = "mass_land_denial";
	public static final String FAST_MANA = "fast_mana";

	private BracketFlags() {
	}
}
