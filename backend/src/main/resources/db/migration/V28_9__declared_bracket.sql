-- The bracket the owner says the deck is, for the Rule 0 talk before a game: brackets are partly about intent, which
-- no analysis can read from the cards. Shown next to the worked-out one. Null when the owner has not said.
ALTER TABLE decks ADD COLUMN declared_bracket INT CHECK (declared_bracket BETWEEN 1 AND 5);
