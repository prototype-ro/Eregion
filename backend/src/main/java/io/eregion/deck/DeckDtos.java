package io.eregion.deck;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public final class DeckDtos {

	private DeckDtos() {
	}

	// ---- requests ----

	/** One card in a draft. printingId pins a printing (null means the card's default). tags are free-form labels. */
	public record DeckCardInput(
			@NotNull UUID cardId,
			@Min(1) @Max(99) int quantity,
			@NotBlank String board,
			UUID printingId,
			@Size(max = 12) List<@NotBlank @Size(max = 30) String> tags) {
	}

	public record CreateDeckRequest(
			@NotBlank @Size(max = 80) String name,
			@Size(max = 40) String format,
			@Size(max = 200) String note,
			@Size(max = 400) List<@Valid DeckCardInput> cards) {
	}

	/**
	 * A draft to save. fromVersion is the version the draft started from (leave it out only for a
	 * deck's first save). branchName starts a new branch from that version instead of extending its line.
	 */
	public record SaveVersionRequest(
			@Size(max = 200) String note,
			@NotNull @Size(min = 1, max = 400, message = "a version needs at least one card") List<@Valid DeckCardInput> cards,
			Integer fromVersion,
			@Size(max = 40) String branchName) {
	}

	// ---- a card inside one version ----

	/** A snapshot row joined with card data and how many copies the viewer owns. */
	public record DeckCardLine(
			UUID cardId,
			String name,
			String manaCost,
			double manaValue,
			String primaryType,
			String typeLine,
			String colors,
			String colorIdentity,
			String oracleText,
			String rarity,
			String artist,
			String imageSmall,
			String imageNormal,
			String imageArtCrop,
			UUID printingId,
			String setCode,
			String setName,
			String collectorNumber,
			Double priceUsd,
			String board,
			int quantity,
			int owned,
			List<String> tags) {
	}

	public record DeckStats(
			int totalCards,
			double averageManaValue,
			List<Integer> curve,
			Map<String, Integer> types,
			int lands,
			int owned,
			int missing,
			double totalPriceUsd) {
	}

	public record VersionDetail(
			int versionNumber,
			String note,
			Instant createdAt,
			List<DeckCardLine> cards,
			DeckStats stats,
			UUID branchId,
			String branchName,
			Integer parentVersion,
			boolean head) {
	}

	public record VersionSummary(
			int versionNumber,
			String note,
			Instant createdAt,
			int cardCount,
			double averageManaValue,
			UUID branchId,
			Integer parentVersion) {
	}

	/** One line of development. forkedFromVersion is where it split off, null for main. */
	public record BranchDto(UUID id, String name, Integer forkedFromVersion, List<VersionSummary> versions) {
	}

	public record Timeline(List<BranchDto> branches) {
	}

	// ---- decks ----

	public record DeckDetail(
			UUID id,
			String name,
			String format,
			Instant createdAt,
			Instant updatedAt,
			VersionDetail latest) {
	}

	public record DeckSummary(
			UUID id,
			String name,
			String format,
			int latestVersion,
			int cardCount,
			String commanderName,
			String artUrl,
			Instant updatedAt) {
	}

	// ---- diff ----

	public record CardChange(
			UUID cardId,
			String name,
			String manaCost,
			double manaValue,
			String primaryType,
			String board,
			int quantity) {
	}

	public record QuantityChange(UUID cardId, String name, String board, int from, int to) {
	}

	public record StatsChange(
			DeckStats from,
			DeckStats to,
			double averageManaValueDelta,
			List<Integer> curveDelta,
			Map<String, Integer> typeDelta,
			int totalDelta,
			int landsDelta) {
	}

	public record DeckDiff(
			int fromVersion,
			int toVersion,
			List<CardChange> added,
			List<CardChange> removed,
			List<QuantityChange> changed,
			StatsChange stats) {
	}
}
