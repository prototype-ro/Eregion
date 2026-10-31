package io.eregion.proxy;

import java.util.List;
import java.util.UUID;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/** The structured lore document of a deck: the setting's cosmology, spectrum, colours, characters, naming and gaps. */
public final class LoreDtos {

	private LoreDtos() {
	}

	/**
	 * How a spectrum tier is corrupted. ADDITION mutates the subject but keeps its personhood and agency; ERASURE
	 * subtracts until the subject loses its name and face and keeps only a title or function.
	 */
	public enum Mechanism {
		ADDITION, ERASURE
	}

	public record Cosmology(String maker, List<String> spirits, String corruptor) {
	}

	/** One tier of the corruption/alignment spectrum, in order. {@code id} is opaque and kept so the editor can reorder stably. */
	public record Tier(String id, @NotBlank String name, String definition, Mechanism mechanism, String vocabulary) {
	}

	/** A colour locked to one faction or tier, so that colour stays a marker of that faction's touch. */
	public record SignatureColor(String id, String faction, String color, String meaning) {
	}

	/** A named individual. Only tiers that keep personhood may have these; the most-lost tier keeps titles, never names. */
	public record NamedCharacter(String id, String name, String tier, String race, String role, String signature) {
	}

	public record LoreDoc(Cosmology cosmology, List<Tier> tiers, List<SignatureColor> colors, List<NamedCharacter> characters,
			String naming, List<String> gaps) {

		/** The doc the editor starts from when the deck has no lore yet. */
		public static LoreDoc empty() {
			return new LoreDoc(new Cosmology("", List.of(), ""), List.of(), List.of(), List.of(), "", List.of());
		}
	}

	/** What the Lore Creator is asked to draft. */
	public record DraftRequest(@NotNull @NotBlank String instruction) {
	}

	/** Which card to check against the locked lore. The card and its current treatment are read server side. */
	public record CheckRequest(@NotNull UUID cardId) {
	}

	public record Problem(String rule, String message) {
	}

	/** The verdict of a card-fit check. Problems is empty when it fits. */
	public record Verdict(boolean fits, List<Problem> problems) {
	}
}
