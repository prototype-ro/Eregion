CREATE TABLE card_renders (
    deck_id UUID NOT NULL REFERENCES decks(id),
    card_id UUID NOT NULL REFERENCES cards(id),
    image_data BYTEA NOT NULL,
    inputs_hash VARCHAR(64) NOT NULL,
    rendered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (deck_id, card_id)
);
