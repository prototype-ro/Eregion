package io.eregion.card;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class FunctionalRulesTest {

	private final FunctionalRules rules = FunctionalRules.load();

	@Test
	void spotRemovalIsRecognised() {
		assertThat(rules.match("Destroy target creature. Its controller gains life equal to its power.")).containsKey("Removal");
		assertThat(rules.match("Exile target nonland permanent.")).containsKey("Removal");
	}

	@Test
	void aBoardWipeIsABoardWipeAndNotJustRemoval() {
		assertThat(rules.match("Destroy all creatures. They can't be regenerated.")).containsKey("Board Wipe");
		assertThat(rules.match("Exile all other nonland permanents.")).containsKey("Board Wipe");
	}

	@Test
	void drawingCardsIsRecognised() {
		assertThat(rules.match("When this enters, draw two cards.")).containsKey("Card Draw");
		assertThat(rules.match("Draw a card.")).containsKey("Card Draw");
	}

	@Test
	void rampMeansLandSearchOrManaAbilitiesButASearchForANonLandCardIsATutor() {
		assertThat(rules.match("Search your library for a basic land card, put it onto the battlefield tapped.")).containsKey("Ramp").doesNotContainKey("Tutor");
		assertThat(rules.match("{T}: Add {G}.")).containsKey("Ramp");
		assertThat(rules.match("Search your library for a creature card, reveal it, and put it into your hand.")).containsKey("Tutor").doesNotContainKey("Ramp");
	}

	@Test
	void aCardCanMatchSeveralRolesAndEachKeepsItsOwnConfidence() {
		var found = rules.match("Counter target spell. Draw a card.");

		assertThat(found).containsKeys("Counterspell", "Card Draw");
		assertThat(found.get("Counterspell")).isGreaterThan(found.get("Card Draw"));
	}

	@Test
	void everyGuessScoresBelowACommunityTag() {
		var found = rules.match("Destroy all creatures. You win the game. Draw a card. Counter target spell.");

		assertThat(found.values()).allMatch(confidence -> confidence < 1.0);
	}

	@Test
	void textWithNoPatternOrNoTextMatchesNothing() {
		assertThat(rules.match("Flying, lifelink")).isEmpty();
		assertThat(rules.match("")).isEmpty();
		assertThat(rules.match(null)).isEmpty();
	}

	@Test
	void theNewerRolesAreRecognised() {
		assertThat(rules.match("After this main phase, there is an additional combat phase.")).containsKey("Extra Combat");
		assertThat(rules.match("Your opponents can't cast spells during your turn.")).containsKey("Stax");
		assertThat(rules.match("Noncreature spells cost {1} more to cast.")).containsKey("Stax");
		assertThat(rules.match("At the beginning of your upkeep, create a 1/1 white Soldier creature token.")).containsKey("Tokens");
		assertThat(rules.match("Whenever this attacks, you gain 2 life.")).containsKey("Lifegain");
	}

	@Test
	void aCreatureThatComesBackWhenItDiesIsRecursionButAFlickerIsNot() {
		assertThat(rules.match("Whenever Avacyn or another nontoken creature you control dies, return that card to the battlefield under your control at the beginning of the next end step.")).containsKey("Recursion");
		assertThat(rules.match("Exile target creature you control, then return it to the battlefield under your control.")).doesNotContainKey("Recursion");
	}
}
