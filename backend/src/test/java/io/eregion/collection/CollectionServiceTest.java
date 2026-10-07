package io.eregion.collection;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import io.eregion.collection.CollectionService.Entry;

class CollectionServiceTest {

	private static final UUID SOL = UUID.randomUUID();
	private static final UUID ISLAND = UUID.randomUUID();

	@Test
	void repeatedCardsAreSummed() {
		var merged = CollectionService.merge(List.of(new Entry(SOL, 1), new Entry(ISLAND, 4), new Entry(SOL, 2)));

		assertThat(merged).containsEntry(SOL, 3).containsEntry(ISLAND, 4).hasSize(2);
	}

	@Test
	void totalsNeverPassTheCap() {
		var merged = CollectionService.merge(List.of(new Entry(ISLAND, 900), new Entry(ISLAND, 900), new Entry(SOL, 5000)));

		assertThat(merged.get(ISLAND)).isEqualTo(CollectionService.MAX_QUANTITY);
		assertThat(merged.get(SOL)).isEqualTo(CollectionService.MAX_QUANTITY);
	}

	@Test
	void keepsTheOrderCardsFirstAppeared() {
		var merged = CollectionService.merge(List.of(new Entry(ISLAND, 1), new Entry(SOL, 1), new Entry(ISLAND, 1)));

		assertThat(merged.keySet()).containsExactly(ISLAND, SOL);
	}
}
