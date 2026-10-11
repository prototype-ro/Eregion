package io.eregion.deck;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import io.eregion.deck.DeckDtos.CardChange;
import io.eregion.deck.DeckDtos.DeckDiff;
import io.eregion.deck.DeckDtos.QuantityChange;

class VersionNotesTest {

	private static CardChange card(String name) {
		return new CardChange(UUID.randomUUID(), name, "", 0, "Other", "main", 1);
	}

	private static DeckDiff diff(List<CardChange> added, List<CardChange> removed, List<QuantityChange> changed) {
		return new DeckDiff(1, 2, added, removed, changed, List.of(), List.of(), null);
	}

	@Test
	void namesWhatWasAddedAndRemoved() {
		assertEquals("Added Rhystic Study. Removed Divination.", VersionNotes.summary(diff(List.of(card("Rhystic Study")), List.of(card("Divination")), List.of())));
	}

	@Test
	void shortensLongLists() {
		var added = List.of(card("A"), card("B"), card("C"), card("D"), card("E"));
		assertEquals("Added A, B, C and 2 more.", VersionNotes.summary(diff(added, List.of(), List.of())));
	}

	@Test
	void saysSoWhenNothingChanged() {
		assertEquals("No card changes.", VersionNotes.summary(diff(List.of(), List.of(), List.of())));
	}

	@Test
	void neverExceedsTheNoteLimit() {
		var longName = "x".repeat(150);
		var text = VersionNotes.summary(diff(List.of(card(longName), card(longName)), List.of(card(longName)), List.of()));
		assertTrue(text.length() <= VersionNotes.MAX_LENGTH);
	}
}
