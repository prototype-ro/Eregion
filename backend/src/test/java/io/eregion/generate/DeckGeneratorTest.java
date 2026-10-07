package io.eregion.generate;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;

import org.junit.jupiter.api.Test;

import io.eregion.card.Card;

class DeckGeneratorTest {

	private static Card card(String typeLine, String oracle, String identity) {
		return new Card(UUID.randomUUID(), UUID.randomUUID(), "Test", "", 0, typeLine, "Creature", identity, identity, oracle,
				"tst", "Test", "1", "rare", "Artist", null, "", "", "");
	}

	@Test
	void legendaryCreaturesCanLead() {
		assertThat(DeckGenerator.canLead(card("Legendary Creature - Angel", "", "W"))).isTrue();
	}

	@Test
	void otherLegendariesCanLeadOnlyWhenTheirTextSaysSo() {
		assertThat(DeckGenerator.canLead(card("Legendary Planeswalker - Teferi", "Teferi can be your commander.", "WU"))).isTrue();
		assertThat(DeckGenerator.canLead(card("Legendary Artifact", "", ""))).isFalse();
	}

	@Test
	void nonLegendaryCardsCannotLead() {
		assertThat(DeckGenerator.canLead(card("Creature - Elf", "", "G"))).isFalse();
		assertThat(DeckGenerator.canLead(card("Artifact", "", ""))).isFalse();
	}

	@Test
	void aCardFitsWhenAllItsColorsAreInTheCommandersColors() {
		assertThat(DeckGenerator.fitsIdentity(card("Instant", "", "WU"), "WUBG")).isTrue();
		assertThat(DeckGenerator.fitsIdentity(card("Instant", "", ""), "G")).isTrue();
		assertThat(DeckGenerator.fitsIdentity(card("Instant", "", "WR"), "WUBG")).isFalse();
	}

	@Test
	void everyColorlessCardFitsAnyCommanderAndOnlyThoseFitAColorlessOne() {
		assertThat(DeckGenerator.fitsIdentity(card("Artifact", "", ""), "")).isTrue();
		assertThat(DeckGenerator.fitsIdentity(card("Instant", "", "G"), "")).isFalse();
	}
}
