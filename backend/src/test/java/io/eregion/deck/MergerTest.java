package io.eregion.deck;

import static io.eregion.deck.Lines.custom;
import static io.eregion.deck.Lines.line;
import static io.eregion.deck.Lines.main;
import static io.eregion.deck.Lines.printing;
import static io.eregion.deck.Lines.tagged;
import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import io.eregion.deck.DeckDtos.DeckCardLine;
import io.eregion.deck.Merger.Result;

class MergerTest {

	private static final Map<String, String> NONE = Map.of();

	private static DeckCardLine ring(int copies) {
		return main("Sol Ring", "Artifact", 1, copies);
	}

	private static List<String> names(Result result) {
		return result.merged().stream().map(DeckCardLine::name).sorted().toList();
	}

	@Test
	void changesOnOneSideOnlyAreTakenWithoutAsking() {
		var base = List.of(ring(1), main("Cultivate", "Sorcery", 3, 1));
		var ours = List.of(ring(1), main("Cultivate", "Sorcery", 3, 1), main("Rhystic Study", "Enchantment", 3, 1));
		var theirs = List.of(ring(1));

		Result result = Merger.merge(base, ours, theirs, NONE);

		assertThat(result.conflicts()).isEmpty();
		// ours added Rhystic Study, theirs removed Cultivate: both apply.
		assertThat(names(result)).containsExactly("Rhystic Study", "Sol Ring");
	}

	@Test
	void theBranchChangeApplyWhenMainDidNotTouchTheCard() {
		Result result = Merger.merge(List.of(ring(1)), List.of(ring(1)), List.of(ring(3)), NONE);

		assertThat(result.conflicts()).isEmpty();
		assertThat(result.merged()).singleElement().extracting(DeckCardLine::quantity).isEqualTo(3);
	}

	@Test
	void mainsChangeIsKeptWhenTheBranchDidNotTouchTheCard() {
		Result result = Merger.merge(List.of(ring(1)), List.of(ring(2)), List.of(ring(1)), NONE);

		assertThat(result.merged()).singleElement().extracting(DeckCardLine::quantity).isEqualTo(2);
	}

	@Test
	void bothSidesMakingTheSameChangeIsNotAConflict() {
		Result result = Merger.merge(List.of(ring(1)), List.of(ring(2)), List.of(ring(2)), NONE);

		assertThat(result.conflicts()).isEmpty();
		assertThat(result.merged()).hasSize(1);
	}

	@Test
	void bothAddingTheSameNewCardIsNotAConflict() {
		var bolt = main("Lightning Bolt", "Instant", 1, 1);

		Result result = Merger.merge(List.of(), List.of(bolt), List.of(bolt), NONE);

		assertThat(result.conflicts()).isEmpty();
		assertThat(names(result)).containsExactly("Lightning Bolt");
	}

	@Test
	void differentChangesToTheSameCardAreAConflictWithAllThreeSides() {
		Result result = Merger.merge(List.of(ring(1)), List.of(ring(2)), List.of(ring(4)), NONE);

		assertThat(result.merged()).isEmpty();
		assertThat(result.conflicts()).hasSize(1);
		var conflict = result.conflicts().get(0);
		assertThat(conflict.name()).isEqualTo("Sol Ring");
		assertThat(conflict.base().quantity()).isEqualTo(1);
		assertThat(conflict.ours().quantity()).isEqualTo(2);
		assertThat(conflict.theirs().quantity()).isEqualTo(4);
	}

	@Test
	void removingOnOneSideAndChangingOnTheOtherIsAConflict() {
		Result result = Merger.merge(List.of(ring(1)), List.of(), List.of(ring(3)), NONE);

		assertThat(result.conflicts()).hasSize(1);
		assertThat(result.conflicts().get(0).ours().quantity()).isNull();
		assertThat(result.conflicts().get(0).theirs().quantity()).isEqualTo(3);
	}

	@Test
	void aChosenSideSettlesAConflict() {
		var base = List.of(ring(1));
		String key = Merger.keyOf(ring(1).cardId(), "main");

		Result mine = Merger.merge(base, List.of(ring(2)), List.of(ring(4)), Map.of(key, Merger.OURS));
		Result theirs = Merger.merge(base, List.of(ring(2)), List.of(ring(4)), Map.of(key, Merger.THEIRS));

		assertThat(mine.conflicts()).isEmpty();
		assertThat(mine.merged()).singleElement().extracting(DeckCardLine::quantity).isEqualTo(2);
		assertThat(theirs.merged()).singleElement().extracting(DeckCardLine::quantity).isEqualTo(4);
	}

	@Test
	void choosingTheSideThatRemovedDropsTheCard() {
		String key = Merger.keyOf(ring(1).cardId(), "main");

		Result result = Merger.merge(List.of(ring(1)), List.of(), List.of(ring(3)), Map.of(key, Merger.OURS));

		assertThat(result.conflicts()).isEmpty();
		assertThat(result.merged()).isEmpty();
	}

	@Test
	void unknownChoicesLeaveTheConflictOpen() {
		String key = Merger.keyOf(ring(1).cardId(), "main");

		Result result = Merger.merge(List.of(ring(1)), List.of(ring(2)), List.of(ring(4)), Map.of(key, "whatever"));

		assertThat(result.conflicts()).hasSize(1);
	}

	@Test
	void aChangedPrintingOnOneSideIsTaken() {
		var base = main("Sol Ring", "Artifact", 1, 1);

		Result result = Merger.merge(List.of(base), List.of(base), List.of(printing(base, "LTC", "319")), NONE);

		assertThat(result.conflicts()).isEmpty();
		assertThat(result.merged().get(0).setCode()).isEqualTo("LTC");
	}

	@Test
	void customArtAndTagsAreMergedLikeEverythingElse() {
		var base = main("Sol Ring", "Artifact", 1, 1);
		var withArt = custom(base, "Foil proxy");
		var withTag = tagged(base, "Ramp");

		Result result = Merger.merge(List.of(base), List.of(withTag), List.of(withArt), NONE);

		// Tags changed on one side and art on the other, but they are one line: that is a conflict.
		assertThat(result.conflicts()).hasSize(1);
		assertThat(result.conflicts().get(0).theirs().printing()).isEqualTo("Custom: Foil proxy");
		assertThat(result.conflicts().get(0).ours().tags()).containsExactly("Ramp");
	}

	@Test
	void tagsDifferingOnlyByCaseAreTheSame() {
		var base = tagged(main("Sol Ring", "Artifact", 1, 1), "Ramp");

		Result result = Merger.merge(List.of(base), List.of(tagged(base, "ramp")), List.of(base), NONE);

		assertThat(result.conflicts()).isEmpty();
	}

	@Test
	void theSameCardOnDifferentBoardsIsHandledSeparately() {
		var onMain = line("Sol Ring", "Artifact", 1, "main", 1, 1);
		var onMaybe = line("Sol Ring", "Artifact", 1, "maybe", 1, 1);

		// Ours moved the card to the maybeboard, theirs left it alone: the move applies.
		Result result = Merger.merge(List.of(onMain), List.of(onMaybe), List.of(onMain), NONE);

		assertThat(result.conflicts()).isEmpty();
		assertThat(result.merged()).singleElement().extracting(DeckCardLine::board).isEqualTo("maybe");
	}

	@Test
	void noCommonVersionTreatsEverythingAsNewOnBothSides() {
		Result result = Merger.merge(List.of(), List.of(ring(1)), List.of(ring(2)), NONE);

		assertThat(result.conflicts()).hasSize(1);
	}
}
