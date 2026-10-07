package io.eregion.generate;

import java.util.List;
import java.util.Optional;

/**
 * A way of playing, expressed as Scryfall searches. Each theme is a search (without the color
 * identity, legality and price parts, which the generator adds), a weight for how many of the
 * deck's theme slots it should get, and the tag its cards receive in the deck.
 */
public record Playstyle(String id, String label, String description, List<Theme> themes) {

	public record Theme(String tag, String query, int weight) {
	}

	private static Theme t(String tag, String query, int weight) {
		return new Theme(tag, query, weight);
	}

	public static final List<Playstyle> ALL = List.of(
			new Playstyle("aggro", "Aggro", "Cheap creatures that hit early and often.", List.of(
					t("Early creatures", "t:creature cmc<=3 -t:land", 4),
					t("Haste and speed", "otag:gives-haste", 2),
					t("Anthems", "otag:anthem", 2),
					t("Evasion", "t:creature otag:evasion cmc<=4", 2))),
			new Playstyle("control", "Control", "Answer everything, then win with what is left.", List.of(
					t("Counterspells", "otag:counterspell", 4),
					t("More removal", "otag:removal cmc>=3 -t:land", 2),
					t("Tutors", "otag:tutor", 1),
					t("Recursion", "otag:recursion", 1))),
			new Playstyle("combo", "Combo", "Assemble a short sequence of cards that wins on the spot.", List.of(
					t("Tutors", "otag:tutor", 3),
					t("Cost reduction", "otag:cost-reducer", 2),
					t("Untappers", "otag:untapper", 2),
					t("Rituals", "otag:ritual", 1),
					t("Cheat into play", "otag:cheat-into-play", 1))),
			new Playstyle("tokens", "Tokens", "Fill the board with creatures and make them bigger.", List.of(
					t("Token makers", "o:\"create\" o:\"creature token\" -o:\"its controller creates\" -t:land", 5),
					t("Token synergy", "otag:synergy-token", 3),
					t("Anthems", "otag:anthem", 2))),
			new Playstyle("voltron", "Voltron", "Load up one creature with gear and attack.", List.of(
					t("Equipment", "t:equipment", 4),
					t("Auras", "t:aura", 2),
					t("Protection", "otag:protection", 2),
					t("Extra combat", "otag:extra-combat", 1))),
			new Playstyle("graveyard", "Graveyard", "Fill the graveyard, then bring things back.", List.of(
					t("Recursion", "otag:recursion", 3),
					t("Reanimation", "otag:reanimate", 3),
					t("Self-mill", "otag:mill", 1),
					t("Discard", "otag:discard", 1))),
			new Playstyle("sacrifice", "Sacrifice", "Trade your own permanents for value.", List.of(
					t("Sacrifice outlets", "otag:sacrifice-outlet", 3),
					t("Sacrifice synergy", "otag:synergy-sacrifice", 3),
					t("Death triggers", "o:\"whenever a creature you control dies\"", 2))),
			new Playstyle("spellslinger", "Spellslinger", "Cast lots of instants and sorceries.", List.of(
					t("Spell synergy", "otag:synergy-instant", 4),
					t("Cantrips", "otag:cantrip", 2),
					t("Spell copy", "otag:copy-spell", 1),
					t("Cost reduction", "otag:cost-reducer", 1))),
			new Playstyle("lifegain", "Lifegain", "Gain life and turn it into an advantage.", List.of(
					t("Lifegain", "otag:lifegain", 4),
					t("Lifegain synergy", "otag:synergy-lifegain", 4))),
			new Playstyle("counters", "Counters", "Grow your creatures with +1/+1 counters.", List.of(
					t("Counters", "otag:counters-matter", 6),
					t("Proliferate", "o:proliferate", 2))),
			new Playstyle("landfall", "Landfall", "Play lots of lands and get paid for each one.", List.of(
					t("Landfall", "otag:landfall", 4),
					t("Land ramp", "otag:land-ramp", 3),
					t("Extra land drops", "o:\"additional land\"", 1))),
			new Playstyle("blink", "Blink", "Flicker creatures to reuse their enter-the-battlefield effects.", List.of(
					t("Flicker", "otag:flicker", 4),
					t("Enter effects", "t:creature o:\"enters\" -t:land", 3))),
			new Playstyle("goodstuff", "Good stuff", "No theme. The best cards in your colors.", List.of(
					t("Strong creatures", "t:creature -t:land", 4),
					t("Strong artifacts", "t:artifact -t:creature", 2),
					t("Strong enchantments", "t:enchantment -t:creature", 2))));

	public static Optional<Playstyle> byId(String id) {
		return ALL.stream().filter(style -> style.id().equals(id)).findFirst();
	}
}
