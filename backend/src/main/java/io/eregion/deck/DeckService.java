package io.eregion.deck;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import io.eregion.common.ApiException;
import io.eregion.deck.DeckDtos.BranchDto;
import io.eregion.deck.DeckDtos.CreateDeckRequest;
import io.eregion.deck.DeckDtos.DeckCardInput;
import io.eregion.deck.DeckDtos.DeckCardLine;
import io.eregion.deck.DeckDtos.DeckDetail;
import io.eregion.deck.DeckDtos.DeckDiff;
import io.eregion.deck.DeckDtos.DeckSummary;
import io.eregion.deck.DeckDtos.SaveVersionRequest;
import io.eregion.deck.DeckDtos.Timeline;
import io.eregion.deck.DeckDtos.VersionDetail;
import io.eregion.deck.DeckDtos.VisibilityRequest;
import io.eregion.deck.DeckDtos.VersionSummary;
import io.eregion.deck.DeckRepository.BranchRow;
import io.eregion.deck.DeckRepository.DeckRow;
import io.eregion.deck.DeckRepository.VersionRow;
import io.eregion.deck.SavePlanner.Append;
import io.eregion.deck.SavePlanner.Base;
import io.eregion.deck.SavePlanner.First;
import io.eregion.deck.SavePlanner.Fork;
import io.eregion.deck.SavePlanner.Plan;

@Service
public class DeckService {

	public static final String MAIN_BRANCH = "main";

	private final DeckRepository decks;

	public DeckService(DeckRepository decks) {
		this.decks = decks;
	}

	public List<DeckSummary> list(UUID userId) {
		return decks.summaries(userId);
	}

	@Transactional
	public DeckDetail create(UUID userId, CreateDeckRequest request) {
		String format = request.format() == null || request.format().isBlank() ? "commander" : request.format().trim();
		UUID deckId = decks.insertDeck(userId, request.name().trim(), format);
		decks.insertBranch(deckId, MAIN_BRANCH, null);
		if (request.cards() != null && !request.cards().isEmpty()) {
			List<DeckCardInput> cards = prepare(userId, request.cards());
			UUID main = decks.findBranchId(deckId, MAIN_BRANCH).orElseThrow();
			write(deckId, request.note(), cards, main, null);
		}
		return get(deckId, userId);
	}

	/** The deck with its most recently saved version, which is where the builder opens. */
	@Transactional(readOnly = true)
	public DeckDetail get(UUID deckId, UUID userId) {
		DeckRow deck = owned(deckId, userId);
		VersionDetail latest = decks.findLatestVersion(deckId)
				.map(version -> detail(version, userId))
				.orElse(null);
		return new DeckDetail(deck.id(), deck.name(), deck.format(), deck.createdAt(), deck.updatedAt(), latest,
				deck.visibility(), deck.publishedVersion());
	}

	@Transactional
	public void delete(UUID deckId, UUID userId) {
		owned(deckId, userId);
		decks.delete(deckId);
	}

	/**
	 * Publishes one version of the deck for everyone to see, or hides the deck again. Only the chosen
	 * version is shown, and it stays that version until the owner publishes another.
	 */
	@Transactional
	public DeckDetail setVisibility(UUID deckId, UUID userId, VisibilityRequest request) {
		owned(deckId, userId);
		switch (request.visibility()) {
			case "public" -> {
				if (request.versionNumber() == null) {
					throw ApiException.badRequest("Choose which version to publish");
				}
				decks.setPublished(deckId, requireVersion(deckId, request.versionNumber()).id());
			}
			case "private" -> decks.setPublished(deckId, null);
			default -> throw ApiException.badRequest("visibility must be public or private");
		}
		return get(deckId, userId);
	}

	// ---- versions and branches ----

	@Transactional
	public Timeline renameBranch(UUID deckId, UUID userId, UUID branchId, String rawName) {
		owned(deckId, userId);
		BranchRow branch = requireBranch(deckId, branchId);
		String name = rawName.trim().replaceAll("\\s+", " ");
		if (name.isEmpty()) {
			throw ApiException.badRequest("A branch needs a name");
		}
		if (!name.equals(branch.name())) {
			try {
				decks.renameBranch(branchId, name);
			}
			catch (DuplicateKeyException ex) {
				throw ApiException.conflict("This deck already has a branch called '" + name + "'");
			}
		}
		return timeline(deckId, userId);
	}

	/**
	 * Deletes a branch and all of its versions. The first line of the deck cannot be deleted, nor
	 * can a branch that other branches split from or that holds the public version.
	 */
	@Transactional
	public Timeline deleteBranch(UUID deckId, UUID userId, UUID branchId) {
		owned(deckId, userId);
		BranchRow branch = requireBranch(deckId, branchId);
		if (branch.forkedFromVersion() == null) {
			throw ApiException.conflict("The first branch cannot be deleted");
		}
		List<String> children = decks.branchesForkedFrom(branchId);
		if (!children.isEmpty()) {
			throw ApiException.conflict("Other branches split off from '" + branch.name() + "': " + String.join(", ", children)
					+ ". Delete those first");
		}
		if (decks.publishesFrom(deckId, branchId)) {
			throw ApiException.conflict("The public version is on this branch. Publish another version or make the deck private first");
		}
		decks.deleteBranch(branchId);
		decks.touch(deckId);
		return timeline(deckId, userId);
	}

	private BranchRow requireBranch(UUID deckId, UUID branchId) {
		return decks.branches(deckId).stream().filter(branch -> branch.id().equals(branchId)).findFirst()
				.orElseThrow(() -> ApiException.notFound("Branch"));
	}

	@Transactional
	public VersionDetail saveVersion(UUID deckId, UUID userId, SaveVersionRequest request) {
		owned(deckId, userId);
		List<DeckCardInput> cards = prepare(userId, request.cards());

		VersionRow base = request.fromVersion() == null ? null : requireVersion(deckId, request.fromVersion());
		Plan plan = SavePlanner.plan(
				decks.hasVersions(deckId),
				base == null ? null : new Base(base.number(), base.id(), base.branchId(), base.head()),
				request.branchName());

		UUID branchId;
		UUID parentId;
		if (plan instanceof Append append) {
			branchId = append.branchId();
			parentId = append.parentVersionId();
		}
		else if (plan instanceof Fork fork) {
			try {
				branchId = decks.insertBranch(deckId, fork.branchName(), fork.parentVersionId());
			}
			catch (DuplicateKeyException ex) {
				throw ApiException.conflict("This deck already has a branch called '" + fork.branchName() + "'");
			}
			parentId = fork.parentVersionId();
		}
		else if (plan instanceof First) {
			branchId = decks.findBranchId(deckId, MAIN_BRANCH).orElseGet(() -> decks.insertBranch(deckId, MAIN_BRANCH, null));
			parentId = null;
		}
		else {
			throw new IllegalStateException("Unhandled save plan " + plan);
		}

		VersionRow saved = write(deckId, request.note(), cards, branchId, parentId);
		return detail(saved, userId);
	}

	@Transactional(readOnly = true)
	public List<VersionSummary> versions(UUID deckId, UUID userId) {
		owned(deckId, userId);
		return decks.versionSummaries(deckId);
	}

	/** Every branch with its versions in order, for drawing the deck's timeline. */
	@Transactional(readOnly = true)
	public Timeline timeline(UUID deckId, UUID userId) {
		owned(deckId, userId);
		List<VersionSummary> all = decks.versionSummaries(deckId);
		List<BranchDto> branches = new ArrayList<>();
		for (BranchRow branch : decks.branches(deckId)) {
			List<VersionSummary> inBranch = all.stream()
					.filter(version -> version.branchId().equals(branch.id()))
					.sorted((a, b) -> Integer.compare(a.versionNumber(), b.versionNumber()))
					.toList();
			branches.add(new BranchDto(branch.id(), branch.name(), branch.forkedFromVersion(), inBranch));
		}
		return new Timeline(List.copyOf(branches));
	}

	@Transactional(readOnly = true)
	public VersionDetail version(UUID deckId, UUID userId, int number) {
		owned(deckId, userId);
		return detail(requireVersion(deckId, number), userId);
	}

	@Transactional(readOnly = true)
	public DeckDiff diff(UUID deckId, UUID userId, int from, int to) {
		owned(deckId, userId);
		VersionRow fromVersion = requireVersion(deckId, from);
		VersionRow toVersion = requireVersion(deckId, to);
		return DeckDiffer.diff(from, decks.versionLines(fromVersion.id(), userId), to,
				decks.versionLines(toVersion.id(), userId));
	}

	// ---- internals ----

	private DeckRow owned(UUID deckId, UUID userId) {
		return decks.findOwned(deckId, userId).orElseThrow(() -> ApiException.notFound("Deck"));
	}

	private VersionRow requireVersion(UUID deckId, int number) {
		return decks.findVersion(deckId, number).orElseThrow(() -> ApiException.notFound("Version " + number));
	}

	private VersionDetail detail(VersionRow version, UUID userId) {
		List<DeckCardLine> lines = decks.versionLines(version.id(), userId);
		return new VersionDetail(version.number(), version.note(), version.createdAt(), lines,
				StatsCalculator.compute(lines), version.branchId(), version.branchName(), version.parentVersion(),
				version.head());
	}

	/** Stores the cards as the next full snapshot on the given branch. */
	private VersionRow write(UUID deckId, String note, List<DeckCardInput> cards, UUID branchId, UUID parentId) {
		int number = decks.nextVersionNumber(deckId);
		UUID versionId = decks.insertVersion(deckId, number, note == null ? "" : note.trim(), branchId, parentId);
		decks.insertVersionCards(versionId, cards);
		decks.touch(deckId);
		return decks.findVersion(deckId, number).orElseThrow();
	}

	/**
	 * Checks a draft and returns it in storage form: pinned printings that are just the card's
	 * default become null, and tags are trimmed and de-duplicated.
	 */
	private List<DeckCardInput> prepare(UUID userId, List<DeckCardInput> cards) {
		Set<String> seen = new HashSet<>();
		Set<UUID> cardIds = new HashSet<>();
		Set<UUID> printingIds = new HashSet<>();
		Set<UUID> customIds = new HashSet<>();
		int commanders = 0;

		for (DeckCardInput card : cards) {
			Board board = Board.fromDb(card.board());
			if (!seen.add(card.cardId() + "|" + board.db())) {
				throw ApiException.badRequest("A card appears twice on the " + board.db() + " board. Use quantity instead.");
			}
			if (board == Board.COMMANDER) {
				commanders++;
				if (card.quantity() != 1) {
					throw ApiException.badRequest("The commander quantity must be 1");
				}
			}
			cardIds.add(card.cardId());
			if (card.printingId() != null) {
				printingIds.add(card.printingId());
			}
			if (card.customPrintingId() != null) {
				customIds.add(card.customPrintingId());
			}
		}
		if (commanders > 2) {
			throw ApiException.badRequest("A deck can have at most two commanders: a partner pair or a commander with a background");
		}

		Map<UUID, UUID> defaults = decks.defaultPrintings(cardIds);
		if (defaults.size() != cardIds.size()) {
			throw ApiException.badRequest((cardIds.size() - defaults.size()) + " card id(s) are not in the catalog. Import them first.");
		}
		Map<UUID, UUID> owners = decks.printingOwners(printingIds);
		Map<UUID, DeckRepository.CustomOwner> customOwners = decks.customPrintingOwners(customIds);

		List<DeckCardInput> prepared = new ArrayList<>(cards.size());
		for (DeckCardInput card : cards) {
			UUID printing = card.printingId();
			UUID custom = card.customPrintingId();
			if (custom != null) {
				// Custom art is private to its owner and for one card. It replaces any Scryfall printing.
				DeckRepository.CustomOwner owner = customOwners.get(custom);
				if (owner == null || !owner.userId().equals(userId) || !owner.cardId().equals(card.cardId())) {
					throw ApiException.badRequest("That custom art is not yours or is for a different card");
				}
				printing = null;
			}
			else if (printing != null && printing.equals(defaults.get(card.cardId()))) {
				printing = null;
			}
			else if (printing != null && !card.cardId().equals(owners.get(printing))) {
				throw ApiException.badRequest("That printing is not one of this card's printings");
			}
			prepared.add(new DeckCardInput(card.cardId(), card.quantity(), card.board(), printing, cleanTags(card.tags()), custom));
		}
		return prepared;
	}

	/** Tags are trimmed, single-spaced and unique ignoring case. The first spelling wins. */
	static List<String> cleanTags(List<String> tags) {
		if (tags == null) {
			return List.of();
		}
		Map<String, String> unique = new LinkedHashMap<>();
		for (String tag : tags) {
			String cleaned = tag == null ? "" : tag.trim().replaceAll("\\s+", " ");
			if (!cleaned.isEmpty()) {
				unique.putIfAbsent(cleaned.toLowerCase(java.util.Locale.ROOT), cleaned);
			}
		}
		return List.copyOf(unique.values());
	}
}
