-- What a card does in a deck (Ramp, Removal, ...), taken from outside data and kept apart from the card itself:
-- it is derived, and refreshed by a sync job, so a card can exist without one. A card has at most one tag per source,
-- so a second source (a rule engine, say) can sit next to the Scryfall one without a schema change.
CREATE TABLE card_functional_tags (
    card_id   UUID        NOT NULL REFERENCES cards (id) ON DELETE CASCADE,
    category  TEXT        NOT NULL,
    source    TEXT        NOT NULL DEFAULT 'scryfall',
    synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (card_id, source)
);
CREATE INDEX card_functional_tags_category_idx ON card_functional_tags (category);
