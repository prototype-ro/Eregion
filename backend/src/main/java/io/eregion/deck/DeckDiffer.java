package io.eregion.deck;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import io.eregion.deck.DeckDtos.CardChange;
import io.eregion.deck.DeckDtos.DeckCardLine;
import io.eregion.deck.DeckDtos.DeckDiff;
import io.eregion.deck.DeckDtos.DeckStats;
import io.eregion.deck.DeckDtos.PrintingChange;
import io.eregion.deck.DeckDtos.TagChange;
import io.eregion.deck.DeckDtos.QuantityChange;
import io.eregion.deck.DeckDtos.StatsChange;

/**
 * Compares two full snapshots. Nothing about a diff is stored: it is derived on
 * read, so it is always correct for whichever two versions are asked for.
 *
 * A card is identified by card and board together, so moving a card from main to
 * maybe shows up as one removal and one addition.
 */
public final class DeckDiffer {

	private record Key(UUID cardId, String board) {
	}

	private DeckDiffer() {
	}

	public static DeckDiff diff(int fromVersion, List<DeckCardLine> from, int toVersion, List<DeckCardLine> to) {
		Map<Key, DeckCardLine> before = index(from);
		Map<Key, DeckCardLine> after = index(to);

		List<CardChange> added = new ArrayList<>();
		List<CardChange> removed = new ArrayList<>();
		List<QuantityChange> changed = new ArrayList<>();
		List<PrintingChange> printings = new ArrayList<>();
		List<TagChange> tags = new ArrayList<>();

		after.forEach((key, line) -> {
			DeckCardLine previous = before.get(key);
			if (previous == null) {
				added.add(change(line));
			}
			else {
				if (previous.quantity() != line.quantity()) {
					changed.add(new QuantityChange(line.cardId(), line.name(), line.board(), previous.quantity(),
							line.quantity()));
				}
				if (!previous.printingId().equals(line.printingId())
						|| !java.util.Objects.equals(previous.customPrintingId(), line.customPrintingId())) {
					printings.add(new PrintingChange(line.cardId(), line.name(), line.board(), printing(previous),
							printing(line)));
				}
				tagChange(previous, line).ifPresent(tags::add);
			}
		});
		before.forEach((key, line) -> {
			if (!after.containsKey(key)) {
				removed.add(change(line));
			}
		});

		added.sort(Comparator.comparing(CardChange::name).thenComparing(CardChange::board));
		removed.sort(Comparator.comparing(CardChange::name).thenComparing(CardChange::board));
		changed.sort(Comparator.comparing(QuantityChange::name).thenComparing(QuantityChange::board));
		printings.sort(Comparator.comparing(PrintingChange::name).thenComparing(PrintingChange::board));
		tags.sort(Comparator.comparing(TagChange::name).thenComparing(TagChange::board));

		StatsChange stats = statsChange(StatsCalculator.compute(from), StatsCalculator.compute(to));
		return new DeckDiff(fromVersion, toVersion, List.copyOf(added), List.copyOf(removed), List.copyOf(changed),
				List.copyOf(printings), List.copyOf(tags), stats);
	}

	private static String printing(DeckCardLine line) {
		if (line.customPrintingId() != null) {
			return "Custom: " + line.setName();
		}
		return (line.setCode() + " " + line.collectorNumber()).trim();
	}

	/** Tags are compared ignoring case, and reported with the spelling they have in the version that holds them. */
	private static java.util.Optional<TagChange> tagChange(DeckCardLine before, DeckCardLine after) {
		Set<String> had = lower(before.tags());
		Set<String> has = lower(after.tags());
		List<String> added = after.tags().stream().filter(tag -> !had.contains(tag.toLowerCase(java.util.Locale.ROOT))).toList();
		List<String> removed = before.tags().stream().filter(tag -> !has.contains(tag.toLowerCase(java.util.Locale.ROOT))).toList();
		if (added.isEmpty() && removed.isEmpty()) {
			return java.util.Optional.empty();
		}
		return java.util.Optional.of(new TagChange(after.cardId(), after.name(), after.board(), added, removed));
	}

	private static Set<String> lower(List<String> tags) {
		Set<String> result = new LinkedHashSet<>();
		tags.forEach(tag -> result.add(tag.toLowerCase(java.util.Locale.ROOT)));
		return result;
	}

	private static StatsChange statsChange(DeckStats from, DeckStats to) {
		List<Integer> curveDelta = new ArrayList<>();
		for (int i = 0; i < StatsCalculator.CURVE_BUCKETS; i++) {
			curveDelta.add(to.curve().get(i) - from.curve().get(i));
		}

		Set<String> typeNames = new LinkedHashSet<>(from.types().keySet());
		typeNames.addAll(to.types().keySet());
		Map<String, Integer> typeDelta = new LinkedHashMap<>();
		for (String type : typeNames) {
			int delta = to.types().getOrDefault(type, 0) - from.types().getOrDefault(type, 0);
			if (delta != 0) {
				typeDelta.put(type, delta);
			}
		}

		return new StatsChange(from, to, StatsCalculator.round2(to.averageManaValue() - from.averageManaValue()),
				List.copyOf(curveDelta), typeDelta, to.totalCards() - from.totalCards(), to.lands() - from.lands());
	}

	private static Map<Key, DeckCardLine> index(List<DeckCardLine> lines) {
		Map<Key, DeckCardLine> map = new LinkedHashMap<>();
		for (DeckCardLine line : lines) {
			map.put(new Key(line.cardId(), line.board()), line);
		}
		return map;
	}

	private static CardChange change(DeckCardLine line) {
		return new CardChange(line.cardId(), line.name(), line.manaCost(), line.manaValue(), line.primaryType(),
				line.board(), line.quantity());
	}
}
