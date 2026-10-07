package io.eregion.deck;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

import io.eregion.deck.DeckDtos.DeckCardLine;

/**
 * Three way merge of two decks that grew from a common version. A card counts as the same card by
 * card and board together, and a line is everything about it: copies, printing, custom art and tags.
 *
 * For each card, if only one side changed it from the common version, that change wins. If both sides
 * changed it in the same way there is nothing to decide. If they changed it differently it is a
 * conflict, and someone has to pick a side.
 */
public final class Merger {

	/** How one side has a card. A null quantity means the card is not there. */
	public record Side(Integer quantity, String printing, List<String> tags) {
	}

	public record Conflict(UUID cardId, String name, String board, Side base, Side ours, Side theirs) {
		public String key() {
			return keyOf(cardId, board);
		}
	}

	/** merged holds every card that could be settled. conflicts holds the ones that still need a choice. */
	public record Result(List<DeckCardLine> merged, List<Conflict> conflicts) {
	}

	public static final String OURS = "ours";
	public static final String THEIRS = "theirs";

	private Merger() {
	}

	public static String keyOf(UUID cardId, String board) {
		return cardId + "|" + board;
	}

	/**
	 * @param resolutions the side chosen for each conflict, by key, either "ours" or "theirs". Conflicts
	 *                    without a choice are left out of merged and reported in conflicts.
	 */
	public static Result merge(List<DeckCardLine> base, List<DeckCardLine> ours, List<DeckCardLine> theirs,
			Map<String, String> resolutions) {
		Map<String, DeckCardLine> b = index(base);
		Map<String, DeckCardLine> o = index(ours);
		Map<String, DeckCardLine> t = index(theirs);

		Set<String> keys = new LinkedHashSet<>(o.keySet());
		keys.addAll(t.keySet());
		keys.addAll(b.keySet());

		List<DeckCardLine> merged = new ArrayList<>();
		List<Conflict> conflicts = new ArrayList<>();
		for (String key : keys) {
			DeckCardLine base1 = b.get(key);
			DeckCardLine ours1 = o.get(key);
			DeckCardLine theirs1 = t.get(key);

			DeckCardLine chosen;
			if (same(ours1, theirs1)) {
				chosen = ours1;
			}
			else if (same(ours1, base1)) {
				chosen = theirs1;
			}
			else if (same(theirs1, base1)) {
				chosen = ours1;
			}
			else {
				DeckCardLine any = ours1 != null ? ours1 : theirs1 != null ? theirs1 : base1;
				String pick = resolutions == null ? null : resolutions.get(key);
				if (OURS.equals(pick)) {
					chosen = ours1;
				}
				else if (THEIRS.equals(pick)) {
					chosen = theirs1;
				}
				else {
					conflicts.add(new Conflict(any.cardId(), any.name(), any.board(), side(base1), side(ours1), side(theirs1)));
					continue;
				}
			}
			if (chosen != null) {
				merged.add(chosen);
			}
		}
		return new Result(List.copyOf(merged), List.copyOf(conflicts));
	}

	private static Side side(DeckCardLine line) {
		if (line == null) {
			return new Side(null, "", List.of());
		}
		String printing = line.customPrintingId() != null
				? "Custom: " + line.setName()
				: (line.setCode() + " " + line.collectorNumber()).trim();
		return new Side(line.quantity(), printing, line.tags());
	}

	/** Two lines are the same when nothing a person chose differs. Both missing counts as the same. */
	private static boolean same(DeckCardLine a, DeckCardLine b) {
		if (a == null || b == null) {
			return a == b;
		}
		return a.quantity() == b.quantity()
				&& Objects.equals(a.printingId(), b.printingId())
				&& Objects.equals(a.customPrintingId(), b.customPrintingId())
				&& lower(a.tags()).equals(lower(b.tags()));
	}

	private static Set<String> lower(List<String> tags) {
		Set<String> result = new LinkedHashSet<>();
		tags.forEach(tag -> result.add(tag.toLowerCase(Locale.ROOT)));
		return result;
	}

	private static Map<String, DeckCardLine> index(List<DeckCardLine> lines) {
		Map<String, DeckCardLine> map = new LinkedHashMap<>();
		for (DeckCardLine line : lines) {
			map.put(keyOf(line.cardId(), line.board()), line);
		}
		return map;
	}
}
