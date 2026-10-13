package io.eregion.analysis;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.Test;

import io.eregion.analysis.AnalysisDtos.ComboInfo;
import io.eregion.analysis.AnalysisDtos.Speed;

class GoldfishSimulatorTest {

	private static AnalysisCard forest(int quantity) {
		return Cards.land("Forest", "Basic Land - Forest", "({T}: Add {G}.)", quantity);
	}

	private static AnalysisCard filler(int quantity) {
		return Cards.spell("Filler", "{6}", 6, "Creature", null, quantity);
	}

	private static AnalysisCard rock(String name, double value, int produces, int quantity) {
		return new AnalysisCard(name, "{" + (int) value + "}", value, "Artifact", "Artifact", "{T}: Add " + "{C}".repeat(produces) + ".", "", "Ramp",
				quantity, "main", Set.of());
	}

	private static AnalysisCard cultivate(int quantity) {
		return new AnalysisCard("Rampant Growth", "{1}{G}", 2, "Sorcery", "Sorcery",
				"Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.", "", "Ramp", quantity, "main", Set.of());
	}

	private static List<AnalysisCard> deck(AnalysisCard... cards) {
		return new ArrayList<>(List.of(cards));
	}

	private static ComboInfo combo(String a, String b, int mana) {
		return new ComboInfo("c", List.of(a, b), List.of(), List.of("Win the game"), "", "", mana, "S", 100);
	}

	private static AnalysisCard piece(String name, int quantity, double value) {
		return Cards.spell(name, "{" + (int) value + "}", value, "Creature", null, quantity);
	}

	@Test
	void anAllLandDeckHasOneMoreManaEveryTurn() {
		Speed speed = GoldfishSimulator.simulate(deck(forest(60)), List.of());
		assertThat(speed.manaByTurn()).containsExactly(1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0);
		assertThat(speed.games()).isEqualTo(GoldfishSimulator.GAMES);
	}

	@Test
	void manaRocksSpeedTheDeckUp() {
		Speed plain = GoldfishSimulator.simulate(deck(forest(36), filler(60)), List.of());
		Speed fast = GoldfishSimulator.simulate(deck(forest(36), rock("Sol Ring", 1, 2, 12), filler(48)), List.of());
		assertThat(fast.manaByTurn().get(2)).isGreaterThan(plain.manaByTurn().get(2) + 0.5);
	}

	@Test
	void landFetchingSpellsRampToo() {
		Speed plain = GoldfishSimulator.simulate(deck(forest(36), filler(60)), List.of());
		Speed fetch = GoldfishSimulator.simulate(deck(forest(36), cultivate(12), filler(48)), List.of());
		assertThat(fetch.manaByTurn().get(4)).isGreaterThan(plain.manaByTurn().get(4));
	}

	@Test
	void theCommanderComesOutAroundItsManaValueOnAPlainDeck() {
		Speed speed = GoldfishSimulator.simulate(deck(Cards.commander("Four Drop", "{2}{G}{G}", 4, "G"), forest(37), filler(62)), List.of());
		assertThat(speed.commanderTurn()).isBetween(4.0, 6.0);
		assertThat(speed.commanderByTurn().get("6")).isGreaterThan(speed.commanderByTurn().get("3"));
		assertThat(speed.commanderByTurn().get("3")).isLessThan(0.1);
	}

	@Test
	void noCommanderOrNoComboMeansNoFigureForThem() {
		Speed speed = GoldfishSimulator.simulate(deck(forest(37), filler(62)), List.of());
		assertThat(speed.commanderTurn()).isNull();
		assertThat(speed.commanderByTurn()).isEmpty();
		assertThat(speed.comboTurn()).isNull();
		assertThat(speed.comboByTurn()).isEmpty();
	}

	@Test
	void unknownCombosAreNotInvented() {
		assertThat(GoldfishSimulator.simulate(deck(forest(37), filler(62)), null).comboByTurn()).isEmpty();
	}

	@Test
	void aComboIsExecutableOnceItsPiecesAreDrawnAndPaidFor() {
		List<AnalysisCard> cards = deck(forest(36), piece("Piece A", 1, 2), piece("Piece B", 1, 2), filler(61));
		Speed speed = GoldfishSimulator.simulate(cards, List.of(combo("Piece A", "Piece B", 4)));
		// Two specific cards in a 99 card library: by turn 10 roughly 17 cards are seen, so about 3% have both.
		assertThat(speed.comboByTurn().get("10")).isBetween(0.005, 0.09);
		assertThat(speed.comboByTurn().get("4")).isLessThanOrEqualTo(speed.comboByTurn().get("10"));
		assertThat(speed.comboTurn()).isNull();
	}

	@Test
	void tutorsFindMissingComboPieces() {
		AnalysisCard tutor = new AnalysisCard("Demonic Tutor", "{2}", 2, "Sorcery", "Sorcery",
				"Search your library for a card, put that card into your hand, then shuffle.", "", "Tutor", 8, "main", Set.of());
		List<ComboInfo> combos = List.of(combo("Piece A", "Piece B", 4));
		Speed without = GoldfishSimulator.simulate(deck(forest(36), piece("Piece A", 1, 2), piece("Piece B", 1, 2), filler(61)), combos);
		Speed with = GoldfishSimulator.simulate(deck(forest(36), piece("Piece A", 1, 2), piece("Piece B", 1, 2), tutor, filler(53)), combos);
		assertThat(with.comboByTurn().get("10")).isGreaterThan(without.comboByTurn().get("10") * 2);
	}

	@Test
	void aComboThatLoopsWithoutWinningStillCountsButAPlainOneDoesNot() {
		ComboInfo plain = new ComboInfo("p", List.of("Piece A", "Piece B"), List.of(), List.of("Draw a card"), "", "", 2, "S", 1);
		Speed speed = GoldfishSimulator.simulate(deck(forest(36), piece("Piece A", 1, 2), piece("Piece B", 1, 2), filler(61)), List.of(plain));
		assertThat(speed.comboByTurn()).isEmpty();
	}

	@Test
	void theSameDeckAlwaysGivesTheSameNumbers() {
		List<AnalysisCard> cards = deck(forest(36), rock("Sol Ring", 1, 2, 4), filler(59));
		assertThat(GoldfishSimulator.simulate(cards, List.of())).isEqualTo(GoldfishSimulator.simulate(cards, List.of()));
	}

	@Test
	void aDeckBeingStartedIsNotSimulated() {
		assertThat(GoldfishSimulator.simulate(deck(forest(5)), List.of())).isNull();
	}

	@Test
	void manaAveragesAreSane() {
		Speed speed = GoldfishSimulator.simulate(deck(forest(37), filler(62)), List.of());
		assertThat(speed.manaByTurn().get(0)).isBetween(0.5, 1.0);
		assertThat(speed.manaByTurn().get(2)).isCloseTo(2.5, within(0.5));
		assertThat(speed.manaByTurn().get(7)).isGreaterThan(speed.manaByTurn().get(2));
	}

	// ---- colours, tapped lands, combos that need a payoff ----

	private static AnalysisCard land(String name, String text, int quantity) {
		return Cards.land(name, "Land", text, quantity);
	}

	private static AnalysisCard blueRock(int quantity) {
		return new AnalysisCard("Blue Signet", "{U}", 1, "Artifact", "Artifact", "{T}: Add {C}{C}.", "", "Ramp", quantity, "main", Set.of());
	}

	@Test
	void aRampSpellNeedsItsColourToBeCast() {
		// Twelve rocks that cost {U} are dead cards in a deck whose lands only make green.
		Speed greenOnly = GoldfishSimulator.simulate(deck(forest(36), blueRock(12), filler(51)), List.of());
		Speed withIslands = GoldfishSimulator.simulate(deck(forest(18), Cards.land("Island", "Basic Land - Island", "({T}: Add {U}.)", 18), blueRock(12), filler(51)),
				List.of());
		assertThat(withIslands.manaByTurn().get(3)).isGreaterThan(greenOnly.manaByTurn().get(3) + 0.4);
	}

	@Test
	void landsThatEnterTappedSlowTheStart() {
		AnalysisCard tapped = land("Tapped Land", "Tapped Land enters tapped. {T}: Add {G}.", 36);
		Speed fast = GoldfishSimulator.simulate(deck(forest(36), filler(63)), List.of());
		Speed slow = GoldfishSimulator.simulate(deck(tapped, filler(63)), List.of());
		assertThat(slow.manaByTurn().get(2)).isLessThan(fast.manaByTurn().get(2) - 0.5);
		// Mana arrives a turn late, so turn 1 has none at all.
		assertThat(slow.manaByTurn().get(0)).isZero();
	}

	@Test
	void landEntryRulesAreReadFromTheText() {
		assertThat(GoldfishSimulator.tap("({T}: add {g}.)")).isEqualTo(GoldfishSimulator.Tap.UNTAPPED);
		assertThat(GoldfishSimulator.tap("this land enters tapped. {t}: add {g}.")).isEqualTo(GoldfishSimulator.Tap.TAPPED);
		assertThat(GoldfishSimulator.tap("this land enters tapped unless you control a plains or an island.")).isEqualTo(GoldfishSimulator.Tap.EARLY);
		assertThat(GoldfishSimulator.tap("this land enters tapped unless you control two or fewer other lands.")).isEqualTo(GoldfishSimulator.Tap.LATE);
		assertThat(GoldfishSimulator.tap("as this land enters, you may pay 2 life. if you don't, it enters tapped.")).isEqualTo(GoldfishSimulator.Tap.UNTAPPED);
	}

	@Test
	void aLoopThatOnlyMakesManaIsNotAGameEndingCombo() {
		ComboInfo manaLoop = new ComboInfo("m", List.of("Piece A", "Piece B"), List.of(), List.of("Infinite colorless mana"), "", "", 4, "R", 100);
		Speed speed = GoldfishSimulator.simulate(deck(forest(36), piece("Piece A", 1, 2), piece("Piece B", 1, 2), filler(61)), List.of(manaLoop));
		assertThat(speed.comboByTurn()).isEmpty();
		assertThat(speed.comboMean()).isNull();
	}

	@Test
	void theAverageComboTurnIsNeverEarlierThanTheTurnItIsReachedByHalfTheGames() {
		AnalysisCard tutor = new AnalysisCard("Demonic Tutor", "{2}", 2, "Sorcery", "Sorcery",
				"Search your library for a card, put that card into your hand, then shuffle.", "", "Tutor", 20, "main", Set.of());
		Speed speed = GoldfishSimulator.simulate(deck(forest(36), piece("Piece A", 1, 2), piece("Piece B", 1, 2), tutor, filler(41)),
				List.of(combo("Piece A", "Piece B", 4)));
		assertThat(speed.comboTurn()).isNotNull();
		assertThat(speed.comboMean()).isGreaterThanOrEqualTo(speed.comboTurn() - 1.0).isLessThanOrEqualTo(12.0);
	}

	@Test
	void aComboWhosePiecesCannotBeCastInTheDecksColoursNeverRuns() {
		AnalysisCard blue = new AnalysisCard("Blue Piece", "{U}{U}", 2, "Creature", "Creature", "", "", null, 1, "main", Set.of());
		AnalysisCard other = piece("Piece B", 1, 2);
		Speed speed = GoldfishSimulator.simulate(deck(forest(36), blue, other, filler(62)), List.of(combo("Blue Piece", "Piece B", 4)));
		assertThat(speed.comboByTurn().get("10")).isZero();
	}

	@Test
	void aFetchLandTaggedAsATutorDoesNotFindComboPieces() {
		AnalysisCard fetch = new AnalysisCard("Scalding Tarn", "", 0, "Land", "Land",
				"{T}, Pay 1 life, Sacrifice this land: Search your library for an Island or Mountain card, put it onto the battlefield, then shuffle.", "", "Tutor",
				20, "main", Set.of());
		List<ComboInfo> combos = List.of(combo("Piece A", "Piece B", 4));
		Speed without = GoldfishSimulator.simulate(deck(forest(16), piece("Piece A", 1, 2), piece("Piece B", 1, 2), filler(61)), combos);
		Speed withFetches = GoldfishSimulator.simulate(deck(forest(16), fetch, piece("Piece A", 1, 2), piece("Piece B", 1, 2), filler(41)), combos);
		// Twenty fetch lands change how many lands there are, but they must not act as twenty free tutors: a tutor deck would be many times likelier.
		assertThat(withFetches.comboByTurn().get("10")).isLessThan(without.comboByTurn().get("10") * 3 + 0.05);
	}
}
