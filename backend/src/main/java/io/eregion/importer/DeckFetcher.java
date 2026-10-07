package io.eregion.importer;

import java.net.URI;

/** Reads one web address. Kept apart so the importer can be tested without the internet. */
public interface DeckFetcher {

	/** status is the HTTP status, or 0 when the site could not be reached in time. */
	record Response(int status, String body) {
	}

	Response get(URI uri, String accept);
}
