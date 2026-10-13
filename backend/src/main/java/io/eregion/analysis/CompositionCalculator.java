package io.eregion.analysis;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import io.eregion.analysis.AnalysisDtos.Composition;

/**
 * What the deck is made of beyond the plain curve: the median mana value, how many coloured pips its spells ask for, and how much mana of
 * each colour its lands and other cards can make. Pure counting over the counted cards.
 */
public final class CompositionCalculator {

	private static final Pattern SYMBOL = Pattern.compile("\\{([^}]+)}");

	private CompositionCalculator() {
	}

	public static Composition compute(List<AnalysisCard> cards) {
		String identity = identityOf(cards);
		List<Double> values = new ArrayList<>();
		Map<String, Double> pips = new LinkedHashMap<>();
		Map<String, Integer> sources = new LinkedHashMap<>();
		for (String color : ManaSources.COLORS.split("")) {
			pips.put(color, 0.0);
			sources.put(color, 0);
		}
		sources.put("C", 0);

		for (AnalysisCard card : cards) {
			if (!card.counted()) {
				continue;
			}
			if (!card.isLand()) {
				for (int i = 0; i < card.quantity(); i++) {
					values.add(card.manaValue());
				}
				addPips(card, pips);
			}
			for (String color : ManaSources.colorsOf(card, identity)) {
				sources.merge(color, card.quantity(), Integer::sum);
			}
		}
		pips.replaceAll((color, count) -> round2(count));
		return new Composition(median(values), pips, sources);
	}

	/** The union of the colour identities of the commanders, or empty when there is no commander to read it from. */
	static String identityOf(List<AnalysisCard> cards) {
		StringBuilder identity = new StringBuilder();
		for (AnalysisCard card : cards) {
			if (card.isCommander()) {
				for (char color : card.colorIdentity().toCharArray()) {
					if (ManaSources.COLORS.indexOf(color) >= 0 && identity.indexOf(String.valueOf(color)) < 0) {
						identity.append(color);
					}
				}
			}
		}
		return identity.toString();
	}

	/** A symbol with several colours (a hybrid) splits its single pip between them. */
	private static void addPips(AnalysisCard card, Map<String, Double> pips) {
		Matcher matcher = SYMBOL.matcher(card.manaCost());
		while (matcher.find()) {
			List<String> colors = new ArrayList<>();
			for (String part : matcher.group(1).split("/")) {
				if (part.length() == 1 && ManaSources.COLORS.contains(part)) {
					colors.add(part);
				}
			}
			for (String color : colors) {
				pips.merge(color, card.quantity() * (1.0 / colors.size()), Double::sum);
			}
		}
	}

	static double median(List<Double> values) {
		if (values.isEmpty()) {
			return 0;
		}
		List<Double> sorted = new ArrayList<>(values);
		Collections.sort(sorted);
		int middle = sorted.size() / 2;
		return sorted.size() % 2 == 1 ? sorted.get(middle) : (sorted.get(middle - 1) + sorted.get(middle)) / 2.0;
	}

	static double round2(double value) {
		return Math.round(value * 100.0) / 100.0;
	}
}
