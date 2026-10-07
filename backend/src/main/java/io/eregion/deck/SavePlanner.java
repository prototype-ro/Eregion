package io.eregion.deck;

import java.util.UUID;

import io.eregion.common.ApiException;

/**
 * Decides where a saved draft goes, given which version it was started from.
 *
 * A draft started from the newest version of a line extends that line. A draft started
 * from an older version cannot rewrite history, so it must begin a new branch.
 */
public final class SavePlanner {

	/** The version a draft was started from. */
	public record Base(int versionNumber, UUID versionId, UUID branchId, boolean head) {
	}

	public sealed interface Plan permits First, Append, Fork {
	}

	/** The deck has no versions yet: this becomes version 1 on main. */
	public record First() implements Plan {
	}

	/** Add a version to the end of an existing branch. */
	public record Append(UUID branchId, UUID parentVersionId) implements Plan {
	}

	/** Start a new branch from a version. */
	public record Fork(String branchName, UUID parentVersionId) implements Plan {
	}

	private SavePlanner() {
	}

	public static Plan plan(boolean deckHasVersions, Base base, String branchName) {
		String name = branchName == null ? "" : branchName.trim();

		if (!deckHasVersions) {
			if (base != null) {
				throw ApiException.badRequest("This deck has no versions to start from");
			}
			return new First();
		}
		if (base == null) {
			throw ApiException.badRequest("Say which version this draft started from (fromVersion)");
		}
		if (!name.isEmpty()) {
			return new Fork(name, base.versionId());
		}
		if (base.head()) {
			return new Append(base.branchId(), base.versionId());
		}
		throw ApiException.conflict("Version " + base.versionNumber()
				+ " is not the latest on its branch. Save it as a new branch instead.");
	}
}
