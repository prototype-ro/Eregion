package io.eregion.analysis;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.Test;

import io.eregion.analysis.AnalysisDtos.Engine;

class EngineClassifierTest {

	private static final EngineClassifier CLASSIFIER = EngineClassifier.load();

	private static AnalysisCard text(String name, String type, String typeLine, String oracle, String role, int quantity) {
		return new AnalysisCard(name, "{2}", 2, type, typeLine, oracle, "", role, quantity, "main", Set.of());
	}

	private static List<AnalysisCard> filler(int count) {
		return List.of(text("Vanilla", "Creature", "Creature - Bear", "", null, count));
	}

	@Test
	void aTokenDeckIsLabelledTokens() {
		List<AnalysisCard> cards = new ArrayList<>(filler(12));
		cards.add(text("Raise", "Sorcery", "Sorcery", "Create three 1/1 white Soldier creature tokens.", null, 10));
		cards.add(text("Anthem", "Enchantment", "Enchantment", "Tokens you control get +1/+1.", null, 4));
		Engine engine = CLASSIFIER.classify(cards);
		assertThat(engine.primary()).isEqualTo("Tokens");
	}

	@Test
	void aDeckOfTheTypeItsCommanderRewardsIsThatTribe() {
		List<AnalysisCard> cards = new ArrayList<>(filler(4));
		cards.add(new AnalysisCard("Miirym, Sentinel Wyrm", "{3}{G}{U}{R}", 6, "Creature", "Legendary Creature - Dragon Spirit",
				"Flying, ward {2}. Whenever another nontoken Dragon you control enters, create a token that's a copy of it.", "GUR", "Stax", 1,
				"commander", Set.of()));
		cards.add(text("Dragon", "Creature", "Creature - Dragon", "Flying", null, 12));
		cards.add(text("Counter A", "Instant", "Instant", "Counter target spell.", "Counterspell", 10));
		cards.add(text("Wipe", "Sorcery", "Sorcery", "", "Board Wipe", 6));
		Engine engine = CLASSIFIER.classify(cards);
		assertThat(engine.primary()).isEqualTo("Dragon tribal");
		assertThat(engine.runnerUp()).isEqualTo("Control");
		assertThat(engine.signatureCards()).contains("Dragon");
	}

	@Test
	void aTribeTheCommanderDoesNotAskForStaysASideNote() {
		List<AnalysisCard> cards = new ArrayList<>(filler(4));
		cards.add(text("Dragon", "Creature", "Creature - Dragon", "Flying", null, 12));
		cards.add(text("Counter A", "Instant", "Instant", "Counter target spell.", "Counterspell", 10));
		cards.add(text("Wipe", "Sorcery", "Sorcery", "", "Board Wipe", 6));
		Engine engine = CLASSIFIER.classify(cards);
		assertThat(engine.primary()).isEqualTo("Control");
		assertThat(engine.tribe()).isEqualTo("Dragon");
	}

	@Test
	void signatureCardsAreTheOnesThatLeanMost() {
		List<AnalysisCard> cards = new ArrayList<>(filler(12));
		cards.add(text("Raise", "Sorcery", "Sorcery", "Create three 1/1 white Soldier creature tokens.", null, 10));
		assertThat(CLASSIFIER.classify(cards).signatureCards()).containsExactly("Raise");
	}

	@Test
	void aCloseSecondThemeMakesTheLabelACloseCall() {
		List<AnalysisCard> cards = new ArrayList<>(filler(10));
		cards.add(text("Raise", "Sorcery", "Sorcery", "Create two 1/1 tokens.", null, 8));
		cards.add(text("Grow", "Sorcery", "Sorcery", "Put a +1/+1 counter on target creature.", null, 8));
		Engine engine = CLASSIFIER.classify(cards);
		assertThat(engine.ambiguous()).isTrue();
		assertThat(engine.runnerUp()).isNotNull();
	}

	@Test
	void roleAndTypeContributeToTheScore() {
		List<AnalysisCard> cards = new ArrayList<>(filler(10));
		cards.add(text("Counter A", "Instant", "Instant", "Counter target spell.", "Counterspell", 10));
		cards.add(text("Wipe", "Sorcery", "Sorcery", "", "Board Wipe", 6));
		assertThat(CLASSIFIER.classify(cards).primary()).isEqualTo("Control");
	}

	@Test
	void everyDecksRemovalAndInstantsDoNotMakeItControlOrSpellslinger() {
		List<AnalysisCard> cards = new ArrayList<>(filler(40));
		cards.add(text("Doom Blade", "Instant", "Instant", "Destroy target nonblack creature.", "Removal", 8));
		cards.add(text("Opt", "Instant", "Instant", "Scry 1, then draw a card.", null, 6));
		assertThat(CLASSIFIER.classify(cards).primary()).isEqualTo(EngineClassifier.NO_THEME);
	}

	@Test
	void aDeckWithNothingInParticularIsGoodstuff() {
		Engine engine = CLASSIFIER.classify(filler(30));
		assertThat(engine.primary()).isEqualTo(EngineClassifier.NO_THEME);
		assertThat(engine.runnerUp()).isNull();
		assertThat(engine.ambiguous()).isFalse();
	}

	@Test
	void tooFewSpellsSaysNothing() {
		assertThat(CLASSIFIER.classify(filler(5))).isNull();
	}

	@Test
	void findsAnElfTribeButNotAMixedBag() {
		List<AnalysisCard> elves = new ArrayList<>();
		elves.add(text("Elf", "Creature", "Creature — Elf Druid", "", null, 9));
		elves.add(text("Goblin", "Creature", "Creature — Goblin", "", null, 3));
		assertThat(CLASSIFIER.classify(padded(elves)).tribe()).isEqualTo("Elf");

		List<AnalysisCard> mixed = new ArrayList<>();
		for (String type : List.of("Elf", "Goblin", "Human", "Angel", "Zombie", "Cat")) {
			mixed.add(text(type, "Creature", "Creature — " + type, "", null, 3));
		}
		assertThat(CLASSIFIER.classify(padded(mixed)).tribe()).isNull();
	}

	private static List<AnalysisCard> padded(List<AnalysisCard> cards) {
		List<AnalysisCard> padded = new ArrayList<>(cards);
		padded.add(text("Spell", "Sorcery", "Sorcery", "", null, 10));
		return padded;
	}
}
