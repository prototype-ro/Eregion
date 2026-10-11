-- A deleted version is kept here for a while so the delete can be undone: the version, its cards, and which
-- versions and branches were moved onto its parent, so undoing puts everything back where it was.
CREATE TABLE trashed_versions (
    id                     UUID PRIMARY KEY,
    deck_id                UUID        NOT NULL REFERENCES decks (id) ON DELETE CASCADE,
    version_number         INT         NOT NULL,
    branch_id              UUID        NOT NULL,
    branch_name            TEXT        NOT NULL,
    branch_forked_from_id  UUID,
    branch_removed         BOOLEAN     NOT NULL,
    parent_version_id      UUID,
    merge_parent_version_id UUID,
    note                   TEXT        NOT NULL DEFAULT '',
    created_at             TIMESTAMPTZ NOT NULL,
    moved_children         UUID[]      NOT NULL DEFAULT '{}',
    moved_merge_children   UUID[]      NOT NULL DEFAULT '{}',
    moved_branches         UUID[]      NOT NULL DEFAULT '{}',
    cards                  JSONB       NOT NULL,
    trashed_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT trashed_versions_number_unique UNIQUE (deck_id, version_number)
);
CREATE INDEX trashed_versions_deck_idx ON trashed_versions (deck_id, trashed_at DESC);
