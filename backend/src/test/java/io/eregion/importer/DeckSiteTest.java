package io.eregion.importer;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;

import io.eregion.importer.DeckSite.Source;

class DeckSiteTest {

	private static Source parse(String link) {
		return DeckSite.parse(link).orElse(null);
	}

	@Test
	void recognisesTheSupportedSites() {
		assertThat(parse("https://archidekt.com/decks/63634/fun_with_fungus")).isEqualTo(new Source(DeckSite.ARCHIDEKT, "63634"));
		assertThat(parse("https://www.archidekt.com/decks/63634")).isEqualTo(new Source(DeckSite.ARCHIDEKT, "63634"));
		assertThat(parse("https://scryfall.com/@someone/decks/6a1b2c3d-1111-2222-3333-444455556666")).isEqualTo(new Source(DeckSite.SCRYFALL, "6a1b2c3d-1111-2222-3333-444455556666"));
		assertThat(parse("https://tappedout.net/mtg-decks/kess-storm/")).isEqualTo(new Source(DeckSite.TAPPEDOUT, "kess-storm"));
		assertThat(parse("https://www.mtggoldfish.com/deck/4123456#paper")).isEqualTo(new Source(DeckSite.GOLDFISH, "4123456"));
		assertThat(parse("https://moxfield.com/decks/oEWXWHM5eEGMmopExLWRCA")).isEqualTo(new Source(DeckSite.MOXFIELD, "oEWXWHM5eEGMmopExLWRCA"));
		assertThat(parse("  https://ARCHIDEKT.com/decks/12  ")).isEqualTo(new Source(DeckSite.ARCHIDEKT, "12"));
	}

	@Test
	void theFetchedAddressIsBuiltFromATemplateWithOnlyTheId() {
		assertThat(parse("https://archidekt.com/decks/63634/anything-here?x=https://evil.example").apiUri().toString()).isEqualTo("https://archidekt.com/api/decks/63634/");
		assertThat(parse("https://tappedout.net/mtg-decks/kess-storm/").apiUri().toString()).isEqualTo("https://tappedout.net/mtg-decks/kess-storm/?fmt=txt");
		assertThat(parse("https://moxfield.com/decks/oEWXWHM5eEGMmopExLWRCA").apiUri()).isNull();
	}

	@Test
	void anythingElseIsRefused() {
		List<String> refused = List.of(
				"http://archidekt.com/decks/1",                       // not https
				"https://archidekt.com@evil.example/decks/1",         // the host is evil.example
				"https://evil.example@archidekt.com/decks/1",         // user info is never allowed
				"https://archidekt.com:8443/decks/1",                 // not the default port
				"https://evil.example/decks/1",                       // another host
				"https://archidekt.com.evil.example/decks/1",         // a look-alike host
				"https://notarchidekt.com/decks/1",
				"https://archidekt.com/decks/abc",                    // not a deck id
				"https://archidekt.com/decks/../admin",               // path tricks
				"https://archidekt.com/decks/%2e%2e/1",
				"https://archidekt.com/api/decks/1/",                 // an API address is not a deck page
				"https://tappedout.net/mtg-decks/../../etc/passwd",
				"https://tappedout.net/mtg-decks/UPPER/",             // outside the slug pattern
				"ftp://archidekt.com/decks/1",
				"file:///etc/passwd",
				"javascript:alert(1)",
				"//archidekt.com/decks/1",
				"archidekt.com/decks/1",
				"",
				"   ",
				"not a link",
				"https://",
				"https://archidekt.com/decks/12345678901");           // longer than any id
		for (String link : refused) {
			assertThat(DeckSite.parse(link)).as(link).isEmpty();
		}
		assertThat(DeckSite.parse(null)).isEmpty();
	}
}
