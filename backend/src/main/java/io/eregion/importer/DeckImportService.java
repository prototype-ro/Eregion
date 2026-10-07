package io.eregion.importer;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.stereotype.Service;

import io.eregion.common.ApiException;
import io.eregion.importer.DeckSite.Source;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Turns a link to a deck on another site into a decklist the list import already understands. */
@Service
public class DeckImportService {

	/** name is the deck's name on its own site, text is the list. */
	public record ImportedDeck(String name, String site, String text) {
	}

	private static final String SHARE_HELP = "Copy its text export and paste the list here instead.";

	private final DeckFetcher fetcher;
	private final JsonMapper mapper = JsonMapper.builder().build();

	public DeckImportService(DeckFetcher fetcher) {
		this.fetcher = fetcher;
	}

	public ImportedDeck fetch(String link) {
		Source source = DeckSite.parse(link).orElseThrow(() -> ApiException.badRequest(
				"That is not a link to a deck I can read. Links from Archidekt, Scryfall, TappedOut and MTGGoldfish work. Or paste the list itself."));
		if (source.site() == DeckSite.MOXFIELD) {
			throw ApiException.badRequest("Moxfield does not let other sites read its decks. On Moxfield open the deck, choose Export, then copy the list and paste it here.");
		}
		DeckFetcher.Response response = fetcher.get(source.apiUri(), source.site().accept());
		String where = source.site().label();
		switch (response.status()) {
			case 200 -> {
			}
			case 404 -> throw new ApiException(org.springframework.http.HttpStatus.NOT_FOUND, "That deck was not found on " + where + ". It may be private, or the link may be wrong.");
			case 0 -> throw new ApiException(org.springframework.http.HttpStatus.BAD_GATEWAY, where + " did not answer in time. Try again in a moment.");
			case 413 -> throw ApiException.badRequest("That deck is far bigger than a Commander deck.");
			default -> throw new ApiException(org.springframework.http.HttpStatus.BAD_GATEWAY,
					where + " would not let us read that deck, which usually means it blocks automated requests. " + SHARE_HELP);
		}
		return source.site() == DeckSite.ARCHIDEKT ? fromArchidekt(response.body()) : new ImportedDeck(where + " deck", where, response.body().strip());
	}

	/** Archidekt keeps each card with its categories. Commander, and the categories that are not part of the deck, become sections. */
	ImportedDeck fromArchidekt(String json) {
		JsonNode root;
		try {
			root = mapper.readTree(json);
		}
		catch (RuntimeException ex) {
			throw new ApiException(org.springframework.http.HttpStatus.BAD_GATEWAY, "Archidekt answered with something unreadable. " + SHARE_HELP);
		}
		Set<String> outside = new java.util.HashSet<>();
		for (JsonNode category : root.path("categories")) {
			if (!category.path("includedInDeck").asBoolean(true)) {
				outside.add(category.path("name").asString(""));
			}
		}
		Map<String, List<String>> sections = new LinkedHashMap<>();
		sections.put("Commander", new ArrayList<>());
		sections.put("Deck", new ArrayList<>());
		sections.put("Maybeboard", new ArrayList<>());
		for (JsonNode entry : root.path("cards")) {
			String name = entry.path("card").path("oracleCard").path("name").asString("");
			int quantity = entry.path("quantity").asInt(1);
			if (name.isBlank() || quantity < 1) {
				continue;
			}
			List<String> categories = new ArrayList<>();
			entry.path("categories").forEach(category -> categories.add(category.asString("")));
			String section = categories.contains("Commander") ? "Commander"
					: categories.stream().anyMatch(outside::contains) ? "Maybeboard" : "Deck";
			String edition = entry.path("card").path("edition").path("editioncode").asString("");
			String number = entry.path("card").path("collectorNumber").asString("");
			String printing = edition.isBlank() ? "" : " (" + edition.toUpperCase() + ")" + (number.isBlank() ? "" : " " + number);
			sections.get(section).add(quantity + " " + name + printing);
		}
		StringBuilder text = new StringBuilder();
		sections.forEach((title, lines) -> {
			if (!lines.isEmpty()) {
				text.append(title).append('\n').append(String.join("\n", lines)).append("\n\n");
			}
		});
		if (text.isEmpty()) {
			throw ApiException.badRequest("That Archidekt deck has no cards.");
		}
		String name = root.path("name").asString("Archidekt deck");
		return new ImportedDeck(name.length() > 80 ? name.substring(0, 80) : name, "Archidekt", text.toString().strip());
	}
}
