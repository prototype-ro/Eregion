-- A public deck can show the versions that led to its published one: the history is what Eregion is about, and it
-- was the one thing a visitor never saw. Only the published version and its ancestors are ever shown, never a later
-- private edit, and the owner can turn it off.
ALTER TABLE decks ADD COLUMN public_history BOOLEAN NOT NULL DEFAULT TRUE;
