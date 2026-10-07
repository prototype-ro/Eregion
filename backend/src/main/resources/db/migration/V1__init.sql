CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT        NOT NULL,
    password_hash TEXT        NOT NULL,
    display_name  TEXT        NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_lower_idx ON users (lower(email));

CREATE TABLE cards (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scryfall_id    UUID         NOT NULL UNIQUE,
    name           TEXT         NOT NULL,
    mana_cost      TEXT         NOT NULL DEFAULT '',
    mana_value     NUMERIC(5,1) NOT NULL DEFAULT 0,
    type_line      TEXT         NOT NULL,
    primary_type   TEXT         NOT NULL,
    colors         TEXT         NOT NULL DEFAULT '',
    color_identity TEXT         NOT NULL DEFAULT '',
    oracle_text    TEXT         NOT NULL DEFAULT '',
    set_code       TEXT         NOT NULL DEFAULT '',
    rarity         TEXT         NOT NULL DEFAULT '',
    artist         TEXT         NOT NULL DEFAULT '',
    image_small    TEXT         NOT NULL DEFAULT '',
    image_normal   TEXT         NOT NULL DEFAULT '',
    image_art_crop TEXT         NOT NULL DEFAULT '',
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT cards_primary_type_chk CHECK (primary_type IN
        ('Creature','Planeswalker','Instant','Sorcery','Artifact','Enchantment','Land','Battle','Other'))
);
CREATE UNIQUE INDEX cards_name_lower_idx ON cards (lower(name));
CREATE INDEX cards_name_trgm_idx ON cards USING gin (name gin_trgm_ops);

CREATE TABLE decks (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id    UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name        TEXT        NOT NULL,
    format      TEXT        NOT NULL DEFAULT 'commander',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX decks_owner_idx ON decks (owner_id, updated_at DESC);

-- Each version is a full snapshot of the card list. Diffs are computed on read.
CREATE TABLE deck_versions (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deck_id        UUID        NOT NULL REFERENCES decks (id) ON DELETE CASCADE,
    version_number INT         NOT NULL,
    note           TEXT        NOT NULL DEFAULT '',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT deck_versions_unique UNIQUE (deck_id, version_number),
    CONSTRAINT deck_versions_number_chk CHECK (version_number >= 1)
);

CREATE TABLE deck_version_cards (
    version_id UUID NOT NULL REFERENCES deck_versions (id) ON DELETE CASCADE,
    card_id    UUID NOT NULL REFERENCES cards (id),
    board      TEXT NOT NULL,
    quantity   INT  NOT NULL,
    PRIMARY KEY (version_id, card_id, board),
    CONSTRAINT dvc_board_chk CHECK (board IN ('commander','main','maybe','considering')),
    CONSTRAINT dvc_quantity_chk CHECK (quantity >= 1)
);

CREATE TABLE collection_entries (
    user_id  UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    card_id  UUID NOT NULL REFERENCES cards (id),
    quantity INT  NOT NULL,
    PRIMARY KEY (user_id, card_id),
    CONSTRAINT collection_quantity_chk CHECK (quantity >= 1)
);
