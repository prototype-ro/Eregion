package io.eregion.analysis;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import io.eregion.analysis.AnalysisDtos.Engine;
import io.eregion.analysis.AnalysisDtos.Theme;
import tools.jackson.databind.json.JsonMapper;

/**
 * Names what the deck is trying to do. Every non-land card is scored against each theme in {@code deck-themes.json}; a theme's score is
 * the share of the deck's non-land cards that lean on it. The top theme is the label. When the second is close it is called out as a
 * close call rather than stating a label with false certainty, and a deck with no theme above the floor is called Goodstuff.
 */
public final class EngineClassifier {

	public static final String RESOURCE = "/deck-themes.json";
	public static final String NO_THEME = "Goodstuff";

	/** A theme below this many percent is noise. */
	static final double MIN_SCORE = 8.0;
	/** The second theme within this fraction of the first makes the label a close call. */
	static final double NEAR_TIE = 0.85;
	static final int TOP_THEMES = 4;
	static final int SIGNATURE_CARDS = 5;
	/** Creature types: a tribe needs this share of the creatures and at least this many of them. */
	static final double TRIBE_SHARE = 0.30;
	static final int TRIBE_MIN = 6;

	@JsonIgnoreProperties(ignoreUnknown = true)
	record PatternRule(String pattern, double weight) {
	}

	@JsonIgnoreProperties(ignoreUnknown = true)
	record ThemeRule(String name, String description, List<PatternRule> patterns, Map<String, Double> roles, Map<String, Double> types) {
	}

	@JsonIgnoreProperties(ignoreUnknown = true)
	private record Config(List<ThemeRule> themes) {
	}

	private record Compiled(ThemeRule rule, List<Pattern> patterns) {
	}

	private final List<Compiled> themes;

	public EngineClassifier(List<ThemeRule> rules) {
		this.themes = rules.stream()
				.map(rule -> new Compiled(rule,
						(rule.patterns() == null ? List.<PatternRule>of() : rule.patterns()).stream().map(p -> Pattern.compile(p.pattern())).toList()))
				.toList();
	}

	public static EngineClassifier load() {
		try (InputStream in = EngineClassifier.class.getResourceAsStream(RESOURCE)) {
			if (in == null) {
				throw new IllegalStateException(RESOURCE + " is missing");
			}
			return new EngineClassifier(JsonMapper.builder().build().readValue(in, Config.class).themes());
		}
		catch (IOException | RuntimeException ex) {
			throw new IllegalStateException("Could not read " + RESOURCE, ex);
		}
	}

	/** Null when there are too few spells to say anything. */
	public Engine classify(List<AnalysisCard> cards) {
		List<AnalysisCard> spells = cards.stream().filter(card -> card.counted() && !card.isLand()).toList();
		int total = spells.stream().mapToInt(AnalysisCard::quantity).sum();
		if (total < 10) {
			return null;
		}
		List<Theme> scored = new ArrayList<>();
		for (Compiled theme : themes) {
			double sum = 0;
			Map<String, Double> perCard = new HashMap<>();
			for (AnalysisCard card : spells) {
				double lean = lean(theme, card);
				if (lean > 0) {
					sum += lean * card.quantity();
					perCard.merge(card.name(), lean, Math::max);
				}
			}
			double score = Math.round(sum / total * 1000.0) / 10.0;
			List<String> signature = perCard.entrySet().stream()
					.sorted(Map.Entry.<String, Double>comparingByValue().reversed().thenComparing(Map.Entry.comparingByKey()))
					.limit(SIGNATURE_CARDS).map(Map.Entry::getKey).toList();
			scored.add(new Theme(theme.rule().name(), score, signature));
		}
		scored.sort(Comparator.comparingDouble(Theme::score).reversed().thenComparing(Theme::name));
		List<Theme> top = scored.stream().limit(TOP_THEMES).toList();

		String tribe = tribe(spells);
		Theme first = top.get(0);
		if (first.score() < MIN_SCORE) {
			return new Engine(NO_THEME, "No single plan stands out. The deck is a pile of good cards.", 0, null, false, top, tribe, List.of());
		}
		Theme second = top.get(1);
		boolean ambiguous = second.score() >= MIN_SCORE && second.score() >= first.score() * NEAR_TIE;
		double topTotal = top.stream().mapToDouble(Theme::score).sum();
		String description = themes.stream().filter(t -> t.rule().name().equals(first.name())).findFirst().map(t -> t.rule().description()).orElse("");
		return new Engine(first.name(), description, Math.round(first.score() / topTotal * 100.0) / 100.0,
				second.score() >= MIN_SCORE ? second.name() : null, ambiguous, top, tribe, first.cards());
	}

	/** How strongly one card leans on a theme, from 0 to 1. */
	private static double lean(Compiled theme, AnalysisCard card) {
		String text = card.oracleText().toLowerCase(Locale.ROOT).replace('−', '-');
		double lean = 0;
		List<PatternRule> rules = theme.rule().patterns() == null ? List.of() : theme.rule().patterns();
		for (int i = 0; i < rules.size(); i++) {
			if (theme.patterns().get(i).matcher(text).find()) {
				lean += rules.get(i).weight();
			}
		}
		if (card.role() != null && theme.rule().roles() != null) {
			lean += theme.rule().roles().getOrDefault(card.role(), 0.0);
		}
		if (theme.rule().types() != null) {
			lean += theme.rule().types().getOrDefault(card.primaryType(), 0.0);
		}
		return Math.min(1.0, lean);
	}

	/** The creature type most creatures share, when enough of them do. */
	static String tribe(List<AnalysisCard> spells) {
		Map<String, Integer> counts = new HashMap<>();
		int creatures = 0;
		for (AnalysisCard card : spells) {
			if (!"Creature".equals(card.primaryType())) {
				continue;
			}
			creatures += card.quantity();
			int dash = Math.max(card.typeLine().indexOf('—'), card.typeLine().indexOf(" - "));
			if (dash < 0) {
				continue;
			}
			for (String type : card.typeLine().substring(dash + (card.typeLine().charAt(dash) == '—' ? 1 : 3)).trim().split("\\s+")) {
				if (!type.isBlank()) {
					counts.merge(type, card.quantity(), Integer::sum);
				}
			}
		}
		if (creatures == 0) {
			return null;
		}
		int total = creatures;
		return counts.entrySet().stream()
				.max(Map.Entry.<String, Integer>comparingByValue().thenComparing(Map.Entry.comparingByKey()))
				.filter(entry -> entry.getValue() >= TRIBE_MIN && entry.getValue() >= total * TRIBE_SHARE)
				.map(Map.Entry::getKey)
				.orElse(null);
	}
}
