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
import io.eregion.deck.DeckDtos.ApplyChangesRequest;
import io.eregion.deck.DeckDtos.BranchDto;
import io.eregion.deck.DeckDtos.CreateDeckRequest;
import io.eregion.deck.DeckDtos.DeckCardInput;
import io.eregion.deck.DeckDtos.DeckCardLine;
import io.eregion.deck.DeckDtos.DeckDetail;
import io.eregion.deck.DeckDtos.DeckDiff;
import io.eregion.deck.DeckDtos.DeckSummary;
import io.eregion.deck.DeckDtos.SaveVersionRequest;
import io.eregion.deck.DeckDtos.Timeline;
import io.eregion.deck.DeckDtos.MergeConflict;
import io.eregion.deck.DeckDtos.MergePreview;
import io.eregion.deck.DeckDtos.MergeRequest;
import io.eregion.deck.DeckDtos.MergeSide;
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
	/** Per-account ceilings, so a script cannot fill the database with history. Far above what a person builds. */
	static final int MAX_DECKS_PER_USER = 200;
	static final int MAX_VERSIONS_PER_DECK = 500;
	static final int MAX_BRANCHES_PER_DECK = 30;

	private final DeckRepository decks;
	private final io.eregion.auth.UserRepository users;

	public DeckService(DeckRepository decks, io.eregion.auth.UserRepository users) {
		this.decks = decks;
		this.users = users;
	}

	/** Every deck of the player with its latest version's size, price, colors and what stops it being legal. */
	@Transactional(readOnly = true)
	public List<DeckSummary> list(UUID userId) {
		List<DeckRepository.SummaryRow> rows = decks.summaryRows(userId);
		Map<UUID, List<DeckLegality.Line>> lines = decks.legalityLines(
				rows.stream().map(DeckRepository.SummaryRow::latestVersionId).filter(java.util.Objects::nonNull).toList());
		return rows.stream().map(row -> {
			// A deck with no versions has no id here, and an immutable map would refuse the lookup.
			List<DeckLegality.Line> cards = row.latestVersionId() == null ? List.of() : lines.getOrDefault(row.latestVersionId(), List.of());
			return new DeckSummary(row.id(), row.name(), row.format(), row.latestVersion(), row.latestBranch(), row.latestOnMain(),
					row.versionCount(), row.branchCount(), row.cardCount(), StatsCalculator.round2(row.priceUsd()), row.commanderName(),
					row.artUrls(), DeckLegality.identity(cards), DeckLegality.issues(cards), row.updatedAt(), row.visibility(),
					row.publishedVersion(), row.pinned(), row.archived());
		}).toList();
	}

	@Transactional
	public DeckDtos.DeckFlags setFlags(UUID deckId, UUID userId, DeckDtos.DeckFlagsRequest request) {
		owned(deckId, userId);
		return decks.updateFlags(deckId, request.pinned(), request.archived());
	}

	@Transactional
	public DeckDetail update(UUID deckId, UUID userId, String name, String description) {
		owned(deckId, userId);
		String cleanName = name == null || name.isBlank() ? null : name.trim().replaceAll("\\s+", " ");
		// The description keeps its line breaks. Trailing space is trimmed and a blank one clears it.
		String cleanDescription = description == null ? null : description.strip().replace("\r\n", "\n");
		if (cleanName == null && cleanDescription == null) {
			throw ApiException.badRequest("Give a name or a description to change");
		}
		decks.updateDeck(deckId, cleanName, cleanDescription);
		return get(deckId, userId);
	}

	/**
	 * Starts a new private deck from the latest version of this one: one version with the same cards,
	 * printings, custom art and tags. The history and the public listing are not copied.
	 */
	@Transactional
	public DeckDetail duplicate(UUID deckId, UUID userId) {
		DeckRow source = owned(deckId, userId);
		String suffix = " (copy)";
		String name = (source.name().length() > 80 - suffix.length() ? source.name().substring(0, 80 - suffix.length()) : source.name()) + suffix;
		VersionRow latest = decks.findLatestVersion(deckId).orElse(null);
		List<DeckCardInput> cards = latest == null ? List.of() : decks.versionLines(latest.id(), userId).stream()
				.map(line -> new DeckCardInput(line.cardId(), line.quantity(), line.board(), line.printingId(), line.tags(), line.customPrintingId()))
				.toList();
		String note = latest == null ? null : "Copied from " + source.name() + ", version " + latest.number();
		return create(userId, new CreateDeckRequest(name, source.format(), note, cards));
	}

	@Transactional
	public DeckDetail create(UUID userId, CreateDeckRequest request) {
		String format = request.format() == null || request.format().isBlank() ? "commander" : request.format().trim();
		if (decks.deckCount(userId) >= MAX_DECKS_PER_USER) {
			throw ApiException.conflict("You can keep up to " + MAX_DECKS_PER_USER + " decks. Delete some first");
		}
		UUID deckId = decks.insertDeck(userId, request.name().trim(), format);
		UUID main = decks.insertMainBranch(deckId, MAIN_BRANCH);
		if (request.cards() != null && !request.cards().isEmpty()) {
			List<DeckCardInput> cards = prepare(userId, request.cards());
			write(deckId, request.note(), cards, main, null, null);
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
				deck.visibility(), deck.publishedVersion(), deck.description());
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
				// Sharing a deck with everyone needs an address the player has proved is theirs.
				if (!users.findById(userId).map(io.eregion.auth.User::emailVerified).orElse(false)) {
					throw ApiException.forbidden("Confirm your email address to make a deck public. We sent you a link, and you can ask for another from your account page.");
				}
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
		if (branch.main()) {
			throw ApiException.conflict("The main branch cannot be deleted");
		}
		checkBranchDeletable(deckId, branch);
		decks.deleteBranch(branchId);
		decks.touch(deckId);
		return timeline(deckId, userId);
	}

	/**
	 * Saves the draft over an existing version instead of adding a new one. Only a version nothing else
	 * grew from can be changed: no later version, merge or branch starts from it, so no history is rewritten.
	 * The version keeps its number, branch and place in the timeline.
	 */
	@Transactional
	public VersionDetail applyChanges(UUID deckId, UUID userId, int number, ApplyChangesRequest request) {
		owned(deckId, userId);
		VersionRow version = requireVersion(deckId, number);
		if (decks.hasDependents(version.id())) {
			throw ApiException.conflict("Other versions or branches grew from version " + number
					+ ", so it cannot be changed. Save the draft as a new version or branch instead");
		}
		decks.replaceVersionCards(version.id(), prepare(userId, request.cards()));
		if (request.note() != null) {
			decks.updateNote(version.id(), request.note().trim());
		}
		decks.touch(deckId);
		return detail(requireVersion(deckId, number), userId);
	}

	/** Rewrites a version's note. Notes are labels, so they can change after saving. */
	@Transactional
	public Timeline updateNote(UUID deckId, UUID userId, int number, String note) {
		owned(deckId, userId);
		decks.updateNote(requireVersion(deckId, number).id(), note == null ? "" : note.trim());
		return timeline(deckId, userId);
	}

	/**
	 * Deletes one version. The history closes up around it: versions and branches that grew from it now
	 * grow from its parent. The public version, the last version of the deck and the last version of
	 * the main branch cannot be deleted. A branch left with no versions goes with it.
	 */
	@Transactional
	public Timeline deleteVersion(UUID deckId, UUID userId, int number) {
		owned(deckId, userId);
		VersionRow version = requireVersion(deckId, number);
		if (decks.isPublished(deckId, version.id())) {
			throw ApiException.conflict("Version " + number + " is the public version. Publish another version or make the deck private first");
		}
		if (decks.versionCount(deckId) <= 1) {
			throw ApiException.conflict("A deck needs at least one version");
		}
		int onBranch = decks.branchVersionCount(version.branchId());
		if (version.main() && onBranch <= 1) {
			throw ApiException.conflict("Version " + number + " is the only version on the main branch");
		}
		decks.trashVersion(deckId, version.id(), onBranch <= 1);
		decks.deleteVersion(version.id(), version.parentId());
		if (onBranch <= 1) {
			decks.deleteEmptyBranch(version.branchId());
		}
		decks.touch(deckId);
		return timeline(deckId, userId);
	}

	/** Brings back a version deleted in the last 30 days, in its old place with its old number. */
	@Transactional
	public Timeline undoDeleteVersion(UUID deckId, UUID userId, int number) {
		owned(deckId, userId);
		DeckRepository.TrashRow row = decks.findTrashed(deckId, number)
				.orElseThrow(() -> ApiException.notFound("Deleted version " + number));
		if (row.parentId() != null && !decks.versionExists(row.parentId())) {
			throw ApiException.conflict("The version it grew from was deleted too, so it cannot go back. Undo that one first");
		}
		if (!row.branchRemoved() && !decks.branchExists(row.branchId())) {
			throw ApiException.conflict("Its branch was deleted, so it cannot go back");
		}
		if (decks.versionCount(deckId) >= MAX_VERSIONS_PER_DECK) {
			throw ApiException.conflict("A deck can keep up to " + MAX_VERSIONS_PER_DECK + " versions. Delete old ones first");
		}
		try {
			decks.restoreVersion(deckId, row);
		}
		catch (DuplicateKeyException ex) {
			throw ApiException.conflict("The history moved on since it was deleted, so it cannot go back into the same place");
		}
		decks.touch(deckId);
		return timeline(deckId, userId);
	}

	/** Where a card was, version by version. The caller can combine it with the timeline to show gaps. */
	@Transactional(readOnly = true)
	public List<DeckDtos.CardAppearance> cardHistory(UUID deckId, UUID userId, UUID cardId) {
		owned(deckId, userId);
		return decks.cardHistory(deckId, cardId);
	}

	/** For every branch other than main: how far ahead and behind main it is. */
	@Transactional(readOnly = true)
	public List<DeckDtos.BranchStatus> branchStatus(UUID deckId, UUID userId) {
		owned(deckId, userId);
		UUID mainId = decks.findMainBranchId(deckId).orElse(null);
		if (mainId == null) {
			return List.of();
		}
		VersionRow mainHead = decks.branchHead(mainId).orElse(null);
		if (mainHead == null) {
			return List.of();
		}
		Map<UUID, Integer> fromMain = decks.ancestors(mainHead.id());
		List<DeckDtos.BranchStatus> result = new ArrayList<>();
		for (BranchRow branch : decks.branches(deckId)) {
			if (branch.main()) {
				continue;
			}
			VersionRow head = decks.branchHead(branch.id()).orElse(null);
			if (head == null) {
				continue;
			}
			Map<UUID, Integer> fromBranch = decks.ancestors(head.id());
			int ahead = (int) fromBranch.keySet().stream().filter(id -> !fromMain.containsKey(id)).count();
			int behind = (int) fromMain.keySet().stream().filter(id -> !fromBranch.containsKey(id)).count();
			Integer base = fromBranch.entrySet().stream().filter(entry -> fromMain.containsKey(entry.getKey()))
					.map(Map.Entry::getValue).max(Integer::compare).orElse(null);
			result.add(new DeckDtos.BranchStatus(branch.id(), branch.name(), ahead, behind, base, head.number(), mainHead.number()));
		}
		return result;
	}

	// ---- merging ----

	/** Everything a merge needs: the two heads, the version they share, and the three sets of cards. */
	private record MergeContext(BranchRow source, VersionRow main, VersionRow theirs, Integer baseNumber, boolean upToDate,
			List<DeckCardLine> base, List<DeckCardLine> ours, List<DeckCardLine> theirLines, UUID mainBranchId) {
	}

	/** targetBranchId is the branch that receives the merge; null means main. */
	private MergeContext mergeContext(UUID deckId, UUID userId, UUID sourceBranchId, UUID targetBranchId) {
		BranchRow source = requireBranch(deckId, sourceBranchId);
		UUID mainId = decks.findMainBranchId(deckId).orElseThrow(() -> ApiException.notFound("Main branch"));
		UUID targetId = targetBranchId == null ? mainId : requireBranch(deckId, targetBranchId).id();
		if (source.id().equals(targetId)) {
			throw ApiException.badRequest("Choose two different branches to merge");
		}
		VersionRow ours = decks.branchHead(targetId).orElseThrow(() -> ApiException.conflict("That branch has no versions yet"));
		VersionRow theirs = decks.branchHead(sourceBranchId).orElseThrow(() -> ApiException.conflict("That branch has no versions"));

		Map<UUID, Integer> fromMain = decks.ancestors(ours.id());
		Map<UUID, Integer> fromSource = decks.ancestors(theirs.id());
		boolean upToDate = fromMain.containsKey(theirs.id());
		// The newest version both lines share. Numbers only go up, so the highest number is the latest.
		Map.Entry<UUID, Integer> base = fromMain.entrySet().stream()
				.filter(entry -> fromSource.containsKey(entry.getKey()))
				.max(Map.Entry.comparingByValue())
				.orElse(null);
		List<DeckCardLine> baseLines = base == null ? List.of() : decks.versionLines(base.getKey(), userId);
		return new MergeContext(source, ours, theirs, base == null ? null : base.getValue(), upToDate, baseLines,
				decks.versionLines(ours.id(), userId), decks.versionLines(theirs.id(), userId), targetId);
	}

	/** Shows what merging a branch into another (main unless told) would change and which cards need a choice. Changes nothing. */
	@Transactional(readOnly = true)
	public MergePreview mergePreview(UUID deckId, UUID userId, UUID sourceBranchId, UUID targetBranchId) {
		owned(deckId, userId);
		MergeContext ctx = mergeContext(deckId, userId, sourceBranchId, targetBranchId);
		Merger.Result result = Merger.merge(ctx.base(), ctx.ours(), ctx.theirLines(), Map.of());
		DeckDiff changes = DeckDiffer.diff(ctx.main().number(), ctx.ours(), ctx.theirs().number(), result.merged());
		List<MergeConflict> conflicts = result.conflicts().stream()
				.map(c -> new MergeConflict(c.cardId(), c.name(), c.board(), side(c.base()), side(c.ours()), side(c.theirs())))
				.toList();
		return new MergePreview(ctx.source().name(), ctx.theirs().number(), ctx.main().number(), ctx.baseNumber(), ctx.upToDate(),
				changes, conflicts);
	}

	/**
	 * Merges a branch into main as a new main version that records both parents. Cards that only one
	 * side changed merge by themselves. Conflicts need a choice in resolutions. The branch can be deleted afterwards.
	 */
	@Transactional
	public VersionDetail merge(UUID deckId, UUID userId, MergeRequest request) {
		owned(deckId, userId);
		MergeContext ctx = mergeContext(deckId, userId, request.sourceBranchId(), request.targetBranchId());
		if (ctx.main().number() != request.expectedMainVersion() || ctx.theirs().number() != request.expectedSourceVersion()) {
			throw ApiException.conflict("The branches changed since the preview. Open the merge again");
		}
		if (ctx.upToDate()) {
			throw ApiException.conflict(ctx.main().branchName() + " already has everything on " + ctx.source().name());
		}
		boolean deleteAfter = Boolean.TRUE.equals(request.deleteBranch());
		if (deleteAfter) {
			checkBranchDeletable(deckId, ctx.source());
		}

		Map<String, String> resolutions = request.resolutions() == null ? Map.of() : request.resolutions();
		for (String choice : resolutions.values()) {
			if (!Merger.OURS.equals(choice) && !Merger.THEIRS.equals(choice)) {
				throw ApiException.badRequest("A choice must be 'ours' or 'theirs'");
			}
		}
		Merger.Result result = Merger.merge(ctx.base(), ctx.ours(), ctx.theirLines(), resolutions);
		if (!result.conflicts().isEmpty()) {
			throw ApiException.badRequest(result.conflicts().size() + " card(s) need a choice: "
					+ result.conflicts().stream().limit(5).map(Merger.Conflict::name).collect(java.util.stream.Collectors.joining(", ")));
		}
		if (result.merged().isEmpty()) {
			throw ApiException.badRequest("The merge would leave an empty deck");
		}

		List<DeckCardInput> inputs = result.merged().stream()
				.map(line -> new DeckCardInput(line.cardId(), line.quantity(), line.board(), line.printingId(), line.tags(), line.customPrintingId()))
				.toList();
		String note = request.note() == null || request.note().isBlank() ? "Merged " + ctx.source().name() + " into " + ctx.main().branchName() : request.note();
		VersionRow saved = write(deckId, note, prepare(userId, inputs), ctx.mainBranchId(), ctx.main().id(), ctx.theirs().id());
		if (deleteAfter) {
			decks.deleteBranch(ctx.source().id());
		}
		return detail(saved, userId);
	}

	private void checkBranchDeletable(UUID deckId, BranchRow branch) {
		if (branch.main()) {
			throw ApiException.conflict("The main branch cannot be deleted");
		}
		List<String> children = decks.branchesForkedFrom(branch.id());
		if (!children.isEmpty()) {
			throw ApiException.conflict("Other branches split off from '" + branch.name() + "': " + String.join(", ", children)
					+ ". Delete those first");
		}
		if (decks.publishesFrom(deckId, branch.id())) {
			throw ApiException.conflict("The public version is on this branch. Publish another version or make the deck private first");
		}
	}

	private static MergeSide side(Merger.Side side) {
		return new MergeSide(side.quantity(), side.printing(), side.tags());
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
			if (decks.branches(deckId).size() >= MAX_BRANCHES_PER_DECK) {
				throw ApiException.conflict("A deck can have up to " + MAX_BRANCHES_PER_DECK + " branches. Delete or merge some first");
			}
			try {
				branchId = decks.insertBranch(deckId, fork.branchName(), fork.parentVersionId());
			}
			catch (DuplicateKeyException ex) {
				throw ApiException.conflict("This deck already has a branch called '" + fork.branchName() + "'");
			}
			parentId = fork.parentVersionId();
		}
		else if (plan instanceof First) {
			branchId = decks.findMainBranchId(deckId).orElseGet(() -> decks.insertMainBranch(deckId, MAIN_BRANCH));
			parentId = null;
		}
		else {
			throw new IllegalStateException("Unhandled save plan " + plan);
		}

		VersionRow saved = write(deckId, request.note(), cards, branchId, parentId, null);
		if (request.note() == null || request.note().isBlank()) {
			saved = describe(saved, parentId, userId);
		}
		return detail(saved, userId);
	}

	/** Gives an undescribed version a note saying what changed, so the timeline reads without anyone typing. */
	private VersionRow describe(VersionRow saved, UUID parentId, UUID userId) {
		String note;
		if (parentId == null) {
			note = "First version.";
		}
		else {
			VersionRow parent = decks.findVersionById(parentId).orElse(null);
			if (parent == null) {
				return saved;
			}
			note = VersionNotes.summary(DeckDiffer.diff(parent.number(), decks.versionLines(parentId, userId),
					saved.number(), decks.versionLines(saved.id(), userId)));
		}
		decks.updateNote(saved.id(), note);
		return new VersionRow(saved.id(), saved.number(), note, saved.createdAt(), saved.branchId(), saved.branchName(),
				saved.parentVersion(), saved.head(), saved.parentId(), saved.main());
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
			branches.add(new BranchDto(branch.id(), branch.name(), branch.forkedFromVersion(), branch.main(), inBranch));
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
	private VersionRow write(UUID deckId, String note, List<DeckCardInput> cards, UUID branchId, UUID parentId, UUID mergeParentId) {
		if (decks.versionCount(deckId) >= MAX_VERSIONS_PER_DECK) {
			throw ApiException.conflict("A deck can keep up to " + MAX_VERSIONS_PER_DECK + " versions. Delete old ones first");
		}
		int number = decks.nextVersionNumber(deckId);
		UUID versionId;
		try {
			versionId = decks.insertVersion(deckId, number, note == null ? "" : note.trim(), branchId, parentId, mergeParentId);
		}
		catch (DuplicateKeyException ex) {
			// Another save or merge got there first: this version already has a child on its branch.
			throw ApiException.conflict("This branch changed while you were working. Reload the deck, then save again or save as a new branch");
		}
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
