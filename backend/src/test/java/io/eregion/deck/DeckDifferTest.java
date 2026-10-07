package io.eregion.deck;

import static io.eregion.deck.Lines.custom;
import static io.eregion.deck.Lines.line;
import static io.eregion.deck.Lines.main;
import static io.eregion.deck.Lines.printing;
import static io.eregion.deck.Lines.tagged;
import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;

import io.eregion.deck.DeckDtos.DeckCardLine;
import io.eregion.deck.DeckDtos.DeckDiff;

class DeckDifferTest {

	@Test
	void identicalVersionsHaveNoChanges() {
		List<DeckCardLine> deck = List.of(main("Sol Ring", "Artifact", 1, 1), main("Forest", "Land", 0, 5));

		DeckDiff diff = DeckDiffer.diff(1, deck, 2, deck);

		assertThat(diff.added()).isEmpty();
		assertThat(diff.removed()).isEmpty();
		assertThat(diff.changed()).isEmpty();
		assertThat(diff.stats().averageManaValueDelta()).isZero();
		assertThat(diff.stats().totalDelta()).isZero();
	}

	@Test
	void findsAddedRemovedAndQuantityChanges() {
		List<DeckCardLine> v7 = List.of(
				main("Sol Ring", "Artifact", 1, 1),
				main("Divination", "Sorcery", 3, 1),
				main("Forest", "Land", 0, 5));
		List<DeckCardLine> v8 = List.of(
				main("Sol Ring", "Artifact", 1, 1),
				main("Rhystic Study", "Enchantment", 3, 1),
				main("Forest", "Land", 0, 6));

		DeckDiff diff = DeckDiffer.diff(7, v7, 8, v8);

		assertThat(diff.fromVersion()).isEqualTo(7);
		assertThat(diff.toVersion()).isEqualTo(8);
		assertThat(diff.added()).extracting(c -> c.name()).containsExactly("Rhystic Study");
		assertThat(diff.removed()).extracting(c -> c.name()).containsExactly("Divination");
		assertThat(diff.changed()).hasSize(1);
		assertThat(diff.changed().get(0).name()).isEqualTo("Forest");
		assertThat(diff.changed().get(0).from()).isEqualTo(5);
		assertThat(diff.changed().get(0).to()).isEqualTo(6);
	}

	@Test
	void statsDeltaShowsHowTheDeckShifted() {
		List<DeckCardLine> before = List.of(
				main("Mulldrifter", "Creature", 5, 1),
				main("Sol Ring", "Artifact", 1, 1));
		List<DeckCardLine> after = List.of(
				main("Cyclonic Rift", "Instant", 2, 1),
				main("Sol Ring", "Artifact", 1, 1));

		DeckDiff diff = DeckDiffer.diff(1, before, 2, after);

		assertThat(diff.stats().from().averageManaValue()).isEqualTo(3.0);
		assertThat(diff.stats().to().averageManaValue()).isEqualTo(1.5);
		assertThat(diff.stats().averageManaValueDelta()).isEqualTo(-1.5);
		assertThat(diff.stats().curveDelta()).containsExactly(0, 0, 1, 0, 0, -1, 0);
		assertThat(diff.stats().typeDelta()).containsEntry("Creature", -1).containsEntry("Instant", 1);
		assertThat(diff.stats().totalDelta()).isZero();
	}

	@Test
	void movingACardBetweenBoardsIsARemovalAndAnAddition() {
		List<DeckCardLine> before = List.of(line("Mana Drain", "Instant", 2, "main", 1, 0));
		List<DeckCardLine> after = List.of(line("Mana Drain", "Instant", 2, "maybe", 1, 0));

		DeckDiff diff = DeckDiffer.diff(1, before, 2, after);

		assertThat(diff.removed()).hasSize(1);
		assertThat(diff.removed().get(0).board()).isEqualTo("main");
		assertThat(diff.added()).hasSize(1);
		assertThat(diff.added().get(0).board()).isEqualTo("maybe");
		assertThat(diff.stats().totalDelta()).isEqualTo(-1);
	}

	@Test
	void resultsComeBackSortedByName() {
		List<DeckCardLine> after = List.of(
				main("Zur's Weirding", "Enchantment", 3, 1),
				main("Arcane Signet", "Artifact", 2, 1),
				main("Mind Stone", "Artifact", 2, 1));

		DeckDiff diff = DeckDiffer.diff(1, List.of(), 2, after);

		assertThat(diff.added()).extracting(c -> c.name())
				.containsExactly("Arcane Signet", "Mind Stone", "Zur's Weirding");
	}

	@Test
	void aChangedPrintingIsReportedWithBothSides() {
		var ring = main("Sol Ring", "Artifact", 1, 1);

		DeckDiff diff = DeckDiffer.diff(1, List.of(printing(ring, "C21", "263")), 2, List.of(printing(ring, "LTC", "319")));

		assertThat(diff.printings()).hasSize(1);
		assertThat(diff.printings().get(0).from()).isEqualTo("C21 263");
		assertThat(diff.printings().get(0).to()).isEqualTo("LTC 319");
		assertThat(diff.added()).isEmpty();
		assertThat(diff.changed()).isEmpty();
	}

	@Test
	void samePrintingIsNotReported() {
		var ring = printing(main("Sol Ring", "Artifact", 1, 1), "C21", "263");

		assertThat(DeckDiffer.diff(1, List.of(ring), 2, List.of(ring)).printings()).isEmpty();
	}

	@Test
	void tagChangesListWhatWasAddedAndRemoved() {
		var before = tagged(main("Sol Ring", "Artifact", 1, 1), "Ramp", "Staple");
		var after = tagged(main("Sol Ring", "Artifact", 1, 1), "ramp", "Fast mana");

		DeckDiff diff = DeckDiffer.diff(1, List.of(before), 2, List.of(after));

		assertThat(diff.tags()).hasSize(1);
		assertThat(diff.tags().get(0).added()).containsExactly("Fast mana");
		assertThat(diff.tags().get(0).removed()).containsExactly("Staple");
	}

	@Test
	void tagsDifferingOnlyByCaseAreNotAChange() {
		var before = tagged(main("Sol Ring", "Artifact", 1, 1), "Ramp");
		var after = tagged(main("Sol Ring", "Artifact", 1, 1), "ramp");

		assertThat(DeckDiffer.diff(1, List.of(before), 2, List.of(after)).tags()).isEmpty();
	}

	@Test
	void aNewCardIsAnAdditionNotATagChange() {
		DeckDiff diff = DeckDiffer.diff(1, List.of(), 2, List.of(tagged(main("Sol Ring", "Artifact", 1, 1), "Ramp")));

		assertThat(diff.added()).hasSize(1);
		assertThat(diff.tags()).isEmpty();
	}

	@Test
	void switchingToCustomArtIsAPrintingChange() {
		var ring = main("Sol Ring", "Artifact", 1, 1);

		DeckDiff diff = DeckDiffer.diff(1, List.of(printing(ring, "C21", "263")), 2, List.of(custom(ring, "Foil proxy")));

		assertThat(diff.printings()).hasSize(1);
		assertThat(diff.printings().get(0).from()).isEqualTo("C21 263");
		assertThat(diff.printings().get(0).to()).isEqualTo("Custom: Foil proxy");
	}

	@Test
	void sameCustomArtIsNotAChange() {
		var ring = custom(main("Sol Ring", "Artifact", 1, 1), "Foil proxy");

		assertThat(DeckDiffer.diff(1, List.of(ring), 2, List.of(ring)).printings()).isEmpty();
	}
}
