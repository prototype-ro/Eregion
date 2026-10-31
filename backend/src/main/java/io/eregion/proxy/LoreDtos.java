package io.eregion.proxy;

import java.util.List;
import java.util.UUID;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/** The structured lore document of a deck: its cosmology, groups, tales, colours, characters, naming and gaps. */
public final class LoreDtos {

	private LoreDtos() {
	}

	/** How this world or universe began and operates, plus any foundational powers or notable cosmic entities. */
	public record Cosmology(String overview, List<String> forces) {
	}

	/** One race, tribe, faction or stage in the setting, in narrative order. {@code id} is opaque and kept so the editor can reorder stably. */
	public record Group(String id, @NotBlank String name, String description, String traits) {
	}

	/** A colour locked to one faction or group, so that colour stays a marker of that faction's touch. */
	public record SignatureColor(String id, String faction, String color, String meaning) {
	}

	/** A named individual. {@code group} is the race, tribe, faction or stage they belong to. */
	public record NamedCharacter(String id, String name, String group, String race, String role, String signature) {
	}

	/**
	 * The setting. {@code canonSource} names the real franchise this lore draws on (e.g. "Marvel Comics"), or is
	 * null when the setting was invented from scratch.
	 */
	public record LoreDoc(Cosmology cosmology, List<Group> groups, List<String> tales, List<SignatureColor> colors,
			List<NamedCharacter> characters, String naming, List<String> gaps, String canonSource) {

		/** The doc the editor starts from when the deck has no lore yet. */
		public static LoreDoc empty() {
			return new LoreDoc(new Cosmology("", List.of()), List.of(), List.of(), List.of(), List.of(), "", List.of(), null);
		}
	}

	/** What the Lore Creator is asked to draft. */
	public record DraftRequest(@NotNull @NotBlank String instruction) {
	}

	/**
	 * A targeted edit to one part of the working lore. {@code doc} is the current document (including unsaved edits);
	 * {@code target} names the part to change; {@code instruction} is the requested change.
	 */
	public record RefineRequest(@NotNull LoreDoc doc, @NotNull @NotBlank String target, @NotNull @NotBlank String instruction) {
	}

	/** Which card to check against the locked lore. The card and its current treatment are read server side. */
	public record CheckRequest(@NotNull UUID cardId) {
	}

	/** One message in the conversation so far, oldest first. */
	public record TurnMessage(String role, String text) {
	}

	/**
	 * A conversational turn. {@code doc} is the client's working document (unsaved edits included) — the server
	 * never reads the saved row to answer a turn. {@code history} is the last ~20 messages, newest last.
	 */
	public record TurnRequest(@NotNull LoreDoc doc, List<TurnMessage> history, @NotNull @NotBlank String message) {
	}

	/** The model's one- or two-sentence summary of what it changed, plus the whole updated document. */
	public record TurnReply(String reply, LoreDoc doc) {
	}

	public record Problem(String rule, String message) {
	}

	/** The verdict of a card-fit check. Problems is empty when it fits. */
	public record Verdict(boolean fits, List<Problem> problems) {
	}
}
