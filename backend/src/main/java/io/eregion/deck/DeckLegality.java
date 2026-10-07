package io.eregion.deck;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The Commander rules that can be checked from card data: 100 cards, a commander or a valid pair, copies
 * allowed, everything inside the commander's colors, and no card that is banned or not legal in Commander.
 *
 * The deck page in the web app applies the same rules while a deck is edited. Both are tested against the
 * same cases in shared/legality-cases.json, so the wording and the results cannot drift apart.
 */
public final class DeckLegality {

	/** One card on the main or commander board of a version. */
	public record Line(UUID cardId, String name, String board, int quantity, String colorIdentity, String typeLine, String oracleText,
			String commanderLegality) {
	}

	public static final int DECK_SIZE = 100;
	private static final int UNLIMITED = Integer.MAX_VALUE;

	private static final Pattern ANY_NUMBER = Pattern.compile("a deck can have any number of cards named", Pattern.CASE_INSENSITIVE);
	private static final Pattern UP_TO = Pattern.compile("a deck can have up to (\\w+) cards named", Pattern.CASE_INSENSITIVE);
	private static final Pattern CAN_BE_COMMANDER = Pattern.compile("can be your commander", Pattern.CASE_INSENSITIVE);
	private static final Pattern PARTNER_WITH = Pattern.compile("partner with ([^\\n(]+)", Pattern.CASE_INSENSITIVE);
	private static final Pattern PARTNER_VARIANT = Pattern.compile("^partner\\s*[—–-]\\s*([^\\n(]+)", Pattern.CASE_INSENSITIVE | Pattern.MULTILINE);
	private static final Pattern PLAIN_PARTNER = Pattern.compile("^partner\\b(?!\\s+with)(?!\\s*[—–-])", Pattern.CASE_INSENSITIVE | Pattern.MULTILINE);
	private static final Pattern FRIENDS = Pattern.compile("friends forever", Pattern.CASE_INSENSITIVE);
	private static final Pattern CHOOSE_BACKGROUND = Pattern.compile("choose a background", Pattern.CASE_INSENSITIVE);
	private static final Pattern DOCTORS_COMPANION = Pattern.compile("doctor's companion", Pattern.CASE_INSENSITIVE);

	private static final List<String> NUMBER_WORDS = List.of("zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
			"ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty");

	private DeckLegality() {
	}

	/** What is wrong with the deck, in plain words. Empty when it is legal. */
	public static List<String> issues(List<Line> lines) {
		List<String> issues = new ArrayList<>();
		List<Line> counted = lines.stream().filter(line -> line.board().equals("commander") || line.board().equals("main")).toList();
		List<Line> commanders = counted.stream().filter(line -> line.board().equals("commander")).toList();

		int total = counted.stream().mapToInt(Line::quantity).sum();
		if (total != DECK_SIZE) {
			int gap = Math.abs(DECK_SIZE - total);
			issues.add(gap + (gap == 1 ? " card " : " cards ") + (total < DECK_SIZE ? "short of " : "over ") + DECK_SIZE + ".");
		}

		int commanderCount = commanders.stream().mapToInt(Line::quantity).sum();
		if (commanderCount == 0) {
			issues.add("No commander chosen.");
		}
		else if (commanderCount > 2 || commanders.size() > 2) {
			issues.add("A deck has at most two commanders, and only as a valid pair.");
		}
		else if (commanderCount == 2 && commanders.size() == 2 && !pairs(commanders.get(0), commanders.get(1))) {
			issues.add(commanders.get(0).name() + " and " + commanders.get(1).name()
					+ " cannot be commanders together. Pairs need partner, friends forever, a background or a Doctor and its companion.");
		}
		List<String> notLeaders = names(commanders.stream().filter(line -> !canLead(line)));
		if (!notLeaders.isEmpty()) {
			issues.add(list(notLeaders) + " cannot be a commander.");
		}

		Map<UUID, Integer> copies = new HashMap<>();
		Map<UUID, Line> byCard = new HashMap<>();
		for (Line line : counted) {
			copies.merge(line.cardId(), line.quantity(), Integer::sum);
			byCard.putIfAbsent(line.cardId(), line);
		}
		List<String> single = new ArrayList<>();
		List<String> limited = new ArrayList<>();
		copies.forEach((card, count) -> {
			Line line = byCard.get(card);
			int max = copyLimit(line);
			if (count > max) {
				if (max == 1) {
					single.add(line.name() + " (" + count + ")");
				}
				else {
					limited.add(line.name() + " (" + count + ", at most " + max + ")");
				}
			}
		});
		single.sort(String::compareTo);
		limited.sort(String::compareTo);
		if (!single.isEmpty()) {
			issues.add("Only one copy of each card is allowed: " + list(single) + ".");
		}
		if (!limited.isEmpty()) {
			issues.add("More copies than allowed: " + list(limited) + ".");
		}

		if (!commanders.isEmpty()) {
			Set<Character> identity = new LinkedHashSet<>();
			commanders.forEach(line -> line.colorIdentity().chars().forEach(c -> identity.add((char) c)));
			List<String> outside = names(counted.stream()
					.filter(line -> !line.board().equals("commander"))
					.filter(line -> line.colorIdentity().chars().anyMatch(c -> !identity.contains((char) c))));
			if (!outside.isEmpty()) {
				issues.add("Outside the commander's colors: " + list(outside) + ".");
			}
		}

		List<String> banned = names(counted.stream().filter(line -> "banned".equals(line.commanderLegality())));
		if (!banned.isEmpty()) {
			issues.add("Banned in Commander: " + list(banned) + ".");
		}
		List<String> notLegal = names(counted.stream().filter(line -> "not_legal".equals(line.commanderLegality())));
		if (!notLegal.isEmpty()) {
			issues.add("Not legal in Commander: " + list(notLegal) + ".");
		}
		return issues;
	}

	/** The colors of the commander or commanders, in game order, for showing as symbols. */
	public static String identity(List<Line> lines) {
		Set<Character> found = new LinkedHashSet<>();
		lines.stream().filter(line -> line.board().equals("commander")).forEach(line -> line.colorIdentity().chars().forEach(c -> found.add((char) c)));
		StringBuilder ordered = new StringBuilder();
		for (char color : "WUBRG".toCharArray()) {
			if (found.contains(color)) {
				ordered.append(color);
			}
		}
		return ordered.toString();
	}

	/** How many copies of a card a deck may hold: one, unless it is a basic land or its text says otherwise. */
	static int copyLimit(Line line) {
		if (line.typeLine().contains("Basic") || ANY_NUMBER.matcher(line.oracleText()).find()) {
			return UNLIMITED;
		}
		Matcher upTo = UP_TO.matcher(line.oracleText());
		if (upTo.find()) {
			int number = NUMBER_WORDS.indexOf(upTo.group(1).toLowerCase(Locale.ROOT));
			return number > 0 ? number : 1;
		}
		return 1;
	}

	private static boolean canLead(Line line) {
		return (line.typeLine().contains("Legendary") && line.typeLine().contains("Creature"))
				|| CAN_BE_COMMANDER.matcher(line.oracleText()).find()
				|| line.typeLine().contains("Background");
	}

	/** Whether two commanders may lead one deck: partners, partners with each other, friends forever, a background, or a Doctor. */
	static boolean pairs(Line a, Line b) {
		String withA = partnerWith(a.oracleText());
		String withB = partnerWith(b.oracleText());
		if (withA != null || withB != null) {
			return (withA == null || sameName(withA, b.name())) && (withB == null || sameName(withB, a.name()));
		}
		String variantA = variant(a.oracleText());
		String variantB = variant(b.oracleText());
		if (variantA != null || variantB != null) {
			return variantA != null && variantA.equals(variantB);
		}
		if (PLAIN_PARTNER.matcher(a.oracleText()).find() && PLAIN_PARTNER.matcher(b.oracleText()).find()) {
			return true;
		}
		if (FRIENDS.matcher(a.oracleText()).find() && FRIENDS.matcher(b.oracleText()).find()) {
			return true;
		}
		if ((CHOOSE_BACKGROUND.matcher(a.oracleText()).find() && b.typeLine().contains("Background"))
				|| (CHOOSE_BACKGROUND.matcher(b.oracleText()).find() && a.typeLine().contains("Background"))) {
			return true;
		}
		return (DOCTORS_COMPANION.matcher(a.oracleText()).find() && b.typeLine().contains("Doctor"))
				|| (DOCTORS_COMPANION.matcher(b.oracleText()).find() && a.typeLine().contains("Doctor"));
	}

	private static String partnerWith(String oracle) {
		Matcher matcher = PARTNER_WITH.matcher(oracle);
		return matcher.find() ? matcher.group(1).trim() : null;
	}

	private static String variant(String oracle) {
		Matcher matcher = PARTNER_VARIANT.matcher(oracle);
		return matcher.find() ? matcher.group(1).trim().toLowerCase(Locale.ROOT) : null;
	}

	private static boolean sameName(String wanted, String name) {
		String front = name.split(" // ")[0];
		return wanted.equalsIgnoreCase(name.trim()) || wanted.equalsIgnoreCase(front.trim());
	}

	private static List<String> names(java.util.stream.Stream<Line> lines) {
		return lines.map(Line::name).distinct().sorted(Comparator.naturalOrder()).toList();
	}

	private static String list(List<String> names) {
		String shown = String.join(", ", names.stream().limit(4).toList());
		return names.size() > 4 ? shown + " and " + (names.size() - 4) + " more" : shown;
	}
}
