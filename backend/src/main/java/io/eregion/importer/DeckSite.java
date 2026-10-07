package io.eregion.importer;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The deck sites a link can come from. A link is never fetched as given: it is read for the site and the
 * deck id, and the address that is fetched is built from a fixed template with only that id filled in. So a
 * link cannot make the server call any other address.
 */
public enum DeckSite {

	ARCHIDEKT("Archidekt", "archidekt.com", Pattern.compile("^/decks/(\\d{1,10})(?:/.*)?$"), "https://archidekt.com/api/decks/%s/", "application/json"),
	SCRYFALL("Scryfall", "scryfall.com", Pattern.compile("^/@[^/]{1,40}/decks/([0-9a-fA-F-]{36})(?:/.*)?$"), "https://api.scryfall.com/decks/%s/export/text", "text/plain"),
	TAPPEDOUT("TappedOut", "tappedout.net", Pattern.compile("^/mtg-decks/([a-z0-9][a-z0-9-]{2,120})/?$"), "https://tappedout.net/mtg-decks/%s/?fmt=txt", "text/plain"),
	GOLDFISH("MTGGoldfish", "mtggoldfish.com", Pattern.compile("^/deck/(\\d{1,10})(?:/.*)?$"), "https://www.mtggoldfish.com/deck/download/%s", "text/plain"),
	/** Recognised so the person gets a clear answer, but not fetched: Moxfield does not let other sites read its decks. */
	MOXFIELD("Moxfield", "moxfield.com", Pattern.compile("^/decks/([A-Za-z0-9_-]{5,40})/?.*$"), null, null);

	/** A deck found in a link. */
	public record Source(DeckSite site, String id) {
		/** The address to fetch, or null for a site we do not fetch. */
		public URI apiUri() {
			return site.template == null ? null : URI.create(String.format(site.template, id));
		}
	}

	private final String label;
	private final String host;
	private final Pattern path;
	private final String template;
	private final String accept;

	DeckSite(String label, String host, Pattern path, String template, String accept) {
		this.label = label;
		this.host = host;
		this.path = path;
		this.template = template;
		this.accept = accept;
	}

	public String label() {
		return label;
	}

	public String accept() {
		return accept;
	}

	/** The host the fetched address belongs to. Anything else is refused before a request is made. */
	public String apiHost() {
		return template == null ? null : URI.create(String.format(template, "x")).getHost();
	}

	/** Reads a pasted link. Empty unless it is an https link to a deck page of a known site. */
	public static Optional<Source> parse(String link) {
		if (link == null) {
			return Optional.empty();
		}
		URI uri;
		try {
			uri = new URI(link.trim());
		}
		catch (URISyntaxException ex) {
			return Optional.empty();
		}
		// https only, on the default port, with no user name: "https://archidekt.com@evil.example/" has the host evil.example.
		if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getUserInfo() != null || uri.getPort() != -1 || uri.getHost() == null) {
			return Optional.empty();
		}
		String host = uri.getHost().toLowerCase(Locale.ROOT).replaceFirst("^www\\.", "");
		String path = uri.getRawPath() == null ? "" : uri.getRawPath();
		if (path.contains("..") || path.contains("%")) {
			return Optional.empty();
		}
		for (DeckSite site : values()) {
			if (site.host.equals(host)) {
				Matcher matcher = site.path.matcher(path);
				if (matcher.matches()) {
					return Optional.of(new Source(site, matcher.group(1)));
				}
			}
		}
		return Optional.empty();
	}
}
