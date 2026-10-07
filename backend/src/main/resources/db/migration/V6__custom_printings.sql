-- Art a player made or collected themselves, such as proxies. It belongs to one player and one card,
-- and can be pinned on a deck line instead of one of Scryfall's printings.
CREATE TABLE custom_printings (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    card_id      UUID        NOT NULL REFERENCES cards (id),
    label        TEXT        NOT NULL,
    content_type TEXT        NOT NULL,
    data         BYTEA       NOT NULL,
    size_bytes   INT         NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT custom_printings_type_chk CHECK (content_type IN ('image/png', 'image/jpeg', 'image/webp'))
);
CREATE INDEX custom_printings_user_card_idx ON custom_printings (user_id, card_id);

-- Deleting art does not delete a deck version: its lines fall back to the card's default printing.
ALTER TABLE deck_version_cards
    ADD COLUMN custom_printing_id UUID REFERENCES custom_printings (id) ON DELETE SET NULL,
    ADD CONSTRAINT dvc_one_printing_chk CHECK (printing_id IS NULL OR custom_printing_id IS NULL);
