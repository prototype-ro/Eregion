package io.eregion.importer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.net.URI;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import io.eregion.common.ApiException;

class DeckImportServiceTest {

	private static final String ARCHIDEKT = """
			{"name": "Fun With Fungus",
			 "categories": [{"name": "Commander", "includedInDeck": true}, {"name": "Maybeboard", "includedInDeck": false}, {"name": "Ramp", "includedInDeck": true}],
			 "cards": [
			   {"quantity": 1, "categories": ["Commander"], "card": {"collectorNumber": "227", "edition": {"editioncode": "tsp"}, "oracleCard": {"name": "Thelon of Havenwood"}}},
			   {"quantity": 1, "categories": ["Ramp"], "card": {"collectorNumber": "263", "edition": {"editioncode": "c21"}, "oracleCard": {"name": "Sol Ring"}}},
			   {"quantity": 12, "categories": [], "card": {"collectorNumber": "300", "edition": {"editioncode": "unf"}, "oracleCard": {"name": "Forest"}}},
			   {"quantity": 1, "categories": ["Maybeboard"], "card": {"oracleCard": {"name": "Cultivate"}}},
			   {"quantity": 0, "categories": [], "card": {"oracleCard": {"name": "Ghost"}}},
			   {"quantity": 1, "categories": [], "card": {"oracleCard": {"name": ""}}}
			 ]}
			""";

	/** A fetcher that answers what it is told and remembers what it was asked for. */
	private static final class Fake implements DeckFetcher {
		final List<URI> asked = new ArrayList<>();
		private final Response answer;

		Fake(int status, String body) {
			this.answer = new Response(status, body);
		}

		@Override
		public Response get(URI uri, String accept) {
			asked.add(uri);
			return answer;
		}
	}

	@Test
	void anArchidektDeckBecomesSectionsOfCards() {
		var fake = new Fake(200, ARCHIDEKT);

		var deck = new DeckImportService(fake).fetch("https://archidekt.com/decks/63634/fun");

		assertThat(fake.asked).containsExactly(URI.create("https://archidekt.com/api/decks/63634/"));
		assertThat(deck.name()).isEqualTo("Fun With Fungus");
		assertThat(deck.site()).isEqualTo("Archidekt");
		assertThat(deck.text()).isEqualTo("""
				Commander
				1 Thelon of Havenwood (TSP) 227

				Deck
				1 Sol Ring (C21) 263
				12 Forest (UNF) 300

				Maybeboard
				1 Cultivate""");
	}

	@Test
	void textSitesPassTheirListThrough() {
		var deck = new DeckImportService(new Fake(200, "1 Sol Ring\n1 Cultivate\n")).fetch("https://tappedout.net/mtg-decks/kess-storm/");

		assertThat(deck.text()).isEqualTo("1 Sol Ring\n1 Cultivate");
		assertThat(deck.site()).isEqualTo("TappedOut");
	}

	@Test
	void moxfieldIsExplainedAndNeverFetched() {
		var fake = new Fake(200, "");

		assertThatThrownBy(() -> new DeckImportService(fake).fetch("https://moxfield.com/decks/oEWXWHM5eEGMmopExLWRCA"))
				.isInstanceOfSatisfying(ApiException.class, ex -> {
					assertThat(ex.status()).isEqualTo(HttpStatus.BAD_REQUEST);
					assertThat(ex.getMessage()).contains("Moxfield does not let other sites read").contains("Export");
				});
		assertThat(fake.asked).isEmpty();
	}

	@Test
	void aLinkThatIsNotADeckIsRefusedWithoutAnyRequest() {
		var fake = new Fake(200, "");

		assertThatThrownBy(() -> new DeckImportService(fake).fetch("https://evil.example/decks/1")).isInstanceOf(ApiException.class).hasMessageContaining("not a link to a deck");
		assertThat(fake.asked).isEmpty();
	}

	@Test
	void aMissingDeckIsNotFound() {
		assertThatThrownBy(() -> new DeckImportService(new Fake(404, "")).fetch("https://archidekt.com/decks/1"))
				.isInstanceOfSatisfying(ApiException.class, ex -> {
					assertThat(ex.status()).isEqualTo(HttpStatus.NOT_FOUND);
					assertThat(ex.getMessage()).contains("private");
				});
	}

	@Test
	void aSiteThatBlocksUsGetsAnHonestMessage() {
		assertThatThrownBy(() -> new DeckImportService(new Fake(403, "<html>Just a moment</html>")).fetch("https://www.mtggoldfish.com/deck/4123456"))
				.isInstanceOfSatisfying(ApiException.class, ex -> {
					assertThat(ex.status()).isEqualTo(HttpStatus.BAD_GATEWAY);
					assertThat(ex.getMessage()).contains("MTGGoldfish").contains("blocks automated requests").contains("paste the list");
				});
	}

	@Test
	void aSlowSiteIsReportedAsSuch() {
		assertThatThrownBy(() -> new DeckImportService(new Fake(0, "")).fetch("https://archidekt.com/decks/1"))
				.isInstanceOfSatisfying(ApiException.class, ex -> assertThat(ex.getMessage()).contains("did not answer in time"));
	}

	@Test
	void anOversizedAnswerIsRefused() {
		assertThatThrownBy(() -> new DeckImportService(new Fake(413, "")).fetch("https://archidekt.com/decks/1")).hasMessageContaining("bigger than a Commander deck");
	}

	@Test
	void garbageFromArchidektIsHandled() {
		assertThatThrownBy(() -> new DeckImportService(new Fake(200, "<<not json")).fetch("https://archidekt.com/decks/1")).isInstanceOf(ApiException.class).hasMessageContaining("unreadable");
		assertThatThrownBy(() -> new DeckImportService(new Fake(200, "{\"name\":\"Empty\",\"cards\":[]}")).fetch("https://archidekt.com/decks/1")).hasMessageContaining("no cards");
	}

	@Test
	void theRealFetcherRefusesOtherHostsBeforeAnyRequest() {
		var fetcher = new HttpDeckFetcher();

		assertThatThrownBy(() -> fetcher.get(URI.create("https://evil.example/x"), "text/plain")).isInstanceOf(IllegalArgumentException.class);
		assertThatThrownBy(() -> fetcher.get(URI.create("http://archidekt.com/api/decks/1/"), "text/plain")).isInstanceOf(IllegalArgumentException.class);
		assertThatThrownBy(() -> fetcher.get(URI.create("https://169.254.169.254/latest/meta-data/"), "text/plain")).isInstanceOf(IllegalArgumentException.class);
		assertThatThrownBy(() -> fetcher.get(URI.create("https://localhost/"), "text/plain")).isInstanceOf(IllegalArgumentException.class);
	}
}
