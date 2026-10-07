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
			@Size(max = 12) List<@NotBlank @Size(max = 30) String> tags,
			UUID customPrintingId) {
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
			UUID customPrintingId,
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
			Integer parentVersion,
			Integer mergeParent,
			int added,
			int removed) {
	}

	/** One line of development. forkedFromVersion is where it split off. main is the line other branches merge into. */
	public record BranchDto(UUID id, String name, Integer forkedFromVersion, boolean main, List<VersionSummary> versions) {
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
			VersionDetail latest,
			String visibility,
			Integer publishedVersion) {
	}

	/** Makes a deck public, showing one chosen version, or private again. versionNumber is required for public. */
	public record RenameBranchRequest(@NotBlank @Size(max = 40) String name) {
	}

	public record VisibilityRequest(@NotBlank String visibility, Integer versionNumber) {
	}

	public record DeckSummary(
			UUID id,
			String name,
			String format,
			int latestVersion,
			int cardCount,
			String commanderName,
			String artUrl,
			Instant updatedAt,
			String visibility) {
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

	/** A card kept in the deck whose chosen printing changed. from and to read like "2XM 190". */
	public record PrintingChange(UUID cardId, String name, String board, String from, String to) {
	}

	/** A card kept in the deck whose tags changed. */
	public record TagChange(UUID cardId, String name, String board, List<String> added, List<String> removed) {
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
			List<PrintingChange> printings,
			List<TagChange> tags,
			StatsChange stats) {
	}

	// ---- editing the timeline ----

	public record NoteRequest(@Size(max = 200) String note) {
	}

	/** One side of a merge conflict. A null quantity means the card is not in that version. */
	public record MergeSide(Integer quantity, String printing, List<String> tags) {
	}

	public record MergeConflict(UUID cardId, String name, String board, MergeSide base, MergeSide ours, MergeSide theirs) {
		public String key() {
			return cardId + "|" + board;
		}
	}

	/**
	 * What merging a branch into main would do. changes lists what main would gain or lose, leaving out
	 * conflicts, which wait for a choice. baseVersion is the version both lines grew from.
	 */
	public record MergePreview(
			String sourceBranch,
			int sourceVersion,
			int mainVersion,
			Integer baseVersion,
			boolean upToDate,
			DeckDiff changes,
			List<MergeConflict> conflicts) {
	}

	/**
	 * Merges a branch into main. The expected versions are the heads that were previewed, so a merge
	 * never applies to lines that changed in the meantime. resolutions maps "cardId|board" to "ours" or "theirs".
	 */
	public record MergeRequest(
			@NotNull UUID sourceBranchId,
			@NotNull Integer expectedMainVersion,
			@NotNull Integer expectedSourceVersion,
			Map<String, String> resolutions,
			@Size(max = 200) String note,
			Boolean deleteBranch) {
	}
}
