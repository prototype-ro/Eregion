package io.eregion.importer;


import org.springframework.stereotype.Service;

import io.eregion.common.ApiException;
import io.eregion.importer.DeckSite.Source;

/** Turns a link to a deck on another site into a decklist the list import already understands. */
@Service
public class DeckImportService {

	/** name is the deck's name on its own site, text is the list. */
	public record ImportedDeck(String name, String site, String text) {
	}

	private static final String SHARE_HELP = "Copy its text export and paste the list here instead.";

	private final DeckFetcher fetcher;

	public DeckImportService(DeckFetcher fetcher) {
		this.fetcher = fetcher;
	}

	public ImportedDeck fetch(String link) {
		Source source = DeckSite.parse(link).orElseThrow(() -> ApiException.badRequest(
				"That is not a link to a deck I can read. Links from Scryfall, TappedOut and MTGGoldfish work. Or paste the list itself."));
		if (source.site() == DeckSite.MOXFIELD) {
			throw ApiException.badRequest("Moxfield does not let other sites read its decks. On Moxfield open the deck, choose Export, then copy the list and paste it here.");
		}
		if (source.site() == DeckSite.ARCHIDEKT) {
			throw ApiException.badRequest("Archidekt does not let other sites read its decks. On Archidekt open the deck, choose Export, then copy the list and paste it here.");
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
		return new ImportedDeck(where + " deck", where, response.body().strip());
	}
}
