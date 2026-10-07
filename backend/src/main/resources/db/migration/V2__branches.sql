-- Branches: a deck can split into parallel lines of development from any version,
-- like a timeline that forks. Every deck starts on a branch called "main".
CREATE TABLE deck_branches (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deck_id                UUID        NOT NULL REFERENCES decks (id) ON DELETE CASCADE,
    name                   TEXT        NOT NULL,
    forked_from_version_id UUID        REFERENCES deck_versions (id),
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT deck_branches_name_unique UNIQUE (deck_id, name)
);

ALTER TABLE deck_versions
    ADD COLUMN branch_id          UUID REFERENCES deck_branches (id),
    ADD COLUMN parent_version_id  UUID REFERENCES deck_versions (id);

-- Existing decks become a single "main" line, each version pointing at the one before it.
INSERT INTO deck_branches (deck_id, name)
SELECT id, 'main' FROM decks;

UPDATE deck_versions v
   SET branch_id = b.id
  FROM deck_branches b
 WHERE b.deck_id = v.deck_id AND b.name = 'main';

UPDATE deck_versions v
   SET parent_version_id = p.id
  FROM deck_versions p
 WHERE p.deck_id = v.deck_id AND p.version_number = v.version_number - 1;

ALTER TABLE deck_versions ALTER COLUMN branch_id SET NOT NULL;

CREATE INDEX deck_versions_branch_idx ON deck_versions (branch_id, version_number);
