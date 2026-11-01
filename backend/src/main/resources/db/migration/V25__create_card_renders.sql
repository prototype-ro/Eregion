CREATE TABLE card_renders (
    card_id UUID PRIMARY KEY REFERENCES cards(id),
    image_data BYTEA NOT NULL,
    inputs_hash VARCHAR(64) NOT NULL,
    rendered_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
