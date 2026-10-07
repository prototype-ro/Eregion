package io.eregion.deck;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * The Commander rules that can be checked from card data: 100 cards, a commander (or a partner pair),
 * one copy of each card and everything inside the commander's colors. The banned list is not checked.
 * The deck page in the web app applies the same rules while a deck is edited, so keep them in step.
 */
public final class DeckLegality {

	/** One card on the main or commander board of a version. */
	public record Line(UUID cardId, String name, String board, int quantity, String colorIdentity, String typeLine, String oracleText) {
	}

	public static final int DECK_SIZE = 100;

	private static final Pattern ANY_NUMBER = Pattern.compile("a deck can have any number of cards named", Pattern.CASE_INSENSITIVE);
	private static final Pattern CAN_BE_COMMANDER = Pattern.compile("can be your commander", Pattern.CASE_INSENSITIVE);
	private static final Pattern PAIRS = Pattern.compile("partner|friends forever|choose a background|doctor's companion", Pattern.CASE_INSENSITIVE);

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
		else if (commanderCount > 2 || (commanderCount == 2 && !commanders.stream().allMatch(DeckLegality::canPair))) {
			issues.add("Only one commander is allowed, unless both have partner or a background.");
		}
		List<String> notLeaders = commanders.stream().filter(line -> !canLead(line)).map(Line::name).toList();
		if (!notLeaders.isEmpty()) {
			issues.add(list(notLeaders) + " cannot be a commander.");
		}

		Map<UUID, Integer> copies = new HashMap<>();
		Map<UUID, Line> byCard = new HashMap<>();
		for (Line line : counted) {
			copies.merge(line.cardId(), line.quantity(), Integer::sum);
			byCard.putIfAbsent(line.cardId(), line);
		}
		List<String> repeated = new ArrayList<>();
		copies.forEach((card, count) -> {
			Line line = byCard.get(card);
			if (count > 1 && !line.typeLine().contains("Basic") && !ANY_NUMBER.matcher(line.oracleText()).find()) {
				repeated.add(line.name() + " (" + count + ")");
			}
		});
		repeated.sort(String::compareTo);
		if (!repeated.isEmpty()) {
			issues.add("Only one copy of each card is allowed: " + list(repeated) + ".");
		}

		if (!commanders.isEmpty()) {
			Set<Character> identity = new LinkedHashSet<>();
			commanders.forEach(line -> line.colorIdentity().chars().forEach(c -> identity.add((char) c)));
			List<String> outside = counted.stream()
					.filter(line -> !line.board().equals("commander"))
					.filter(line -> line.colorIdentity().chars().anyMatch(c -> !identity.contains((char) c)))
					.map(Line::name)
					.toList();
			if (!outside.isEmpty()) {
				issues.add("Outside the commander's colors: " + list(outside) + ".");
			}
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

	private static boolean canLead(Line line) {
		return (line.typeLine().contains("Legendary") && line.typeLine().contains("Creature"))
				|| CAN_BE_COMMANDER.matcher(line.oracleText()).find()
				|| line.typeLine().contains("Background");
	}

	private static boolean canPair(Line line) {
		return PAIRS.matcher(line.oracleText()).find() || line.typeLine().contains("Background");
	}

	private static String list(List<String> names) {
		String shown = String.join(", ", names.stream().limit(4).toList());
		return names.size() > 4 ? shown + " and " + (names.size() - 4) + " more" : shown;
	}

	static String lower(String text) {
		return text.toLowerCase(Locale.ROOT);
	}
}
