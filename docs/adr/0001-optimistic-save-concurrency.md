# ADR-0001: Optimistic save concurrency

## Context

Two browser tabs, or two workers, can save a deck at the same time. The save path must not
silently fork a branch, and a stale tab must be told that the branch moved rather than overwrite
someone else's work. Eregion deliberately avoids application-level locks: the database enforces
the invariants and the service translates violations into conflicts.

## Decision

- A branch is a linear line: `deck_versions_one_child_idx` is a partial unique index on
  `(branch_id, parent_version_id)` (`V7__timeline.sql`), so a version can have at most one child
  on its branch.
- Every save is planned by the pure `SavePlanner`, which maps the base version to a sealed
  `Plan`: `First`, `Fork`, `Append`, or a rejection that forces a branch. Extending is only
  allowed from the branch head; saving from an older version requires a fork. History is never
  rewritten.
- When two saves race, the second `INSERT` violates `deck_versions_one_child_idx` and raises
  `DuplicateKeyException`. `DeckService.write()` catches it and returns a conflict telling the
  client that this branch changed while they were working. The client re-reads and lets the user
  save again on a branch.
- Version numbers are monotonic per deck (`decks.next_version_number`) and are never reused or
  renumbered. That is what makes "highest version number" a valid newest-common-ancestor rule in
  `DeckService.mergeContext()`, including after delete/restore (which reparents but does not
  renumber).
- Merge writes a single new version recording both parents, so re-merging brings only changes
  since the last merge.

## Consequences

- No lock management, no coordination between instances; correctness comes from constraints.
- The service must keep translating `DuplicateKeyException` into a 409 with a friendly message.
- Any future change that renumbers versions or allows multiple children per branch breaks the
  merge-base rule and the "never fork silently" guarantee.
- The case of branch names is a separate concern; see the case-insensitive uniqueness item.
