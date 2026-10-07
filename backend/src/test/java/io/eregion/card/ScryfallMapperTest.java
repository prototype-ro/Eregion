package io.eregion.card;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;

import io.eregion.card.ScryfallCard.Face;
import io.eregion.card.ScryfallCard.ImageUris;

class ScryfallMapperTest {

	@Test
	void groupsCardsByTheirPrimaryType() {
		assertThat(ScryfallMapper.primaryType("Legendary Creature — Phyrexian Angel Horror")).isEqualTo("Creature");
		assertThat(ScryfallMapper.primaryType("Artifact Creature — Golem")).isEqualTo("Creature");
		assertThat(ScryfallMapper.primaryType("Enchantment Creature — God")).isEqualTo("Creature");
		assertThat(ScryfallMapper.primaryType("Legendary Planeswalker — Jace")).isEqualTo("Planeswalker");
		assertThat(ScryfallMapper.primaryType("Kindred Instant — Elf")).isEqualTo("Instant");
		assertThat(ScryfallMapper.primaryType("Sorcery")).isEqualTo("Sorcery");
		assertThat(ScryfallMapper.primaryType("Legendary Artifact")).isEqualTo("Artifact");
		assertThat(ScryfallMapper.primaryType("Enchantment — Aura")).isEqualTo("Enchantment");
	}

	@Test
	void landsWinOverOtherTypes() {
		assertThat(ScryfallMapper.primaryType("Basic Land — Forest")).isEqualTo("Land");
		assertThat(ScryfallMapper.primaryType("Artifact Land")).isEqualTo("Land");
		assertThat(ScryfallMapper.primaryType("Land Creature — Forest Dryad")).isEqualTo("Land");
	}

	@Test
	void doubleFacedCardsUseTheFrontFaceOnly() {
		assertThat(ScryfallMapper.primaryType("Creature — Human Werewolf // Creature — Werewolf"))
				.isEqualTo("Creature");
		assertThat(ScryfallMapper.primaryType("Creature — Elder // Land")).isEqualTo("Creature");
	}

	@Test
	void unknownTypesFallBackToOther() {
		assertThat(ScryfallMapper.primaryType("Conspiracy")).isEqualTo("Other");
	}

	@Test
	void colorsAreWrittenInWubrgOrder() {
		assertThat(ScryfallMapper.colorString(List.of("B", "W", "G", "U"))).isEqualTo("WUBG");
		assertThat(ScryfallMapper.colorString(List.of())).isEmpty();
		assertThat(ScryfallMapper.colorString(null)).isEmpty();
	}

	@Test
	void mapsASingleFacedCard() {
		ScryfallCard source = new ScryfallCard(
				"d0d33d52-3d28-4635-b985-51e126289259", "Atraxa, Praetors' Voice", "{G}{W}{U}{B}", 4.0,
				"Legendary Creature — Phyrexian Angel Horror", List.of("W", "U", "B", "G"),
				List.of("W", "U", "B", "G"), "Flying", "c16", "Commander 2016", "10", "2016-11-11", "mythic",
				"Victor Adame Minguez", new ScryfallCard.Prices("12.50", null, null),
				new ImageUris("small.jpg", "normal.jpg", "art.jpg"), null);

		Card card = ScryfallMapper.toCard(source);

		assertThat(card.name()).isEqualTo("Atraxa, Praetors' Voice");
		assertThat(card.manaValue()).isEqualTo(4.0);
		assertThat(card.primaryType()).isEqualTo("Creature");
		assertThat(card.colorIdentity()).isEqualTo("WUBG");
		assertThat(card.imageArtCrop()).isEqualTo("art.jpg");
		assertThat(card.priceUsd()).isEqualTo(12.5);
		assertThat(card.setName()).isEqualTo("Commander 2016");
		assertThat(card.collectorNumber()).isEqualTo("10");
	}

	@Test
	void priceFallsBackToFoilThenNothing() {
		assertThat(ScryfallMapper.price(new ScryfallCard.Prices(null, "3.20", null))).isEqualTo(3.2);
		assertThat(ScryfallMapper.price(new ScryfallCard.Prices("", null, "9.99"))).isEqualTo(9.99);
		assertThat(ScryfallMapper.price(new ScryfallCard.Prices(null, null, null))).isNull();
		assertThat(ScryfallMapper.price(null)).isNull();
	}

	@Test
	void mapsAPrintingFromAnyFace() {
		ScryfallCard source = new ScryfallCard(
				"22222222-2222-2222-2222-222222222222", "Sol Ring", "{1}", 1.0, "Artifact", List.of(), List.of(),
				"{T}: Add {C}{C}.", "cmd", "Commander 2011", "250", "2011-06-17", "uncommon", "Mark Tedin",
				new ScryfallCard.Prices("1.10", null, null), new ImageUris("s.jpg", "n.jpg", "a.jpg"), null);
		java.util.UUID cardId = java.util.UUID.randomUUID();

		Printing printing = ScryfallMapper.toPrinting(source, cardId);

		assertThat(printing.cardId()).isEqualTo(cardId);
		assertThat(printing.setCode()).isEqualTo("cmd");
		assertThat(printing.releasedAt()).isEqualTo("2011-06-17");
		assertThat(printing.priceUsd()).isEqualTo(1.1);
	}

	@Test
	void mapsADoubleFacedCardFromItsFrontFace() {
		Face front = new Face("Delver of Secrets", "{U}", "Creature — Human Wizard", "At the beginning...",
				"Artist One", new ImageUris("s.jpg", "n.jpg", "a.jpg"));
		Face back = new Face("Insectile Aberration", "", "Creature — Human Insect", "Flying", "Artist One", null);
		ScryfallCard source = new ScryfallCard(
				"11111111-1111-1111-1111-111111111111", "Delver of Secrets // Insectile Aberration", null, 1.0, null,
				List.of(), List.of("U"), null, "isd", "Innistrad", "51", "2011-09-30", "common", null, null, null,
				List.of(front, back));

		Card card = ScryfallMapper.toCard(source);

		assertThat(card.manaCost()).isEqualTo("{U}");
		assertThat(card.typeLine()).isEqualTo("Creature — Human Wizard");
		assertThat(card.primaryType()).isEqualTo("Creature");
		assertThat(card.artist()).isEqualTo("Artist One");
		assertThat(card.imageSmall()).isEqualTo("s.jpg");
	}
}
