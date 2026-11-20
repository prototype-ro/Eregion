-- Deleting a deck removed it and every version at once, with no way back. A deleted deck now waits in the owner's
-- trash for 30 days (a scheduled job removes it after that), hidden from every list, page and Explore until restored.
ALTER TABLE decks ADD COLUMN deleted_at TIMESTAMPTZ;

CREATE INDEX decks_trash_idx ON decks (owner_id, deleted_at) WHERE deleted_at IS NOT NULL;
