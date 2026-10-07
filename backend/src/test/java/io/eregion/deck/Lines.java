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
		return new DeckCardLine(id, name, "", manaValue, type, type, "", "", "", "", "", "", "", "", id, null, "TST", "Test", "1", null,
				board, quantity, owned, java.util.List.of());
	}

	static DeckCardLine priced(String name, String type, double manaValue, int quantity, double price) {
		UUID id = UUID.nameUUIDFromBytes(name.getBytes(StandardCharsets.UTF_8));
		return new DeckCardLine(id, name, "", manaValue, type, type, "", "", "", "", "", "", "", "", id, null, "TST", "Test", "1", price,
				"main", quantity, quantity, java.util.List.of());
	}

	static DeckCardLine main(String name, String type, double manaValue, int quantity) {
		return line(name, type, manaValue, "main", quantity, quantity);
	}

	/** The same card pinned to another printing. */
	static DeckCardLine printing(DeckCardLine line, String setCode, String number) {
		return new DeckCardLine(line.cardId(), line.name(), line.manaCost(), line.manaValue(), line.primaryType(), line.typeLine(),
				line.colors(), line.colorIdentity(), line.oracleText(), line.rarity(), line.artist(), line.imageSmall(),
				line.imageNormal(), line.imageArtCrop(), UUID.nameUUIDFromBytes((setCode + number).getBytes(StandardCharsets.UTF_8)),
				null, setCode, line.setName(), number, line.priceUsd(), line.board(), line.quantity(), line.owned(), line.tags());
	}

	static DeckCardLine custom(DeckCardLine line, String label) {
		return new DeckCardLine(line.cardId(), line.name(), line.manaCost(), line.manaValue(), line.primaryType(), line.typeLine(),
				line.colors(), line.colorIdentity(), line.oracleText(), line.rarity(), line.artist(), line.imageSmall(),
				line.imageNormal(), line.imageArtCrop(), line.printingId(), UUID.nameUUIDFromBytes(label.getBytes(StandardCharsets.UTF_8)),
				"custom", label, "", line.priceUsd(), line.board(), line.quantity(), line.owned(), line.tags());
	}

	static DeckCardLine tagged(DeckCardLine line, String... tags) {
		return new DeckCardLine(line.cardId(), line.name(), line.manaCost(), line.manaValue(), line.primaryType(), line.typeLine(),
				line.colors(), line.colorIdentity(), line.oracleText(), line.rarity(), line.artist(), line.imageSmall(),
				line.imageNormal(), line.imageArtCrop(), line.printingId(), line.customPrintingId(), line.setCode(), line.setName(), line.collectorNumber(),
				line.priceUsd(), line.board(), line.quantity(), line.owned(), java.util.List.of(tags));
	}
}
