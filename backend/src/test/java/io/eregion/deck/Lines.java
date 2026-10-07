package io.eregion.deck;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

import io.eregion.deck.DeckDtos.DeckCardLine;

/** Test helper: builds deck lines with a stable id per card name. */
final class Lines {

	private Lines() {
	}

	static DeckCardLine line(String name, String type, double manaValue, String board, int quantity, int owned) {
		UUID id = UUID.nameUUIDFromBytes(name.getBytes(StandardCharsets.UTF_8));
		return new DeckCardLine(id, name, "", manaValue, type, type, "", "", "", "", board, quantity, owned);
	}

	static DeckCardLine main(String name, String type, double manaValue, int quantity) {
		return line(name, type, manaValue, "main", quantity, quantity);
	}
}
