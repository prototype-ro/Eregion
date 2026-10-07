package io.eregion.deck;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import io.eregion.deck.DeckLegality.Line;

class DeckLegalityTest {

	private static Line card(String name, String board, int quantity, String identity, String typeLine, String oracle) {
		return new Line(UUID.nameUUIDFromBytes(name.getBytes()), name, board, quantity, identity, typeLine, oracle);
	}

	private static Line commander(String identity) {
		return card("Boss", "commander", 1, identity, "Legendary Creature - Human", "");
	}

	/** A deck of 99 different cards inside white. */
	private static List<Line> legalDeck() {
		List<Line> lines = new ArrayList<>();
		lines.add(commander("WU"));
		for (int i = 0; i < 99; i++) {
			lines.add(card("Card " + i, "main", 1, "W", "Instant", ""));
		}
		return lines;
	}

	@Test
	void aFullSingletonDeckInsideTheColorsIsLegal() {
		assertThat(DeckLegality.issues(legalDeck())).isEmpty();
	}

	@Test
	void wrongSizeIsReportedEitherWay() {
		var shortDeck = legalDeck().subList(0, 99);
		var longDeck = new ArrayList<>(legalDeck());
		longDeck.add(card("Extra", "main", 1, "", "Instant", ""));

		assertThat(DeckLegality.issues(shortDeck)).contains("1 card short of 100.");
		assertThat(DeckLegality.issues(longDeck)).contains("1 card over 100.");
	}

	@Test
	void boardsOtherThanMainAndCommanderDoNotCount() {
		var lines = new ArrayList<>(legalDeck());
		lines.add(card("Maybe", "maybe", 1, "R", "Instant", ""));

		assertThat(DeckLegality.issues(lines)).isEmpty();
	}

	@Test
	void noCommanderAndNonLeadersAreReported() {
		assertThat(DeckLegality.issues(legalDeck().subList(1, 100))).contains("No commander chosen.");

		var lines = new ArrayList<>(legalDeck());
		lines.set(0, card("Elf", "commander", 1, "G", "Creature - Elf", ""));
		assertThat(DeckLegality.issues(lines)).anyMatch(issue -> issue.contains("cannot be a commander"));
	}

	@Test
	void twoCommandersNeedPartner() {
		var lines = new ArrayList<>(legalDeck().subList(0, 99));
		lines.set(0, card("A", "commander", 1, "W", "Legendary Creature - Human", "Partner"));
		lines.add(card("B", "commander", 1, "W", "Legendary Creature - Human", "Partner"));
		assertThat(DeckLegality.issues(lines)).isEmpty();

		lines.set(lines.size() - 1, card("B", "commander", 1, "W", "Legendary Creature - Human", ""));
		assertThat(DeckLegality.issues(lines)).anyMatch(issue -> issue.startsWith("Only one commander"));
	}

	@Test
	void duplicatesAreIllegalExceptBasicsAndAnyNumberCards() {
		var lines = new ArrayList<>(legalDeck().subList(0, 98));
		lines.add(card("Sol Ring", "main", 2, "", "Artifact", ""));
		assertThat(DeckLegality.issues(lines)).contains("Only one copy of each card is allowed: Sol Ring (2).");

		var basics = new ArrayList<>(legalDeck().subList(0, 90));
		basics.add(card("Plains", "main", 10, "W", "Basic Land - Plains", ""));
		assertThat(DeckLegality.issues(basics)).isEmpty();

		var rats = new ArrayList<>(legalDeck().subList(0, 90));
		rats.add(card("Rats", "main", 10, "B", "Creature - Rat", "A deck can have any number of cards named Rats."));
		assertThat(DeckLegality.issues(rats)).anyMatch(issue -> issue.contains("Outside")).noneMatch(issue -> issue.contains("Only one copy"));
	}

	@Test
	void cardsOutsideTheCommandersColorsAreNamed() {
		var lines = new ArrayList<>(legalDeck().subList(0, 99));
		lines.add(card("Lightning Bolt", "main", 1, "R", "Instant", ""));

		assertThat(DeckLegality.issues(lines)).contains("Outside the commander's colors: Lightning Bolt.");
	}

	@Test
	void colorlessCardsFitAnyCommander() {
		var lines = new ArrayList<>(legalDeck().subList(0, 99));
		lines.add(card("Rock", "main", 1, "", "Artifact", ""));

		assertThat(DeckLegality.issues(lines)).isEmpty();
	}

	@Test
	void identityListsTheCommandersColorsInGameOrder() {
		assertThat(DeckLegality.identity(List.of(card("A", "commander", 1, "GUB", "Legendary Creature", ""), card("B", "main", 1, "R", "Instant", "")))).isEqualTo("UBG");
		assertThat(DeckLegality.identity(List.of())).isEmpty();
	}
}
