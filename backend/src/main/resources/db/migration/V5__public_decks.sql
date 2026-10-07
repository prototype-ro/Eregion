-- A deck is private unless its owner publishes one of its versions. Only that version is
-- shown to others, so later edits stay private until the owner publishes again.
ALTER TABLE decks
    ADD COLUMN visibility           TEXT NOT NULL DEFAULT 'private',
    ADD COLUMN published_version_id UUID REFERENCES deck_versions (id),
    ADD COLUMN published_at         TIMESTAMPTZ,
    ADD CONSTRAINT decks_visibility_chk CHECK (visibility IN ('private', 'public')),
    ADD CONSTRAINT decks_public_needs_version CHECK (visibility = 'private' OR published_version_id IS NOT NULL);

CREATE INDEX decks_public_idx ON decks (published_at DESC) WHERE visibility = 'public';
-- Finds decks by their commander.
CREATE INDEX deck_version_cards_commander_idx ON deck_version_cards (card_id) WHERE board = 'commander';
