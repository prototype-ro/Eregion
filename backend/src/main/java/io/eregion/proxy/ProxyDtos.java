package io.eregion.proxy;

import java.time.Instant;
import java.util.UUID;

import jakarta.validation.constraints.NotNull;
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

	/** What the model already knows about the other cards of the deck, so names do not clash. */
	public record Pick(String cardName, String nickname, String tier) {
	}

	/** The card facts the model needs, copied out of the catalog. */
	public record CardFacts(String name, String manaCost, String typeLine, String colors, String oracleText) {
	}

	/**
	 * {@code ignoreType} lets a card's art break from its printed type/subtype when the lore says this subject is something else.
	 * {@code ignoreRulesText} drops the card's own rules text as an anchor, so the subject comes from the lore and the type alone.
	 */
	public record GenerateRequest(@NotNull Mode mode, @Size(max = 1000) String instruction, boolean ignoreType, boolean ignoreRulesText) {
	}

	public record CurrentRequest(@NotNull UUID generationId) {
	}

	public record LoreRequest(@Size(max = 60000) String lore, @Size(max = 200) String mjParams) {
	}

	public record MjParamsRequest(@Size(max = 200) String mjParams) {
	}

	public record Lore(String lore, String mjParams) {
	}
}
