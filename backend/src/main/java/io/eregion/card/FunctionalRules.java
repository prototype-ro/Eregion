package io.eregion.card;

import java.io.IOException;
import java.io.InputStream;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import tools.jackson.databind.json.JsonMapper;

/**
 * A guess at what a card does, from its rules text, for cards nobody has tagged on Scryfall. Plain ordered patterns read from
 * {@code functional-rules.json}: no service, no library. Everything here is lower confidence than a community tag by design.
 */
public final class FunctionalRules {

	public static final String RESOURCE = "/functional-rules.json";
	public static final String SOURCE = "regex";

	@JsonIgnoreProperties(ignoreUnknown = true)
	public record Rule(String category, String pattern, double confidence) {
	}

	@JsonIgnoreProperties(ignoreUnknown = true)
	private record Config(List<Rule> rules) {
	}

	private record Compiled(String category, Pattern pattern, double confidence) {
	}

	private final List<Compiled> rules;

	public FunctionalRules(List<Rule> rules) {
		this.rules = rules.stream()
				.map(rule -> new Compiled(rule.category(), Pattern.compile(rule.pattern()), rule.confidence()))
				.toList();
	}

	public static FunctionalRules load() {
		try (InputStream in = FunctionalRules.class.getResourceAsStream(RESOURCE)) {
			if (in == null) {
				throw new IllegalStateException(RESOURCE + " is missing");
			}
			return new FunctionalRules(JsonMapper.builder().build().readValue(in, Config.class).rules());
		}
		catch (IOException | RuntimeException ex) {
			throw new IllegalStateException("Could not read " + RESOURCE, ex);
		}
	}

	/**
	 * The categories a card's text matches and how confident each is, the highest confidence kept when several patterns
	 * match one category. Empty when nothing matches, which means the card stays uncategorized.
	 */
	public Map<String, Double> match(String oracleText) {
		Map<String, Double> found = new LinkedHashMap<>();
		if (oracleText == null || oracleText.isBlank()) {
			return found;
		}
		String text = oracleText.toLowerCase(Locale.ROOT).replace('−', '-');
		for (Compiled rule : rules) {
			if (rule.pattern().matcher(text).find()) {
				found.merge(rule.category(), rule.confidence(), Math::max);
			}
		}
		return found;
	}
}
