package io.eregion.analysis;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import io.eregion.analysis.AnalysisDtos.ComboInfo;
import io.eregion.analysis.AnalysisDtos.Combos;
import io.eregion.card.NameNormalizer;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Reads a Commander Spellbook {@code find-my-combos} answer. Combos that need a card the deck does not name (a template such as "any
 * creature") are dropped, since whether the deck has it cannot be checked, as are combos that are not legal in Commander.
 */
final class SpellbookParser {

	static final int MAX_ONE_AWAY = 12;

	private static final JsonMapper JSON = JsonMapper.builder().build();

	private SpellbookParser() {
	}

	/** @param deckNames the normalized names of the cards in the deck, to work out what an almost-complete combo lacks */
	static Combos parse(String body, Set<String> deckNames) {
		JsonNode results = JSON.readTree(body).path("results");
		List<ComboInfo> included = new ArrayList<>();
		for (JsonNode combo : results.path("included")) {
			ComboInfo info = read(combo, deckNames);
			if (info != null) {
				included.add(info);
			}
		}
		List<ComboInfo> oneAway = new ArrayList<>();
		for (JsonNode combo : results.path("almostIncluded")) {
			ComboInfo info = read(combo, deckNames);
			if (info != null && info.missing().size() == 1) {
				oneAway.add(info);
			}
		}
		Comparator<ComboInfo> popular = Comparator.comparingInt(ComboInfo::popularity).reversed();
		included.sort(popular);
		oneAway.sort(popular);
		return new Combos(true, included, oneAway.stream().limit(MAX_ONE_AWAY).toList());
	}

	private static ComboInfo read(JsonNode combo, Set<String> deckNames) {
		if (!"OK".equals(combo.path("status").asString("OK")) || !combo.path("legalities").path("commander").asBoolean(true)
				|| combo.path("requires").size() > 0) {
			return null;
		}
		List<String> cards = new ArrayList<>();
		List<String> missing = new ArrayList<>();
		Set<String> seen = new HashSet<>();
		for (JsonNode use : combo.path("uses")) {
			String name = use.path("card").path("name").asString("");
			if (name.isBlank() || !seen.add(name)) {
				continue;
			}
			cards.add(name);
			if (!deckNames.contains(NameNormalizer.normalize(name)) && !deckNames.contains(NameNormalizer.normalize(BracketLists.frontFace(name)))) {
				missing.add(name);
			}
		}
		if (cards.isEmpty()) {
			return null;
		}
		List<String> produces = new ArrayList<>();
		combo.path("produces").forEach(item -> produces.add(item.path("feature").path("name").asString("")));
		JsonNode value = combo.path("manaValueNeeded");
		return new ComboInfo(
				combo.path("id").asString(""),
				cards,
				missing,
				produces,
				combo.path("description").asString(""),
				combo.path("manaNeeded").asString(""),
				value.isNumber() ? value.asInt() : null,
				combo.path("bracketTag").asString(""),
				combo.path("popularity").asInt(0));
	}
}
