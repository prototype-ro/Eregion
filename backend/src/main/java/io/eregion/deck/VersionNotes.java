package io.eregion.deck;

import java.util.List;

import io.eregion.deck.DeckDtos.CardChange;
import io.eregion.deck.DeckDtos.DeckDiff;

/** Writes the note for a version nobody described, from what changed since the version it grew from. */
public final class VersionNotes {

	static final int MAX_LENGTH = 200;
	private static final int NAMES_SHOWN = 3;

	private VersionNotes() {
	}

	/** "Added A, B and 2 more. Removed C." Plain words, never longer than a note may be. */
	public static String summary(DeckDiff diff) {
		StringBuilder text = new StringBuilder();
		append(text, "Added", diff.added());
		append(text, "Removed", diff.removed());
		if (!diff.changed().isEmpty()) {
			text.append(text.isEmpty() ? "" : " ").append("Changed copies of ").append(diff.changed().size())
					.append(diff.changed().size() == 1 ? " card." : " cards.");
		}
		if (text.isEmpty() && !diff.printings().isEmpty()) {
			text.append("Changed printings.");
		}
		if (text.isEmpty() && !diff.tags().isEmpty()) {
			text.append("Changed tags.");
		}
		if (text.isEmpty()) {
			return "No card changes.";
		}
		return text.length() <= MAX_LENGTH ? text.toString() : text.substring(0, MAX_LENGTH - 1).stripTrailing() + "…";
	}

	private static void append(StringBuilder text, String verb, List<CardChange> cards) {
		if (cards.isEmpty()) {
			return;
		}
		List<String> names = cards.stream().map(CardChange::name).distinct().toList();
		String shown = String.join(", ", names.subList(0, Math.min(NAMES_SHOWN, names.size())));
		int more = names.size() - NAMES_SHOWN;
		if (more > 0) {
			shown += " and " + more + " more";
		}
		text.append(text.isEmpty() ? "" : " ").append(verb).append(' ').append(shown).append('.');
	}
}
