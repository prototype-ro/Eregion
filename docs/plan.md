# Eregion improvement plan

Derived from the project audit. Priorities: **P0** correctness/data-loss, **P1**
robustness/maintainability, **P2** scale/security hardening, **P3** product/polish.

Two corrections to the original audit:

- Migrations are at **V19**, not V17.
- `ExploreRepositoryTest` exists but has **no `report` coverage** — the gap is real.
- `eregion_norm` was only `lower(unaccent(name))`: it did not fold quotes, expand
  ligatures or collapse whitespace like `NameNormalizer`, so the "keep in step"
  contract was already broken, not merely untested.

## Phase 0 — Test infrastructure

Backend tests are pure JUnit and CI never exercises SQL. Most P0/P1 checks need a
real Postgres.

- [x] Add Testcontainers (`postgresql`, `junit-jupiter`) and a `PostgresTest` base
      class that runs Flyway. Tests skip when Docker is absent.
- [x] CI: `mvn verify` runs the DB tests (Testcontainers works on `ubuntu-latest`).
- [x] `docs/adr/` with ADR-0001 for the optimistic save concurrency model.

Exit: one DB-backed test passes in CI and locally when Docker is available.

## Phase 1 — P0 correctness

| # | Item | Files | Verification |
|---|------|-------|--------------|
| 1.1 | **Normalizer parity.** Rewrite `eregion_norm` to fold quotes/dashes, expand ligatures, collapse whitespace, then `lower(unaccent(...))`. Rebuild both indexes. | `V10`, `V20` | Corpus run through Java and SQL, equal output. **Done.** |
| 1.2 | **Case-insensitive branch names.** `V21` de-dups existing names, drops `deck_branches_name_unique`, adds `UNIQUE (deck_id, lower(name))`. | `V2`, `V21`, `DeckService` | `"Side"` then `"side"` → 409; migration test. **Done.** |
| 1.3 | **Single source for role order.** Generate `roles.generated.ts` from `functional-tags.json`; CI drift check. | `roles.ts`, script, CI | Node test asserts order matches JSON. |
| 1.4 | **DTO contract check.** Generate API types from DTOs (OpenAPI or script) and assert `types.ts` compatibility. | `types.ts`, `pom.xml` | `typecheck` fails on DTO field removal. |
| 1.5 | **Merge-base invariant.** Comment + test that max version number is the newest common ancestor, including delete/restore. | `DeckService`, `DeckRepository` | Merge → delete → restore → re-merge keeps base. |

## Phase 2 — P1 maintainability

1. Component test harness (Vitest + Testing Library) for save/apply-in-place,
   merge conflicts, draft restore.
2. One ownership shape: server returns `owned`/`missing`/`totalPriceUsd`; delete
   the client recomputation in `stats.ts`.
3. Shared history/notes phrasing fixture consumed by `history.ts` and
   `VersionNotes.java`, with a parity test.
4. Move `inventory.generated.ts` / `palette.generated.ts` to a `gen` step; gitignore
   or add a CI drift check.
5. ADR-0001 (from Phase 0) covers the concurrency model.

## Phase 3 — P2 hardening

1. Scheduled trash purge (currently only runs inside `trashVersion()`, so expired
   trash lingers if a deck is never deleted again) with the advisory-lock pattern.
2. Document the single-node rate limiter; warn if replicas > 1. Defer Redis.
3. `ExploreRepositoryTest.report`: idempotent duplicate, own-deck, private-deck,
   plus optional-auth paths.
4. Moderation screen (**decision needed**): `GET /api/admin/reports` + list/dismiss.

## Phase 4 — P3 polish

1. Warn before deleting custom art with `usedIn > 0`.
2. Trim/collapse branch names client-side and pre-check case-insensitive duplicates.
3. Keyboard parity for branch pills and `BranchMenu`.
4. Dock contrast audit over the brightest custom art.
5. Weekly Archidekt export smoke test.
6. Merge preview note for board-move + simultaneous edit (**evaluative**).

## Sequencing

```
Phase 0 ─▶ Phase 1 (1.1, 1.2 first) ─▶ Phase 2 ─▶ Phase 3 ─▶ Phase 4
                    └─ CI gates: typecheck, lib tests, DB tests, generated-code drift
```

Definition of done per item: test added, CI green, no behavior change outside the item.
