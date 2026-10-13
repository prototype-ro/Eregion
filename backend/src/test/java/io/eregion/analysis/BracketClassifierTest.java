package io.eregion.analysis;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.Test;

import io.eregion.analysis.AnalysisDtos.Bracket;
import io.eregion.analysis.AnalysisDtos.ComboInfo;

class BracketClassifierTest {

	private static AnalysisCard flagged(String name, String flag) {
		return new AnalysisCard(name, "{1}", 1, "Artifact", "Artifact", "", "", null, 1, "main", Set.of(flag));
	}

	private static AnalysisCard tutor(String name, String text) {
		return new AnalysisCard(name, "{1}{B}", 2, "Sorcery", "Sorcery", text, "", "Tutor", 1, "main", Set.of());
	}

	private static List<AnalysisCard> many(String prefix, String flag, int count) {
		List<AnalysisCard> cards = new ArrayList<>();
		for (int i = 0; i < count; i++) {
			cards.add(flagged(prefix + i, flag));
		}
		return cards;
	}

	private static ComboInfo combo(List<String> cards, Integer mana, String... produces) {
		return new ComboInfo("c", cards, List.of(), List.of(produces), "", "", mana, "S", 100);
	}

	/** A combo Commander Spellbook rates at its top tier, the only kind that sets a bracket floor. */
	private static ComboInfo topCombo(List<String> cards, Integer mana, String... produces) {
		return new ComboInfo("c", cards, List.of(), List.of(produces), "", "", mana, "R", 100);
	}

	@Test
	void aPlainDeckIsCoreAndSaysBracketOneIsAboutIntent() {
		Bracket bracket = BracketClassifier.classify(List.of(Cards.spell("Bear", "{1}{G}", 2, "Creature", null, 30)), List.of(), 3.0);
		assertThat(bracket.floor()).isEqualTo(1);
		assertThat(bracket.bracket()).isEqualTo(2);
		assertThat(bracket.basis()).isEqualTo("speed");
		assertThat(bracket.note()).contains("Bracket 1");
	}

	@Test
	void oneToThreeGameChangersFloorAtBracketThree() {
		Bracket bracket = BracketClassifier.classify(many("GC", BracketFlags.GAME_CHANGER, 2), List.of(), 3.0);
		assertThat(bracket.floor()).isEqualTo(3);
		assertThat(bracket.bracket()).isEqualTo(3);
		assertThat(bracket.basis()).isEqualTo("game_changers");
		assertThat(bracket.signals().gameChangerCards()).containsExactly("GC0", "GC1");
	}

	@Test
	void fourGameChangersFloorAtBracketFourAndSayHowMany() {
		Bracket bracket = BracketClassifier.classify(many("GC", BracketFlags.GAME_CHANGER, 4), List.of(), 3.0);
		assertThat(bracket.bracket()).isEqualTo(4);
		assertThat(bracket.whatWouldChange()).anyMatch(text -> text.contains("Cut 1 Game Changers"));
	}

	@Test
	void theCommanderCountsAsAGameChanger() {
		AnalysisCard commander = new AnalysisCard("Kinnan", "{G}{U}", 2, "Creature", "Legendary Creature", "", "GU", null, 1, "commander",
				Set.of(BracketFlags.GAME_CHANGER));
		assertThat(BracketClassifier.classify(List.of(commander), List.of(), 3.0).signals().gameChangers()).isEqualTo(1);
	}

	@Test
	void massLandDenialIsBracketFour() {
		Bracket bracket = BracketClassifier.classify(List.of(flagged("Armageddon", BracketFlags.MASS_LAND_DENIAL)), List.of(), 3.0);
		assertThat(bracket.bracket()).isEqualTo(4);
		assertThat(bracket.basis()).isEqualTo("mass_land_denial");
	}

	@Test
	void extraTurnsOnlyFloorWhenTheyCanChain() {
		assertThat(BracketClassifier.classify(many("T", BracketFlags.EXTRA_TURN, 2), List.of(), 3.0).floor()).isEqualTo(1);
		Bracket chained = BracketClassifier.classify(many("T", BracketFlags.EXTRA_TURN, 3), List.of(), 3.0);
		assertThat(chained.bracket()).isEqualTo(4);
		assertThat(chained.basis()).isEqualTo("extra_turns");
	}

	@Test
	void twoCardComboFloorsByHowEarlyItCanHappen() {
		ComboInfo early = topCombo(List.of("Thassa's Oracle", "Demonic Consultation"), 3, "Win the game");
		ComboInfo late = topCombo(List.of("A", "B"), 9, "Infinite mana");
		assertThat(BracketClassifier.classify(List.of(), List.of(early), 3.0).floor()).isEqualTo(4);
		assertThat(BracketClassifier.classify(List.of(), List.of(late), 3.0).floor()).isEqualTo(3);
	}

	@Test
	void threeCardCombosAndNonWinningPairsSetNoFloor() {
		ComboInfo three = combo(List.of("A", "B", "C"), 5, "Infinite mana");
		ComboInfo pair = combo(List.of("A", "B"), 5, "Draw a card");
		assertThat(BracketClassifier.classify(List.of(), List.of(three, pair), 3.0).floor()).isEqualTo(1);
	}

	@Test
	void unknownCombosAreSaidNotAssumedAway() {
		Bracket bracket = BracketClassifier.classify(List.of(), null, 3.0);
		assertThat(bracket.signals().twoCardCombos()).isNull();
		assertThat(bracket.note()).contains("Combo data was not available");
	}

	@Test
	void tutorsAreSplitByWhetherTheyNameAType() {
		List<AnalysisCard> cards = List.of(
				tutor("Demonic Tutor", "Search your library for a card, put that card into your hand, then shuffle."),
				tutor("Worldly Tutor", "Search your library for a creature card, reveal it, then shuffle and put that card on top."));
		Bracket bracket = BracketClassifier.classify(cards, List.of(), 3.0);
		assertThat(bracket.signals().tutors()).isEqualTo(2);
		assertThat(bracket.signals().unconditionalTutors()).isEqualTo(1);
	}

	private static AnalysisDtos.Speed speedWithComboByEight(double share) {
		return new AnalysisDtos.Speed(800, List.of(1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0), null, java.util.Map.of(), null, null,
				java.util.Map.of("8", share), List.of());
	}

	private static List<AnalysisCard> fiveTutors() {
		List<AnalysisCard> cards = new ArrayList<>();
		for (int i = 0; i < 5; i++) {
			cards.add(tutor("Tutor" + i, "Search your library for a card, put it into your hand."));
		}
		return cards;
	}

	@Test
	void tutorsCountInFullOnlyWhenAComboTendsToBeReady() {
		ComboInfo win = combo(List.of("A", "B"), 3, "Win the game");
		double full = BracketClassifier.classify(fiveTutors(), List.of(win), 3.0, speedWithComboByEight(0.6)).scoreParts().get("Tutors");
		double slow = BracketClassifier.classify(fiveTutors(), List.of(win), 3.0, speedWithComboByEight(0.05)).scoreParts().get("Tutors");
		double none = BracketClassifier.classify(fiveTutors(), List.of(), 3.0, speedWithComboByEight(0.0)).scoreParts().get("Tutors");
		assertThat(full).isEqualTo(3.0);
		assertThat(slow).isLessThan(full).isGreaterThan(none);
		// With no combo at all they keep the floor: they are still card selection.
		assertThat(none).isEqualTo(2.25);
	}

	@Test
	void whenCombosAreUnknownNothingIsDiscounted() {
		double unknown = BracketClassifier.classify(fiveTutors(), null, 3.0, speedWithComboByEight(0.0)).scoreParts().get("Tutors");
		double notSimulated = BracketClassifier.classify(fiveTutors(), List.of(), 3.0, null).scoreParts().get("Tutors");
		assertThat(unknown).isEqualTo(3.0);
		assertThat(notSimulated).isEqualTo(3.0);
	}

	@Test
	void comboPointsAreScaledTheSameWay() {
		ComboInfo late = combo(List.of("A", "B"), 9, "Win the game");
		double slow = BracketClassifier.classify(List.of(), List.of(late), 3.0, speedWithComboByEight(0.0)).scoreParts().get("Combos");
		double ready = BracketClassifier.classify(List.of(), List.of(late), 3.0, speedWithComboByEight(0.5)).scoreParts().get("Combos");
		assertThat(ready).isEqualTo(1.0);
		assertThat(slow).isEqualTo(0.6);
	}

	@Test
	void aFetchLandIsNotATutor() {
		AnalysisCard fetch = new AnalysisCard("Scalding Tarn", "", 0, "Land", "Land", "{T}, Pay 1 life, Sacrifice this land: Search your library for an Island or Mountain card, put it onto the battlefield, then shuffle.",
				"", "Tutor", 1, "main", Set.of());
		List<AnalysisCard> cards = List.of(fetch, tutor("Demonic Tutor", "Search your library for a card, put that card into your hand, then shuffle."));
		Bracket bracket = BracketClassifier.classify(cards, List.of(), 3.0);
		assertThat(bracket.signals().tutors()).isEqualTo(1);
		assertThat(bracket.scoreParts().get("Tutors")).isEqualTo(0.6);
	}

	@Test
	void theWholeKitIsNeededForBracketFive() {
		List<AnalysisCard> cards = new ArrayList<>();
		cards.addAll(many("GC", BracketFlags.GAME_CHANGER, 8));
		cards.addAll(many("FM", BracketFlags.FAST_MANA, 4));
		for (int i = 0; i < 6; i++) {
			cards.add(tutor("Tutor" + i, "Search your library for a card, put it into your hand."));
		}
		ComboInfo win = combo(List.of("Thassa's Oracle", "Demonic Consultation"), 3, "Win the game");
		assertThat(BracketClassifier.classify(cards, List.of(win), 2.0).bracket()).isEqualTo(5);
		assertThat(BracketClassifier.classify(cards, List.of(), 2.0).bracket()).isEqualTo(4);
	}

	@Test
	void simulatedSpeedRaisesTheScoreAndAbsentSpeedChangesNothing() {
		java.util.Map<String, Double> byTurn = java.util.Map.of("6", 0.5);
		AnalysisDtos.Speed fast = new AnalysisDtos.Speed(800, List.of(1.0, 2.0, 4.5, 5.0, 6.0, 7.0, 8.0, 9.0), 3.0, java.util.Map.of(), 5.0, 5.0, byTurn, List.of());
		Bracket base = BracketClassifier.classify(List.of(), List.of(), 3.0);
		Bracket quick = BracketClassifier.classify(List.of(), List.of(), 3.0, fast);
		assertThat(quick.score()).isGreaterThan(base.score());
		assertThat(quick.scoreParts()).containsKeys("Fast start", "Combo by turn 6");
		assertThat(BracketClassifier.classify(List.of(), List.of(), 3.0, null).score()).isEqualTo(base.score());
	}

	@Test
	void aComboThatOnlyMakesManaScoresLessThanOneThatEndsTheGame() {
		ComboInfo mana = combo(List.of("Rings of Brighthearth", "Basalt Monolith"), 3, "Infinite colorless mana");
		ComboInfo win = combo(List.of("Thassa's Oracle", "Demonic Consultation"), 3, "Win the game");
		assertThat(mana.endsGame()).isFalse();
		assertThat(win.endsGame()).isTrue();
		Bracket engine = BracketClassifier.classify(List.of(), List.of(mana), 3.0);
		Bracket ending = BracketClassifier.classify(List.of(), List.of(win), 3.0);
		assertThat(engine.score()).isLessThan(ending.score());
		assertThat(engine.score()).isGreaterThan(0);
		// Rated at Spellbook's top tier, so it still sets the floor.
		assertThat(BracketClassifier.classify(List.of(), List.of(topCombo(List.of("Rings of Brighthearth", "Basalt Monolith"), 2, "Infinite colorless mana")), 3.0).floor())
				.isEqualTo(4);
	}

	@Test
	void onlyAComboAtSpellbooksTopTierSetsAFloor() {
		ComboInfo spicy = new ComboInfo("s", List.of("Mikaeus, the Unhallowed", "Triskelion"), List.of(), List.of("Infinite damage"), "", "", 0, "S", 8000);
		ComboInfo oddball = new ComboInfo("o", List.of("A", "B"), List.of(), List.of("Infinite damage"), "", "", 8, "O", 100);
		ComboInfo top = topCombo(List.of("Rings of Brighthearth", "Basalt Monolith"), 2, "Infinite colorless mana");
		ComboInfo unrated = new ComboInfo("u", List.of("A", "B"), List.of(), List.of("Win the game"), "", "", 3, "", 100);
		assertThat(BracketClassifier.classify(List.of(), List.of(spicy), 3.0).floor()).isEqualTo(1);
		assertThat(BracketClassifier.classify(List.of(), List.of(oddball), 3.0).floor()).isEqualTo(1);
		assertThat(BracketClassifier.classify(List.of(), List.of(top), 3.0).floor()).isEqualTo(4);
		// With no rating the plain rule applies, so a missing tier never lowers a bracket.
		assertThat(BracketClassifier.classify(List.of(), List.of(unrated), 3.0).floor()).isEqualTo(4);
		// A lower tier combo is still counted as a combo in the signals.
		assertThat(BracketClassifier.classify(List.of(), List.of(spicy), 3.0).signals().twoCardCombos()).isEqualTo(1);
	}

	@Test
	void tutorsAreWeightedByHowFreelyTheyFindACard() {
		assertThat(BracketClassifier.tutorWeight("Search your library for a card, put that card into your hand, then shuffle.")).isEqualTo(1.0);
		assertThat(BracketClassifier.tutorWeight("Search your library for a creature card, reveal it, put it into your hand.")).isEqualTo(0.7);
		assertThat(BracketClassifier.tutorWeight("Search your library for up to three creature cards, put them into your graveyard.")).isEqualTo(0.7);
		assertThat(BracketClassifier.tutorWeight("Search your library for an Aura card, reveal it, put it into your hand.")).isEqualTo(0.4);
		assertThat(BracketClassifier.tutorWeight("Search your library for a card named Sol Ring, put it into your hand.")).isEqualTo(0.4);
		List<AnalysisCard> cards = List.of(
				tutor("Demonic Tutor", "Search your library for a card, put that card into your hand, then shuffle."),
				tutor("Diabolic Intent", "Search your library for a creature card, put it into your hand."));
		Bracket bracket = BracketClassifier.classify(cards, List.of(), 3.0);
		assertThat(bracket.signals().weightedTutors()).isEqualTo(1.7);
		assertThat(bracket.signals().tutors()).isEqualTo(2);
		assertThat(bracket.signals().unconditionalTutors()).isEqualTo(1);
	}

	private static List<AnalysisCard> reanimators(int count) {
		List<AnalysisCard> cards = new ArrayList<>();
		for (int i = 0; i < count; i++) {
			cards.add(new AnalysisCard("Reanimate " + i, "{1}{B}", 2, "Sorcery", "Sorcery",
					"Put target creature card from a graveyard onto the battlefield under your control.", "", null, 1, "main", Set.of()));
		}
		return cards;
	}

	@Test
	void reanimationAddsSpeedOnlyBeyondWhatManyDecksPlay() {
		assertThat(BracketClassifier.classify(reanimators(5), List.of(), 3.0).scoreParts()).doesNotContainKey("Reanimation");
		assertThat(BracketClassifier.classify(reanimators(6), List.of(), 3.0).scoreParts().get("Reanimation")).isEqualTo(0.15);
		assertThat(BracketClassifier.classify(reanimators(12), List.of(), 3.0).scoreParts().get("Reanimation")).isEqualTo(1.05);
		assertThat(BracketClassifier.classify(reanimators(40), List.of(), 3.0).scoreParts().get("Reanimation")).isEqualTo(1.5);
	}

	@Test
	void reanimationIsReadFromTheRulesText() {
		assertThat(BracketClassifier.isReanimation("Each player puts a creature card from their graveyard onto the battlefield.")).isTrue();
		assertThat(BracketClassifier.isReanimation("Enchant creature card in a graveyard. When this enters, put enchanted card onto the battlefield.")).isTrue();
		assertThat(BracketClassifier.isReanimation("Return target creature card from your graveyard to your hand.")).isFalse();
		assertThat(BracketClassifier.isReanimation("Put a creature card from your hand onto the battlefield.")).isFalse();
	}

	@Test
	void whatEndsAGameIsReadFromWhatTheComboProduces() {
		assertThat(combo(List.of("A", "B"), 3, "Near-infinite damage").endsGame()).isTrue();
		assertThat(combo(List.of("A", "B"), 3, "Target opponent loses the game").endsGame()).isTrue();
		assertThat(combo(List.of("A", "B"), 3, "Infinite combat phases").endsGame()).isTrue();
		assertThat(combo(List.of("A", "B"), 3, "Infinite creature ETB").endsGame()).isFalse();
		assertThat(combo(List.of("A", "B"), 3, "Infinite lifegain").endsGame()).isFalse();
		assertThat(combo(List.of("A", "B"), 3, "Infinite colorless mana").winsOrLoops()).isTrue();
	}

	@Test
	void sideboardsAreIgnored() {
		AnalysisCard maybe = new AnalysisCard("Mana Crypt", "{0}", 0, "Artifact", "Artifact", "", "", null, 1, "maybe", Set.of(BracketFlags.GAME_CHANGER));
		assertThat(BracketClassifier.classify(List.of(maybe), List.of(), 3.0).signals().gameChangers()).isZero();
	}
}
