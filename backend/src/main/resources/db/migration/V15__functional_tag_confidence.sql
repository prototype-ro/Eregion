-- A card can now have several roles. Each row says how sure we are (confidence) and whether it is the card's main role (is_primary).
-- The main role is what the Role view groups by and what the stats count, so a card is never counted twice. A row from a
-- community source (scryfall) is trusted fully; a row from a text rule (regex) is a guess and scores lower.
ALTER TABLE card_functional_tags
    ADD COLUMN confidence REAL    NOT NULL DEFAULT 1,
    ADD COLUMN is_primary BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE card_functional_tags DROP CONSTRAINT card_functional_tags_pkey;
ALTER TABLE card_functional_tags ADD PRIMARY KEY (card_id, category, source);
-- Exactly one main role per card, at most. A card with no row has no known role.
CREATE UNIQUE INDEX card_functional_tags_one_primary_idx ON card_functional_tags (card_id) WHERE is_primary;
