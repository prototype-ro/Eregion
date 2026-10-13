package io.eregion.analysis;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.SplittableRandom;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import io.eregion.analysis.AnalysisDtos.ComboInfo;
import io.eregion.analysis.AnalysisDtos.Speed;
import io.eregion.card.NameNormalizer;

/**
 * Plays the deck alone against nobody, many times, to see how fast it sets up. A game is seeded from the deck's own contents, so the
 * same deck always gives the same numbers.
 *
 * <p>What a game does: draw seven (mulligan a hand of fewer than 2 or more than 5 lands, twice at most, the first one free), then each
 * turn draw (not on turn 1), play a land, cast mana rocks, mana creatures and land-fetching spells cheapest first, and then see whether
 * the commander or a game-ending combo can be paid for with what is left. Tutors are cast to fetch a missing combo piece.
 *
 * <p>Colours matter: every spell has coloured pips and needs at least that many sources of each colour on the battlefield, so a deck
 * whose lands do not make the colours of its ramp casts it late. Lands that enter tapped (and the ones that do so unless a condition
 * holds) give their mana a turn later. A combo counts only if it ends the game by itself; an infinite mana or draw loop needs a payoff and
 * is not counted here.
 *
 * <p>What it deliberately does not do, so the numbers are read for what they are: it ignores commander tax (the first cast has none),
 * does not cast other spells, does not model opponents or disruption, and does not estimate damage. A combo is "executable" on the first
 * turn all of its pieces have been drawn, can each be cast with the colours at hand, and the mana available covers the combo's mana value.
 * That is a measure of setup speed, which is most of what separates the fast brackets from the slow ones, and not a prediction of the
 * turn a game ends.
 */
public final class GoldfishSimulator {

	static final int GAMES = 800;
	static final int MAX_TURN = 12;
	static final int REPORT_TURNS = 8;
	static final int OPENING = 7;
	static final int MAX_MULLIGANS = 2;
	static final int KEEP_MIN_LANDS = 2;
	static final int KEEP_MAX_LANDS = 5;
	static final int MIN_LIBRARY = 20;
	static final int MAX_COMBOS = 30;
	static final int[] COMMANDER_TURNS = { 3, 4, 5, 6 };
	static final int[] COMBO_TURNS = { 4, 6, 8, 10 };
	private static final String COLORS = "WUBRG";

	private static final Pattern ADD_CLAUSE = Pattern.compile("add ([^.\\n]*)");
	private static final Pattern MANA_SYMBOL = Pattern.compile("\\{[wubrgc]}");
	private static final Pattern PIP = Pattern.compile("\\{([WUBRG])}");
	private static final Pattern FETCH_LAND = Pattern.compile(
			"search your library for (a|an|up to (one|two|three)|one|two|three|\\d+)[^.]*land cards?[^.]*onto the battlefield");

	/** How a land enters: untapped, always tapped, tapped early in the game (check lands) or tapped late (fast lands). */
	enum Tap { UNTAPPED, TAPPED, EARLY, LATE }

	/** The few facts about a card the simulation reads. */
	private record Sim(String key, double value, boolean land, int produces, boolean creature, int fetchesLands, boolean tutor, int[] pips, int[] makes,
			Tap tap) {
	}

	private GoldfishSimulator() {
	}

	/**
	 * @param combos the combos in the deck, or null when the combo service could not be reached. Only those that end the game count.
	 * @return null when the main board is too small to play
	 */
	public static Speed simulate(List<AnalysisCard> deck, List<ComboInfo> combos) {
		String identity = CompositionCalculator.identityOf(deck);
		List<Sim> library = new ArrayList<>();
		Sim commander = null;
		long seed = 17;
		for (AnalysisCard card : deck) {
			if (card.isCommander()) {
				Sim sim = read(card, identity);
				commander = commander == null || sim.value() > commander.value() ? sim : commander;
				continue;
			}
			if (!"main".equals(card.board())) {
				continue;
			}
			Sim sim = read(card, identity);
			for (int i = 0; i < card.quantity(); i++) {
				library.add(sim);
			}
			seed = seed * 31 + sim.key().hashCode() * 7L + card.quantity();
		}
		if (library.size() < MIN_LIBRARY) {
			return null;
		}
		Map<String, Sim> known = new HashMap<>();
		library.forEach(sim -> known.putIfAbsent(sim.key(), sim));
		if (commander != null) {
			known.putIfAbsent(commander.key(), commander);
		}
		List<Combo> targets = targets(combos, known);

		SplittableRandom random = new SplittableRandom(seed);
		double[] mana = new double[REPORT_TURNS];
		int[] commanderFirst = new int[GAMES];
		int[] comboFirst = new int[GAMES];
		for (int game = 0; game < GAMES; game++) {
			Result result = play(library, commander, targets, random);
			for (int turn = 0; turn < REPORT_TURNS; turn++) {
				mana[turn] += result.mana()[turn];
			}
			commanderFirst[game] = result.commanderTurn();
			comboFirst[game] = result.comboTurn();
		}

		List<Double> manaByTurn = new ArrayList<>();
		for (double total : mana) {
			manaByTurn.add(round(total / GAMES, 2));
		}
		Map<String, Double> commanderBy = new LinkedHashMap<>();
		Double commanderTurn = null;
		if (commander != null) {
			for (int turn : COMMANDER_TURNS) {
				commanderBy.put(String.valueOf(turn), share(commanderFirst, turn));
			}
			commanderTurn = median(commanderFirst);
		}
		Map<String, Double> comboBy = new LinkedHashMap<>();
		Double comboTurn = null;
		Double comboMean = null;
		if (!targets.isEmpty()) {
			for (int turn : COMBO_TURNS) {
				comboBy.put(String.valueOf(turn), share(comboFirst, turn));
			}
			comboTurn = median(comboFirst);
			comboMean = round(Arrays.stream(comboFirst).mapToDouble(turn -> turn == 0 ? MAX_TURN : turn).average().orElse(MAX_TURN), 2);
		}
		return new Speed(GAMES, manaByTurn, commanderTurn, commanderBy, comboTurn, comboMean, comboBy, assumptions());
	}

	private static List<String> assumptions() {
		return List.of(
				"On the play, 7 card hands, a free first mulligan.",
				"Spells need the colours of their cost. Lands that enter tapped give their mana a turn later.",
				"Commander tax is ignored. Only mana, land fetching and tutors are cast. Other spells and opponents are not played.",
				"A combo counts when it ends the game by itself, once its pieces are drawn, castable and the mana covers it.");
	}

	// ---- one game ----

	private record Result(double[] mana, int commanderTurn, int comboTurn) {
	}

	private record Combo(Set<String> pieces, int cost, int[] pips) {
	}

	/** What is on the battlefield: mana that can be spent now, and mana that arrives at the start of next turn. */
	private static final class Board {
		int lands;
		int manaReady;
		final int[] colorsReady = new int[COLORS.length()];
		int manaNext;
		final int[] colorsNext = new int[COLORS.length()];

		void startTurn() {
			manaReady += manaNext;
			for (int i = 0; i < colorsReady.length; i++) {
				colorsReady[i] += colorsNext[i];
				colorsNext[i] = 0;
			}
			manaNext = 0;
		}

		void add(int mana, int[] makes, boolean now) {
			if (now) {
				manaReady += mana;
			}
			else {
				manaNext += mana;
			}
			for (int i = 0; i < makes.length; i++) {
				if (now) {
					colorsReady[i] += makes[i];
				}
				else {
					colorsNext[i] += makes[i];
				}
			}
		}

		/** Whether the coloured pips of a cost can be paid, each colour checked on its own. */
		boolean pays(int[] pips) {
			for (int i = 0; i < pips.length; i++) {
				if (pips[i] > colorsReady[i]) {
					return false;
				}
			}
			return true;
		}
	}

	/** Turn numbers are 1-based. A value of 0 means it never happened within {@link #MAX_TURN} turns. */
	private static Result play(List<Sim> deck, Sim commander, List<Combo> combos, SplittableRandom random) {
		List<Sim> library = new ArrayList<>(deck);
		List<Sim> hand = new ArrayList<>();
		deal(library, hand, random);

		Set<String> drawn = new HashSet<>();
		hand.forEach(card -> drawn.add(card.key()));
		if (commander != null) {
			drawn.add(commander.key());
		}
		Board board = new Board();
		double[] manaByTurn = new double[REPORT_TURNS];
		int commanderTurn = 0;
		int comboTurn = 0;

		for (int turn = 1; turn <= MAX_TURN; turn++) {
			if (turn > 1 && !library.isEmpty()) {
				Sim top = library.remove(library.size() - 1);
				hand.add(top);
				drawn.add(top.key());
			}
			board.startTurn();

			Sim land = bestLand(hand, board);
			if (land != null) {
				hand.remove(land);
				board.add(land.produces(), land.makes(), !tapped(land, board.lands));
				board.lands++;
			}
			double available = rampTurn(hand, library, board);
			if (turn <= REPORT_TURNS) {
				manaByTurn[turn - 1] = available;
			}
			if (commanderTurn == 0 && commander != null && available >= commander.value() && board.pays(commander.pips())) {
				commanderTurn = turn;
			}
			if (comboTurn == 0 && !combos.isEmpty()) {
				double left = available;
				Combo best = easiest(combos, drawn);
				while (!ready(best, drawn, left, board) && left > 0) {
					Sim tutor = castableTutor(hand, left, board);
					String missing = tutor == null ? null : missingPiece(best, drawn, library);
					if (tutor == null || missing == null) {
						break;
					}
					hand.remove(tutor);
					left -= tutor.value();
					Sim found = take(library, missing);
					hand.add(found);
					drawn.add(found.key());
				}
				if (ready(best, drawn, left, board)) {
					comboTurn = turn;
				}
			}
		}
		return new Result(manaByTurn, commanderTurn, comboTurn);
	}

	private static boolean tapped(Sim land, int landsOnBattlefield) {
		return switch (land.tap()) {
			case UNTAPPED -> false;
			case TAPPED -> true;
			case EARLY -> landsOnBattlefield < 2;
			case LATE -> landsOnBattlefield > 2;
		};
	}

	/**
	 * Casts mana rocks, mana creatures and land fetches, cheapest first, as long as they can be paid for in mana and colour. Returns the mana
	 * left over. A rock gives its mana at once, a creature and a fetched land the turn after.
	 */
	private static double rampTurn(List<Sim> hand, List<Sim> library, Board board) {
		double left = board.manaReady;
		boolean cast = true;
		while (cast) {
			cast = false;
			Sim pick = null;
			for (Sim card : hand) {
				boolean useful = !card.land() && (card.produces() > 0 || card.fetchesLands() > 0);
				if (useful && card.value() <= left && board.pays(card.pips()) && (pick == null || card.value() < pick.value())) {
					pick = card;
				}
			}
			if (pick != null) {
				hand.remove(pick);
				left -= pick.value();
				cast = true;
				if (pick.fetchesLands() > 0) {
					for (int i = 0; i < pick.fetchesLands(); i++) {
						Sim fetched = take(library, Sim::land);
						if (fetched != null) {
							board.add(fetched.produces(), fetched.makes(), false);
						}
					}
				}
				else if (pick.creature()) {
					board.add(pick.produces(), pick.makes(), false);
				}
				else {
					board.add(pick.produces(), pick.makes(), true);
					left += pick.produces();
				}
			}
		}
		return left;
	}

	// ---- helpers ----

	private static void deal(List<Sim> library, List<Sim> hand, SplittableRandom random) {
		for (int mulligan = 0; mulligan <= MAX_MULLIGANS; mulligan++) {
			library.addAll(hand);
			hand.clear();
			shuffle(library, random);
			for (int i = 0; i < OPENING; i++) {
				hand.add(library.remove(library.size() - 1));
			}
			long lands = hand.stream().filter(Sim::land).count();
			if ((lands >= KEEP_MIN_LANDS && lands <= KEEP_MAX_LANDS) || mulligan == MAX_MULLIGANS) {
				// London mulligan: draw seven, then put one card on the bottom for each mulligan after the free one.
				for (int bottom = 0; bottom < Math.max(0, mulligan - 1); bottom++) {
					Sim worst = worst(hand, lands > 3);
					hand.remove(worst);
					library.add(0, worst);
				}
				return;
			}
		}
	}

	private static Sim worst(List<Sim> hand, boolean tooManyLands) {
		Sim worst = hand.get(0);
		for (Sim card : hand) {
			boolean worse = tooManyLands ? card.land() && !worst.land() : card.value() > worst.value() && !card.land();
			if (worse) {
				worst = card;
			}
		}
		return worst;
	}

	private static void shuffle(List<Sim> cards, SplittableRandom random) {
		for (int i = cards.size() - 1; i > 0; i--) {
			Collections.swap(cards, i, random.nextInt(i + 1));
		}
	}

	/** The land to play: one that enters untapped first, then the one that adds the most colours the board does not yet make. */
	private static Sim bestLand(List<Sim> hand, Board board) {
		Sim best = null;
		double bestScore = -1;
		for (Sim card : hand) {
			if (!card.land()) {
				continue;
			}
			double score = (tapped(card, board.lands) ? 0 : 100) + card.produces();
			for (int color = 0; color < card.makes().length; color++) {
				if (card.makes()[color] > 0 && board.colorsReady[color] + board.colorsNext[color] == 0) {
					score += 10;
				}
			}
			if (score > bestScore) {
				best = card;
				bestScore = score;
			}
		}
		return best;
	}

	private static Sim castableTutor(List<Sim> hand, double mana, Board board) {
		Sim best = null;
		for (Sim card : hand) {
			if (card.tutor() && card.value() <= mana && board.pays(card.pips()) && (best == null || card.value() < best.value())) {
				best = card;
			}
		}
		return best;
	}

	private static Sim take(List<Sim> library, String key) {
		return take(library, card -> card.key().equals(key));
	}

	private static Sim take(List<Sim> library, java.util.function.Predicate<Sim> wanted) {
		for (int i = 0; i < library.size(); i++) {
			if (wanted.test(library.get(i))) {
				return library.remove(i);
			}
		}
		return null;
	}

	/** The combo closest to done: the fewest pieces still undrawn. */
	private static Combo easiest(List<Combo> combos, Set<String> drawn) {
		Combo best = combos.get(0);
		long bestMissing = Long.MAX_VALUE;
		for (Combo combo : combos) {
			long missing = combo.pieces().stream().filter(piece -> !drawn.contains(piece)).count();
			if (missing < bestMissing) {
				best = combo;
				bestMissing = missing;
			}
		}
		return best;
	}

	private static boolean ready(Combo combo, Set<String> drawn, double mana, Board board) {
		return drawn.containsAll(combo.pieces()) && mana >= combo.cost() && board.pays(combo.pips());
	}

	private static String missingPiece(Combo combo, Set<String> drawn, List<Sim> library) {
		for (String piece : combo.pieces()) {
			if (!drawn.contains(piece) && library.stream().anyMatch(card -> card.key().equals(piece))) {
				return piece;
			}
		}
		return null;
	}

	/** The combos that end the game, most popular first, each with the colours its pieces need (the most any one piece asks for). */
	private static List<Combo> targets(List<ComboInfo> combos, Map<String, Sim> known) {
		if (combos == null) {
			return List.of();
		}
		List<Combo> targets = new ArrayList<>();
		combos.stream().filter(ComboInfo::endsGame).sorted((a, b) -> Integer.compare(b.popularity(), a.popularity())).limit(MAX_COMBOS)
				.forEach(combo -> {
					Set<String> pieces = new HashSet<>();
					int[] pips = new int[COLORS.length()];
					combo.cards().forEach(name -> {
						String key = key(name);
						pieces.add(key);
						Sim sim = known.get(key);
						if (sim != null) {
							for (int i = 0; i < pips.length; i++) {
								pips[i] = Math.max(pips[i], sim.pips()[i]);
							}
						}
					});
					int cost = combo.manaValueNeeded() != null ? combo.manaValueNeeded() : 0;
					targets.add(new Combo(pieces, cost, pips));
				});
		return targets;
	}

	private static Sim read(AnalysisCard card, String identity) {
		String text = card.oracleText().toLowerCase(Locale.ROOT);
		boolean permanent = !"Instant".equals(card.primaryType()) && !"Sorcery".equals(card.primaryType());
		int produces = 0;
		if (card.isLand() || (permanent && text.contains("{t}") && ManaSources.produces(card, ""))) {
			produces = Math.max(1, produced(text));
		}
		int fetches = 0;
		Matcher fetch = FETCH_LAND.matcher(text);
		if (!card.isLand() && fetch.find()) {
			String amount = fetch.group(2) != null ? fetch.group(2) : fetch.group(1);
			fetches = switch (amount) {
				case "two" -> 2;
				case "three" -> 3;
				default -> 1;
			};
		}
		boolean tutor = card.hasRole("Tutor") && fetches == 0 && !card.isLand();
		int[] makes = new int[COLORS.length()];
		if (produces > 0) {
			boolean fetchland = card.isLand() && text.contains("sacrifice") && text.contains("search your library for");
			if (fetchland) {
				// A fetch land finds whichever land the deck needs, so it counts for each colour of the deck's identity.
				for (int i = 0; i < makes.length; i++) {
					makes[i] = identity.isBlank() || identity.indexOf(COLORS.charAt(i)) >= 0 ? 1 : 0;
				}
			}
			else {
				for (String color : ManaSources.colorsOf(card, identity)) {
					int index = COLORS.indexOf(color);
					if (index >= 0) {
						makes[index] = 1;
					}
				}
			}
		}
		int[] pips = new int[COLORS.length()];
		Matcher symbols = PIP.matcher(card.manaCost());
		while (symbols.find()) {
			pips[COLORS.indexOf(symbols.group(1))]++;
		}
		boolean producesAtAll = card.isLand() || produces > 0;
		return new Sim(key(card.name()), card.manaValue(), card.isLand(), producesAtAll ? Math.max(produces, card.isLand() ? 1 : 0) : 0,
				"Creature".equals(card.primaryType()), fetches, tutor, pips, makes, card.isLand() ? tap(text) : Tap.UNTAPPED);
	}

	/** How a land enters, read from its rules text. Shock lands and others that let you pay to enter untapped count as untapped. */
	static Tap tap(String text) {
		boolean tapped = text.contains("enters tapped") || text.contains("enters the battlefield tapped");
		if (!tapped) {
			return Tap.UNTAPPED;
		}
		if (text.contains("pay 2 life") || text.contains("you may pay")) {
			return Tap.UNTAPPED;
		}
		if (text.contains("two or fewer other lands")) {
			return Tap.LATE;
		}
		if (text.contains("unless")) {
			return Tap.EARLY;
		}
		return Tap.TAPPED;
	}

	/** How much mana the first "add" clause makes: its symbols, up to the first "or". A clause with none is one mana of any colour. */
	private static int produced(String text) {
		Matcher clause = ADD_CLAUSE.matcher(text);
		if (!clause.find()) {
			return 0;
		}
		String first = clause.group(1).split("\\bor\\b")[0];
		Matcher symbols = MANA_SYMBOL.matcher(first);
		int count = 0;
		while (symbols.find()) {
			count++;
		}
		return count == 0 ? 1 : count;
	}

	private static String key(String name) {
		String front = name.contains(" // ") ? name.substring(0, name.indexOf(" // ")) : name;
		return NameNormalizer.normalize(front);
	}

	/** The share of games where the thing happened by this turn. */
	private static double share(int[] firstTurns, int byTurn) {
		int hits = 0;
		for (int turn : firstTurns) {
			if (turn > 0 && turn <= byTurn) {
				hits++;
			}
		}
		return round((double) hits / firstTurns.length, 3);
	}

	/** The turn by which half the games had it, or null when fewer than half ever did. */
	private static Double median(int[] firstTurns) {
		int[] sorted = Arrays.stream(firstTurns).map(turn -> turn == 0 ? Integer.MAX_VALUE : turn).sorted().toArray();
		int middle = sorted[sorted.length / 2];
		return middle == Integer.MAX_VALUE ? null : (double) middle;
	}

	private static double round(double value, int places) {
		double scale = Math.pow(10, places);
		return Math.round(value * scale) / scale;
	}
}
