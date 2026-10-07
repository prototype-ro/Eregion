package io.eregion.collection;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import io.eregion.card.CardRepository;
import io.eregion.common.ApiException;

@Service
public class CollectionService {

	public static final int MAX_QUANTITY = 999;

	public record Entry(UUID cardId, int quantity) {
	}

	private final CollectionRepository collection;
	private final CardRepository cards;

	public CollectionService(CollectionRepository collection, CardRepository cards) {
		this.collection = collection;
		this.cards = cards;
	}

	/**
	 * Adds many cards at once. With replace, the existing collection is emptied first, so the
	 * result is exactly the list given. Returns how many different cards were written.
	 */
	@Transactional
	public int bulk(UUID userId, List<Entry> entries, boolean replace) {
		Map<UUID, Integer> merged = merge(entries);
		if (cards.existingIds(merged.keySet()).size() != merged.size()) {
			throw ApiException.badRequest("Some cards are not in the catalog. Look them up first.");
		}
		if (replace) {
			collection.clear(userId);
		}
		collection.addQuantities(userId, merged);
		return merged.size();
	}

	/** Several lines for the same card become one, with the total capped. */
	static Map<UUID, Integer> merge(List<Entry> entries) {
		Map<UUID, Integer> merged = new LinkedHashMap<>();
		for (Entry entry : entries) {
			merged.merge(entry.cardId(), entry.quantity(), (a, b) -> Math.min(MAX_QUANTITY, a + b));
		}
		merged.replaceAll((id, quantity) -> Math.min(MAX_QUANTITY, quantity));
		return merged;
	}
}
