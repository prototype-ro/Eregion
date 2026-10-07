package io.eregion.generate;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Predicate;

/**
 * Chooses which cards fill each slot of the deck. It works on card names only, so it can be tested
 * without any card data. Pools are filled in order, best cards first, and a card is used once.
 */
public final class DeckPlanner {

	/** A job in the deck, its target size, and candidates ranked best first. */
	public record Pool(String tag, int target, List<String> names) {
	}

	public record Pick(String name, String tag) {
	}

	public record Plan(List<Pick> picks, List<String> notes) {
	}

	private DeckPlanner() {
	}

	/**
	 * @param pools    the slots to fill, in priority order
	 * @param filler   extra ranked candidates used when the pools fall short of nonLandTarget
	 * @param allowed  which names may be used at all (for example only cards the user owns)
	 * @param excluded names that can never be picked, such as the commander
	 */
	public static Plan plan(List<Pool> pools, List<String> filler, int nonLandTarget, Predicate<String> allowed,
			Set<String> excluded) {
		Set<String> used = new HashSet<>();
		excluded.forEach(name -> used.add(key(name)));

		List<Pick> picks = new ArrayList<>();
		List<String> notes = new ArrayList<>();

		for (Pool pool : pools) {
			int taken = take(pool.names(), pool.target(), pool.tag(), allowed, used, picks);
			if (taken < pool.target()) {
				notes.add(pool.tag() + ": found " + taken + " of " + pool.target() + " cards.");
			}
		}

		int missing = nonLandTarget - picks.size();
		if (missing > 0) {
			int taken = take(filler, missing, "Staples", allowed, used, picks);
			if (taken < missing) {
				notes.add("The deck is " + (missing - taken) + " cards short of a full list. Add more by hand.");
			}
		}
		// Pools can add up to more than the target when themes are generous, so trim the tail.
		while (picks.size() > nonLandTarget) {
			picks.remove(picks.size() - 1);
		}
		return new Plan(List.copyOf(picks), List.copyOf(notes));
	}

	private static int take(List<String> names, int count, String tag, Predicate<String> allowed, Set<String> used,
			List<Pick> picks) {
		int taken = 0;
		for (String name : names) {
			if (taken >= count) {
				break;
			}
			if (!allowed.test(name) || !used.add(key(name))) {
				continue;
			}
			picks.add(new Pick(name, tag));
			taken++;
		}
		return taken;
	}

	/**
	 * Splits a theme budget across a playstyle's themes by weight, so each theme gets a share of
	 * the slots and the shares add up exactly to the total.
	 */
	public static Map<Playstyle.Theme, Integer> allocate(List<Playstyle.Theme> themes, int total) {
		Map<Playstyle.Theme, Integer> shares = new LinkedHashMap<>();
		int weightSum = themes.stream().mapToInt(Playstyle.Theme::weight).sum();
		if (themes.isEmpty() || weightSum == 0) {
			return shares;
		}
		int assigned = 0;
		for (Playstyle.Theme theme : themes) {
			int share = total * theme.weight() / weightSum;
			shares.put(theme, share);
			assigned += share;
		}
		// Hand out what rounding left over, heaviest themes first.
		List<Playstyle.Theme> byWeight = new ArrayList<>(themes);
		byWeight.sort((a, b) -> Integer.compare(b.weight(), a.weight()));
		for (int i = 0; assigned < total; i = (i + 1) % byWeight.size()) {
			shares.merge(byWeight.get(i), 1, Integer::sum);
			assigned++;
		}
		return shares;
	}

	private static String key(String name) {
		return name.toLowerCase(Locale.ROOT);
	}
}
