package io.eregion.deck;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import io.eregion.deck.DeckDtos.DeckCardLine;
import io.eregion.deck.DeckDtos.DeckStats;

/**
 * Pure functions over a version's card list. Only cards on counted boards
 * (commander and main) contribute. The average mana value and the curve leave
 * lands out, like Moxfield's "without lands" figure.
 */
public final class StatsCalculator {

	/** Curve buckets run 0 to 6, with the last bucket meaning "6 or more". */
	public static final int CURVE_BUCKETS = 7;

	private static final List<String> TYPE_ORDER = List.of("Creature", "Planeswalker", "Instant", "Sorcery",
			"Artifact", "Enchantment", "Land", "Battle", "Other");

	public static final String UNCATEGORIZED = "Uncategorized";

	/** The role names in display order, read once from the mapping file. */
	private static final java.util.function.Supplier<List<String>> ROLE_ORDER = new java.util.function.Supplier<>() {
		private List<String> names;

		@Override
		public synchronized List<String> get() {
			if (names == null) {
				names = io.eregion.card.FunctionalTagMapping.load().names();
			}
			return names;
		}
	};

	private StatsCalculator() {
	}

	public static DeckStats compute(List<DeckCardLine> lines) {
		int total = 0;
		int lands = 0;
		int owned = 0;
		int nonLand = 0;
		double manaValueSum = 0;
		double price = 0;
		int[] curve = new int[CURVE_BUCKETS];
		Map<String, Integer> types = new LinkedHashMap<>();
		TYPE_ORDER.forEach(type -> types.put(type, 0));
		Map<String, Integer> roles = new LinkedHashMap<>();

		for (DeckCardLine line : lines) {
			if (!Board.isCounted(line.board())) {
				continue;
			}
			int quantity = line.quantity();
			total += quantity;
			price += (line.priceUsd() == null ? 0 : line.priceUsd()) * quantity;
			owned += Math.min(quantity, line.owned());
			types.merge(line.primaryType(), quantity, Integer::sum);

			if ("Land".equals(line.primaryType())) {
				lands += quantity;
			}
			else {
				roles.merge(line.role() == null ? UNCATEGORIZED : line.role(), quantity, Integer::sum);
				nonLand += quantity;
				manaValueSum += line.manaValue() * quantity;
				curve[Math.min((int) Math.floor(line.manaValue()), CURVE_BUCKETS - 1)] += quantity;
			}
		}

		types.values().removeIf(count -> count == 0);
		double average = nonLand == 0 ? 0 : round2(manaValueSum / nonLand);
		List<Integer> curveList = new ArrayList<>(CURVE_BUCKETS);
		for (int count : curve) {
			curveList.add(count);
		}
		return new DeckStats(total, average, List.copyOf(curveList), types, lands, owned, total - owned, round2(price), orderedRoles(roles));
	}

	/** Roles in the order they are shown: as the mapping lists them, then any others, with the uncategorized last. */
	private static Map<String, Integer> orderedRoles(Map<String, Integer> counted) {
		Map<String, Integer> ordered = new LinkedHashMap<>();
		for (String role : ROLE_ORDER.get()) {
			if (counted.containsKey(role)) {
				ordered.put(role, counted.get(role));
			}
		}
		counted.forEach((role, count) -> {
			if (!UNCATEGORIZED.equals(role)) {
				ordered.putIfAbsent(role, count);
			}
		});
		if (counted.containsKey(UNCATEGORIZED)) {
			ordered.put(UNCATEGORIZED, counted.get(UNCATEGORIZED));
		}
		return ordered;
	}

	static double round2(double value) {
		return Math.round(value * 100.0) / 100.0;
	}
}
