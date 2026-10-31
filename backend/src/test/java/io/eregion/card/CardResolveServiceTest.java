package io.eregion.card;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;

class CardResolveServiceTest {

	/** A catalog that knows nothing, so every name goes to Scryfall. */
	static class EmptyCatalog extends CardRepository {

		EmptyCatalog() {
			super(null);
		}

		@Override
		public List<Card> findByNames(Collection<String> names) {
			return List.of();
		}
	}

	/** Scryfall while it is rate limiting us: every call is refused, and the calls are counted. */
	static class BusyScryfall extends ScryfallClient {

		final List<String> calls = new ArrayList<>();

		BusyScryfall() {
			super("eregion-test", 0);
		}

		@Override
		public CollectionResult collection(List<String> names) {
			calls.add("collection");
			throw new BusyException(30_000);
		}

		@Override
		public Optional<ScryfallCard> fuzzy(String name) {
			calls.add("fuzzy " + name);
			throw new BusyException(30_000);
		}
	}

	@Test
	void namesScryfallRefusedToCheckAreUncheckedNotMissing() {
		BusyScryfall scryfall = new BusyScryfall();
		CardResolveService resolver = new CardResolveService(new EmptyCatalog(), scryfall);

		CardResolveService.Result result = resolver.resolve(List.of("Cavern of Souls", "Scrubland"));

		assertThat(result.notFound()).isEmpty();
		assertThat(result.unchecked()).containsExactly("Cavern of Souls", "Scrubland");
		assertThat(result.matches()).isEmpty();
	}

	@Test
	void noFuzzyTriesWhileScryfallIsRateLimiting() {
		BusyScryfall scryfall = new BusyScryfall();
		new CardResolveService(new EmptyCatalog(), scryfall).resolve(List.of("Cavern of Souls", "Scrubland"));

		assertThat(scryfall.calls).containsExactly("collection");
	}

	@Test
	void retryAfterIsReadInSecondsAndCapped() {
		assertThat(ScryfallClient.retryAfterMs("12")).isEqualTo(12_000);
		assertThat(ScryfallClient.retryAfterMs("9999")).isEqualTo(120_000);
		assertThat(ScryfallClient.retryAfterMs(null)).isEqualTo(30_000);
		assertThat(ScryfallClient.retryAfterMs("soon")).isEqualTo(30_000);
	}
}
