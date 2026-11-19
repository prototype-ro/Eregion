package io.eregion.proxy;

import java.time.Instant;
import java.util.UUID;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public final class ProxyDtos {

	private ProxyDtos() {
	}

	/** NICKNAME invents a new name and character. RESKIN keeps the card's own name and gives it a new character and art. */
	public enum Mode {
		NICKNAME, RESKIN
	}

	/** Who the card is in the deck's lore. {@code tier} is free text taken from the lore, such as "Aelathir" or "Lathaar-tier". */
	public record Character(String tier, String who, String race, String role, String signature) {
	}

	/** What the model answers for one card. {@code nickname} is null in RESKIN mode. */
	public record Draft(String nickname, Character character, String prompt) {
	}

	public record Generation(UUID id, Instant createdAt, String instruction, String nickname, Character character, String prompt, String model) {
	}

	public record Treatment(UUID id, UUID cardId, Mode mode, UUID currentGenerationId, Generation current) {
	}

	/**
	 * What the model already knows about the other cards of the deck, so names do not clash and — via {@code signature} —
	 * so a new card's visual concept can actually be checked against what other cards already settled on, not just their names.
	 */
	public record Pick(String cardName, String nickname, String tier, String signature) {
	}

	/** The card facts the model needs, copied out of the catalog. */
	public record CardFacts(String name, String manaCost, String typeLine, String colors, String oracleText) {
	}

	/**
	 * {@code ignoreType} lets a card's art break from its printed type/subtype when the lore says this subject is something else.
	 * {@code ignoreRulesText} drops the card's own rules text as an anchor, so the subject comes from the lore and the type alone.
	 * {@code loreOnly} sends the model nothing of the card but its type — creature type for a creature, card type for anything else: no name, cost,
	 * colours, rules text or other types.
	 * {@code ignoreLore} is the opposite extreme: the deck's lore is not sent at all, so the card stands alone with no deck character or place names. Mutually exclusive with {@code loreOnly}; if both are set, {@code loreOnly} wins.
	 * {@code tier} is the lore group the player wants the card placed in (null or blank lets the model choose), ignored when {@code ignoreLore} is set.
	 */
	public record GenerateRequest(@NotNull Mode mode, @Size(max = 1000) String instruction, boolean ignoreType, boolean ignoreRulesText, boolean loreOnly,
			@Size(max = 80) String tier, boolean ignoreLore) {

		public GenerateRequest(Mode mode, String instruction, boolean ignoreType, boolean ignoreRulesText, boolean loreOnly, String tier) {
			this(mode, instruction, ignoreType, ignoreRulesText, loreOnly, tier, false);
		}

		public GenerateRequest(Mode mode, String instruction, boolean ignoreType, boolean ignoreRulesText, boolean loreOnly) {
			this(mode, instruction, ignoreType, ignoreRulesText, loreOnly, null, false);
		}

		public GenerateRequest(Mode mode, String instruction, boolean ignoreType, boolean ignoreRulesText) {
			this(mode, instruction, ignoreType, ignoreRulesText, false, null, false);
		}
	}

	public record CurrentRequest(@NotNull UUID generationId) {
	}

	public record LoreRequest(@Size(max = 60000) String lore, @Size(max = 200) String mjParams) {
	}

	public record MjParamsRequest(@Size(max = 200) String mjParams) {
	}

	public record Lore(String lore, String mjParams) {
	}

	/** One message of the advanced chat, before anything is committed. {@code role} is "user" or "assistant". */
	public record ChatTurn(@NotNull @Pattern(regexp = "user|assistant") String role, @NotBlank @Size(max = 2000) String content) {
	}

	public record ChatRequest(@NotNull Mode mode, boolean ignoreType, boolean ignoreRulesText, boolean loreOnly,
			@NotNull @Size(min = 1, max = 40) List<@Valid ChatTurn> messages, boolean ignoreLore) {

		public ChatRequest(Mode mode, boolean ignoreType, boolean ignoreRulesText, boolean loreOnly, List<ChatTurn> messages) {
			this(mode, ignoreType, ignoreRulesText, loreOnly, messages, false);
		}

		public ChatRequest(Mode mode, boolean ignoreType, boolean ignoreRulesText, List<ChatTurn> messages) {
			this(mode, ignoreType, ignoreRulesText, false, messages, false);
		}
	}

	public record ChatReply(String reply) {
	}
}
