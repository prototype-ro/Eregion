package io.eregion.generate;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Colored mana symbols and how basic lands are split to support them. */
public final class Mana {

	private static final Pattern SYMBOL = Pattern.compile("\\{([^}]+)}");
	public static final String COLORS = "WUBRG";

	private Mana() {
	}

	/**
	 * Counts colored mana symbols in a cost like {2}{W}{U/B}{G/P}. A hybrid symbol counts for each of
	 * its colors, and a Phyrexian symbol counts for its color. Generic and colorless symbols are ignored.
	 */
	public static Map<Character, Integer> pips(String manaCost) {
		Map<Character, Integer> counts = new LinkedHashMap<>();
		if (manaCost == null) {
			return counts;
		}
		Matcher matcher = SYMBOL.matcher(manaCost);
		while (matcher.find()) {
			for (String part : matcher.group(1).split("/")) {
				if (part.length() == 1 && COLORS.contains(part)) {
					counts.merge(part.charAt(0), 1, Integer::sum);
				}
			}
		}
		return counts;
	}

	/**
	 * Splits a number of basic lands across a commander's colors in proportion to how many symbols of
	 * each color the spells need. Every color gets at least one land when there is room, and the
	 * counts add up exactly to the total.
	 */
	public static Map<Character, Integer> splitBasics(int total, String identity, List<Map<Character, Integer>> spellPips) {
		Map<Character, Integer> result = new LinkedHashMap<>();
		if (total <= 0 || identity.isEmpty()) {
			return result;
		}
		Map<Character, Integer> weights = new LinkedHashMap<>();
		for (char color : identity.toCharArray()) {
			int symbols = 0;
			for (Map<Character, Integer> pips : spellPips) {
				symbols += pips.getOrDefault(color, 0);
			}
			weights.put(color, symbols);
		}
		int weightSum = weights.values().stream().mapToInt(Integer::intValue).sum();
		if (weightSum == 0) {
			weights.replaceAll((color, w) -> 1);
			weightSum = weights.size();
		}

		int floor = total >= identity.length() ? 1 : 0;
		int spare = total - floor * identity.length();
		int assigned = 0;
		for (Map.Entry<Character, Integer> entry : weights.entrySet()) {
			int extra = spare * entry.getValue() / weightSum;
			result.put(entry.getKey(), floor + extra);
			assigned += floor + extra;
		}
		// Leftover lands go to the colors with the most symbols.
		List<Character> byWeight = weights.entrySet().stream()
				.sorted((a, b) -> Integer.compare(b.getValue(), a.getValue()))
				.map(Map.Entry::getKey)
				.toList();
		for (int i = 0; assigned < total; i = (i + 1) % byWeight.size()) {
			result.merge(byWeight.get(i), 1, Integer::sum);
			assigned++;
		}
		return result;
	}
}
