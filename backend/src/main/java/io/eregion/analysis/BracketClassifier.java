package io.eregion.analysis;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

import io.eregion.analysis.AnalysisDtos.Bracket;
import io.eregion.analysis.AnalysisDtos.ComboInfo;
import io.eregion.analysis.AnalysisDtos.Reason;
import io.eregion.analysis.AnalysisDtos.Signals;
import io.eregion.analysis.AnalysisDtos.Speed;

/**
 * Reads a Commander bracket off a card list, in two layers that are kept apart so the answer can always say which one decided it.
 *
 * <p>The <b>floor</b> comes from the content rules of Wizards of the Coast's brackets: Game Changers, mass land denial, extra turns that
 * can chain, and two-card combos. These are facts about the list, so they are exact (given the card lists they read).
 *
 * <p>The <b>estimate</b> is a weighted score of the speed signals: fast mana, tutors, combos, extra turns, Game Changers and a low
 * median mana value. The weights and cut-offs below are reasoned guesses, not fitted to labelled decks, so treat the estimate as a
 * second opinion and the floor as the rule. The shown bracket is the higher of the two.
 */
public final class BracketClassifier {

	static final String[] NAMES = { "", "Exhibition", "Core", "Upgraded", "Optimized", "cEDH" };

	/** A two-card combo that needs this much mana or less can happen early enough that bracket 3 does not allow it. */
	static final int EARLY_COMBO_MANA = 6;
	static final int CHAINABLE_EXTRA_TURNS = 3;
	static final int MAX_BRACKET_THREE_GAME_CHANGERS = 3;

	/**
	 * What a Game Changer adds to the speed score. Set so that two decks with known reference turns (Sauron 6.4, Kaalia 6.6 on the other site)
	 * both land close to them; two points fix two settings and leave nothing to check against, so revisit it with more reference turns.
	 */
	private static final double GAME_CHANGER_POINTS = 1.2;
	private static final double FAST_MANA_POINTS = 0.7;
	/** Points a tutor adds per unit of its weight, so a tutor that finds any card adds 0.6, a broad one 0.42 and a narrow one 0.24. */
	private static final double POINTS_PER_TUTOR_WEIGHT = 0.6;
	private static final double OPEN_TUTOR_WEIGHT = 1.0;
	private static final double TYPE_TUTOR_WEIGHT = 0.7;
	private static final double NARROW_TUTOR_WEIGHT = 0.4;
	/** The power tier Commander Spellbook gives its strongest combos. Only these set a bracket floor. */
	static final String TOP_COMBO_TIER = "R";
	private static final double EXTRA_TURN_POINTS = 0.5;
	private static final double MASS_LAND_DENIAL_POINTS = 1.0;
	private static final double EARLY_COMBO_POINTS = 2.0;
	private static final double TWO_CARD_COMBO_POINTS = 1.0;
	private static final double OTHER_WIN_COMBO_POINTS = 0.4;
	private static final double OTHER_WIN_COMBO_CAP = 2.0;
	private static final double ENGINE_TWO_CARD_COMBO_POINTS = 0.5;
	private static final double ENGINE_COMBO_POINTS = 0.15;
	private static final double ENGINE_COMBO_CAP = 0.6;
	private static final double LOW_CURVE_POINTS_PER_MANA = 0.5;

	/** A deck with a normal land count has about this much mana on turn 3, counting the games that miss a land drop. */
	private static final double NORMAL_TURN_THREE_MANA = 2.8;
	private static final double FAST_START_POINTS_PER_MANA = 1.5;
	private static final double COMBO_BY_SIX_POINTS = 3.0;

	/**
	 * Tutors and combos only make a deck fast when a game-ending combo tends to be ready. The simulator measures how often one is ready by
	 * turn 8; at this share of games or more they score in full. Below it they keep a floor, since a tutor is still good card selection and a
	 * combo can still turn up late. The floors were set on one deck whose reference turn is known (Sauron, 6.4 on the other site) and are not
	 * fitted to more than that: revisit them when more reference turns are available.
	 */
	private static final double FULL_READINESS_BY_TURN_EIGHT = 0.5;
	private static final double TUTOR_FLOOR = 0.75;
	private static final double COMBO_FLOOR = 0.6;

	private static final double TO_CORE_BELOW = 3;
	private static final double TO_UPGRADED_BELOW = 7;
	private static final double TO_OPTIMIZED_BELOW = 14;

	/** "search your library for a card" with no type named. */
	private static final Pattern UNCONDITIONAL_TUTOR = Pattern.compile("search your library for (a|an|any|up to [a-z]+) cards?\\b(?! (named|with|that|of the))");

	/** "search your library for a creature card": a whole card type, which finds a lot but not anything. */
	private static final Pattern TYPE_TUTOR = Pattern.compile(
			"search your library for (a|an|up to [a-z]+) (legendary |nonland |noncreature |nonbasic )?(artifact|creature|instant|sorcery|enchantment|planeswalker|permanent)( or (artifact|creature|instant|sorcery|enchantment|planeswalker))? cards?\\b(?! (named|with))");

	/** A spell that puts a card from a graveyard onto the battlefield, or an Aura that does, such as Animate Dead. */
	private static final Pattern REANIMATION_BATTLEFIELD = Pattern.compile("(onto|to) the battlefield|enchant creature card in a graveyard");

	/**
	 * A few reanimation spells are in many decks. Beyond this many a deck is built to cheat creatures into play, which is fast, so each one
	 * further adds a little to the speed score, up to a cap. The rate was set on one reanimator list whose reference turn is known.
	 */
	private static final int REANIMATION_COMMON = 5;
	private static final double REANIMATION_POINTS = 0.15;
	private static final double REANIMATION_CAP = 1.5;

	private BracketClassifier() {
	}

	public static Bracket classify(List<AnalysisCard> cards, List<ComboInfo> combos, double medianManaValue) {
		return classify(cards, combos, medianManaValue, null);
	}

	/**
	 * @param combos the combos in the deck, or null when the combo service could not be reached
	 * @param speed what simulated games of the deck showed, or null when they were not run
	 */
	public static Bracket classify(List<AnalysisCard> cards, List<ComboInfo> combos, double medianManaValue, Speed speed) {
		Signals signals = signals(cards, combos);
		List<Reason> reasons = reasons(signals, combos);
		int floor = reasons.stream().mapToInt(Reason::bracket).max().orElse(1);

		Map<String, Double> parts = scoreParts(signals, medianManaValue, speed);
		double score = round(parts.values().stream().mapToDouble(Double::doubleValue).sum());
		int estimated = estimate(score, signals);
		int bracket = Math.max(floor, estimated);

		String basis = floor > estimated ? reasons.stream().filter(r -> r.bracket() == floor).findFirst().orElseThrow().kind() : "speed";
		return new Bracket(floor, estimated, bracket, NAMES[bracket], basis, score, parts, signals, reasons,
				whatWouldChange(bracket, basis, reasons, signals), note(bracket, estimated, signals));
	}

	static Signals signals(List<AnalysisCard> cards, List<ComboInfo> combos) {
		List<String> gameChangers = new ArrayList<>();
		List<String> landDenial = new ArrayList<>();
		List<String> extraTurns = new ArrayList<>();
		List<String> fastMana = new ArrayList<>();
		int gcCount = 0;
		int mldCount = 0;
		int turnCount = 0;
		int fastCount = 0;
		int tutors = 0;
		int unconditional = 0;
		double weighted = 0;
		int reanimation = 0;
		for (AnalysisCard card : cards) {
			if (!card.counted()) {
				continue;
			}
			if (card.has(BracketFlags.GAME_CHANGER)) {
				gcCount += card.quantity();
				gameChangers.add(card.name());
			}
			if (card.has(BracketFlags.MASS_LAND_DENIAL)) {
				mldCount += card.quantity();
				landDenial.add(card.name());
			}
			if (card.has(BracketFlags.EXTRA_TURN)) {
				turnCount += card.quantity();
				extraTurns.add(card.name());
			}
			if (card.has(BracketFlags.FAST_MANA)) {
				fastCount += card.quantity();
				fastMana.add(card.name());
			}
			// Scryfall's Tagger also calls a fetch land a tutor, but it only thins the deck. A tutor is a spell.
			if (!card.isLand() && isReanimation(card.oracleText())) {
				reanimation += card.quantity();
			}
			if (card.hasRole("Tutor") && !card.isLand()) {
				tutors += card.quantity();
				double weight = tutorWeight(card.oracleText());
				weighted += weight * card.quantity();
				if (weight == OPEN_TUTOR_WEIGHT) {
					unconditional += card.quantity();
				}
			}
		}
		Integer twoCard = null;
		Integer early = null;
		Integer wins = null;
		Integer ending = null;
		Integer endingTwo = null;
		Integer earlyEndingTwo = null;
		if (combos != null) {
			twoCard = (int) combos.stream().filter(c -> isTwoCardLoop(c)).count();
			early = (int) combos.stream().filter(c -> isTwoCardLoop(c) && isEarly(c)).count();
			wins = (int) combos.stream().filter(ComboInfo::winsOrLoops).count();
			ending = (int) combos.stream().filter(ComboInfo::endsGame).count();
			endingTwo = (int) combos.stream().filter(c -> c.cards().size() == 2 && c.endsGame()).count();
			earlyEndingTwo = (int) combos.stream().filter(c -> c.cards().size() == 2 && c.endsGame() && isEarly(c)).count();
		}
		return new Signals(gcCount, gameChangers, mldCount, landDenial, turnCount, extraTurns, tutors, unconditional, fastCount, fastMana,
				twoCard, early, wins, ending, endingTwo, earlyEndingTwo, Math.round(weighted * 100.0) / 100.0, reanimation);
	}

	static boolean isReanimation(String oracleText) {
		String text = oracleText.toLowerCase(Locale.ROOT);
		return text.contains("graveyard") && REANIMATION_BATTLEFIELD.matcher(text).find();
	}

	/** How freely a tutor finds a card, from its rules text. */
	static double tutorWeight(String oracleText) {
		String text = oracleText.toLowerCase(Locale.ROOT);
		if (UNCONDITIONAL_TUTOR.matcher(text).find()) {
			return OPEN_TUTOR_WEIGHT;
		}
		return TYPE_TUTOR.matcher(text).find() ? TYPE_TUTOR_WEIGHT : NARROW_TUTOR_WEIGHT;
	}

	/**
	 * Whether a combo may set a bracket floor. Commander Spellbook rates how strong each combo is, and the strongest tier is the one that
	 * decides a bracket: a two-card loop that needs setup, or only makes resources, is not a reason to move up. A combo with no rating keeps
	 * the plain rule, so a missing tier never lowers a bracket.
	 */
	static boolean floorEligible(ComboInfo combo) {
		String tier = combo.bracketTag();
		return tier == null || tier.isBlank() || TOP_COMBO_TIER.equals(tier);
	}

	private static boolean isTwoCardLoop(ComboInfo combo) {
		return combo.cards().size() == 2 && combo.winsOrLoops();
	}

	private static boolean isEarly(ComboInfo combo) {
		return combo.manaValueNeeded() != null && combo.manaValueNeeded() <= EARLY_COMBO_MANA;
	}

	private static List<Reason> reasons(Signals s, List<ComboInfo> combos) {
		List<Reason> reasons = new ArrayList<>();
		if (s.massLandDenial() > 0) {
			reasons.add(new Reason("mass_land_denial", 4,
					"Mass land denial (" + String.join(", ", s.massLandDenialCards()) + ") puts a deck in bracket 4 or higher.", s.massLandDenialCards()));
		}
		if (!twoCardLoops(combos, true).isEmpty()) {
			reasons.add(new Reason("combo", 4, "A top-tier two-card combo that is castable early (" + comboNames(combos, true) + ") is bracket 4.",
					comboCards(combos, true)));
		}
		else if (!twoCardLoops(combos, false).isEmpty()) {
			reasons.add(new Reason("combo", 3, "A top-tier two-card combo (" + comboNames(combos, false) + ") is allowed from bracket 3, late in the game.",
					comboCards(combos, false)));
		}
		if (s.gameChangers() > MAX_BRACKET_THREE_GAME_CHANGERS) {
			reasons.add(new Reason("game_changers", 4, s.gameChangers() + " Game Changers. Bracket 3 allows up to three.", s.gameChangerCards()));
		}
		else if (s.gameChangers() > 0) {
			reasons.add(new Reason("game_changers", 3, plural(s.gameChangers(), "Game Changer") + ". Brackets 1 and 2 allow none.", s.gameChangerCards()));
		}
		if (s.extraTurns() >= CHAINABLE_EXTRA_TURNS) {
			reasons.add(new Reason("extra_turns", 4, s.extraTurns() + " extra turn cards can be chained, which brackets 3 and below do not allow.", s.extraTurnCards()));
		}
		return reasons;
	}

	private static List<ComboInfo> twoCardLoops(List<ComboInfo> combos, boolean earlyOnly) {
		return combos == null ? List.of() : combos.stream().filter(c -> isTwoCardLoop(c) && floorEligible(c) && (!earlyOnly || isEarly(c))).toList();
	}

	private static String comboNames(List<ComboInfo> combos, boolean earlyOnly) {
		return String.join("; ", twoCardLoops(combos, earlyOnly).stream().map(c -> String.join(" + ", c.cards())).limit(2).toList());
	}

	private static List<String> comboCards(List<ComboInfo> combos, boolean earlyOnly) {
		return new ArrayList<>(new LinkedHashSet<>(twoCardLoops(combos, earlyOnly).stream().flatMap(c -> c.cards().stream()).toList()));
	}

	/**
	 * How much of a tutor's or combo's worth to count, from 0 to 1: how often the simulated deck gets a game-ending combo ready by turn 8,
	 * against {@link #FULL_READINESS_BY_TURN_EIGHT}. It is 1 (no discount) when that cannot be judged: combos unknown, or no simulation.
	 */
	static double readiness(Signals s, Speed speed) {
		if (speed == null || s.twoCardCombos() == null) {
			return 1.0;
		}
		return Math.min(1.0, speed.comboByTurn().getOrDefault("8", 0.0) / FULL_READINESS_BY_TURN_EIGHT);
	}

	private static double credit(double floor, double readiness) {
		return floor + (1.0 - floor) * readiness;
	}

	static Map<String, Double> scoreParts(Signals s, double medianManaValue, Speed speed) {
		double ready = readiness(s, speed);
		Map<String, Double> parts = new LinkedHashMap<>();
		parts.put("Game Changers", round(s.gameChangers() * GAME_CHANGER_POINTS));
		parts.put("Fast mana", round(s.fastMana() * FAST_MANA_POINTS));
		parts.put("Tutors", round(s.weightedTutors() * POINTS_PER_TUTOR_WEIGHT * credit(TUTOR_FLOOR, ready)));
		parts.put("Extra turns", round(s.extraTurns() * EXTRA_TURN_POINTS));
		parts.put("Reanimation", round(Math.min(REANIMATION_CAP, Math.max(0, s.reanimation() - REANIMATION_COMMON) * REANIMATION_POINTS)));
		parts.put("Mass land denial", round(s.massLandDenial() * MASS_LAND_DENIAL_POINTS));
		double combos = 0;
		if (s.twoCardCombos() != null) {
			// A loop that ends the game scores in full. One that only makes mana or draws needs a payoff, so it scores a fraction.
			int endingTwo = s.endingTwoCardCombos();
			int earlyEnding = s.earlyEndingTwoCardCombos();
			int engineTwo = s.twoCardCombos() - endingTwo;
			int otherEnding = Math.max(0, s.endingCombos() - endingTwo);
			int otherEngine = Math.max(0, s.winCombos() - s.twoCardCombos() - otherEnding);
			combos = earlyEnding * EARLY_COMBO_POINTS + (endingTwo - earlyEnding) * TWO_CARD_COMBO_POINTS + engineTwo * ENGINE_TWO_CARD_COMBO_POINTS
					+ Math.min(OTHER_WIN_COMBO_CAP, otherEnding * OTHER_WIN_COMBO_POINTS)
					+ Math.min(ENGINE_COMBO_CAP, otherEngine * ENGINE_COMBO_POINTS);
		}
		parts.put("Combos", round(combos * credit(COMBO_FLOOR, ready)));
		parts.put("Low curve", round(medianManaValue > 0 && medianManaValue < 3 ? (3 - medianManaValue) * LOW_CURVE_POINTS_PER_MANA : 0));
		if (speed != null) {
			// Mana on turn 3 above what a deck of lands alone gives, and how often a game ending combo can be run by turn 6.
			parts.put("Fast start", round(Math.max(0, speed.manaByTurn().get(2) - NORMAL_TURN_THREE_MANA) * FAST_START_POINTS_PER_MANA));
			Double byTurnSix = speed.comboByTurn().get("6");
			parts.put("Combo by turn 6", round(byTurnSix == null ? 0 : byTurnSix * COMBO_BY_SIX_POINTS));
		}
		parts.values().removeIf(points -> points == 0);
		return parts;
	}

	/** Bracket 5 needs the whole kit at once, so a pile of staples alone stays at 4. Bracket 1 is about intent and is never estimated. */
	static int estimate(double score, Signals s) {
		if (score < TO_CORE_BELOW) {
			return 2;
		}
		if (score < TO_UPGRADED_BELOW) {
			return 3;
		}
		if (score < TO_OPTIMIZED_BELOW) {
			return 4;
		}
		boolean kit = s.fastMana() >= 3 && s.tutors() >= 4 && (s.winCombos() == null || s.winCombos() >= 1);
		return kit ? 5 : 4;
	}

	private static List<String> whatWouldChange(int bracket, String basis, List<Reason> reasons, Signals s) {
		List<String> changes = new ArrayList<>();
		for (Reason reason : reasons) {
			if (reason.bracket() != bracket) {
				continue;
			}
			switch (reason.kind()) {
				case "mass_land_denial" -> changes.add("Cut " + String.join(" and ", s.massLandDenialCards()) + " to leave the mass land denial floor.");
				case "game_changers" -> changes.add(bracket == 4
						? "Cut " + (s.gameChangers() - MAX_BRACKET_THREE_GAME_CHANGERS) + " Game Changers to be eligible for bracket 3."
						: "Cut all Game Changers to be eligible for bracket 2.");
				case "extra_turns" -> changes.add("Cut " + (s.extraTurns() - (CHAINABLE_EXTRA_TURNS - 1)) + " extra turn cards to stop them chaining.");
				case "combo" -> changes.add("Cut a piece of " + String.join(" and ", reason.cards().stream().limit(4).toList()) + " to break the combo.");
				default -> {
				}
			}
		}
		if ("speed".equals(basis) && bracket >= 3) {
			changes.add("No single rule sets this bracket. The speed signals do: trim fast mana, tutors and combos to lower it.");
		}
		return changes;
	}

	private static String note(int bracket, int estimated, Signals s) {
		if (s.twoCardCombos() == null) {
			return "Combo data was not available, so combos are not counted. The bracket may be higher.";
		}
		if (bracket == 2 && estimated == 2) {
			return "Bracket 1 is about playing a themed deck for fun, which a card list cannot show. This list reads as bracket 2 or below.";
		}
		return null;
	}

	private static String plural(int count, String noun) {
		return count + " " + noun + (count == 1 ? "" : "s");
	}

	private static double round(double value) {
		return Math.round(value * 100.0) / 100.0;
	}
}
