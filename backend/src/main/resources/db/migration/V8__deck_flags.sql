-- Favourite decks float to the top of the list. Archived decks are tucked away without being deleted.
ALTER TABLE decks
    ADD COLUMN pinned   BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN archived BOOLEAN NOT NULL DEFAULT FALSE;
