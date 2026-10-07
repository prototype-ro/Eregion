-- Prices and set info on the default printing of each card.
ALTER TABLE cards
    ADD COLUMN price_usd        NUMERIC(10,2),
    ADD COLUMN set_name         TEXT NOT NULL DEFAULT '',
    ADD COLUMN collector_number TEXT NOT NULL DEFAULT '';

-- Every printing we have looked up for a card, so a deck line can pin the art it wants.
CREATE TABLE card_printings (
    scryfall_id      UUID PRIMARY KEY,
    card_id          UUID         NOT NULL REFERENCES cards (id) ON DELETE CASCADE,
    set_code         TEXT         NOT NULL,
    set_name         TEXT         NOT NULL DEFAULT '',
    collector_number TEXT         NOT NULL DEFAULT '',
    released_at      DATE,
    rarity           TEXT         NOT NULL DEFAULT '',
    artist           TEXT         NOT NULL DEFAULT '',
    image_small      TEXT         NOT NULL DEFAULT '',
    image_normal     TEXT         NOT NULL DEFAULT '',
    image_art_crop   TEXT         NOT NULL DEFAULT '',
    price_usd        NUMERIC(10,2),
    fetched_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX card_printings_card_idx ON card_printings (card_id, released_at DESC);

-- A deck line can pin a printing (null means the card's default) and carry custom tags.
ALTER TABLE deck_version_cards
    ADD COLUMN printing_id UUID REFERENCES card_printings (scryfall_id),
    ADD COLUMN tags        TEXT[] NOT NULL DEFAULT '{}';
