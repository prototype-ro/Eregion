-- Variants (branches and merging) are an advanced way to keep a deck's history. Off until the player turns them on in
-- Account: then the timeline offers to start a variant and to bring one back into the main deck.
ALTER TABLE users ADD COLUMN variants_enabled boolean NOT NULL DEFAULT false;
