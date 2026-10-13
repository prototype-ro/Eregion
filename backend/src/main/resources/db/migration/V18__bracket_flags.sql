-- Facts about cards that decide a Commander bracket (Game Changers, extra turns), read from Scryfall by a sync job.
-- Kept by normalized name rather than card id, so a card imported after the last sync is flagged the moment it exists.
CREATE TABLE bracket_flag_names (
    name_norm TEXT        NOT NULL,
    flag      TEXT        NOT NULL,
    source    TEXT        NOT NULL DEFAULT 'scryfall',
    synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (name_norm, flag)
);
CREATE INDEX bracket_flag_names_flag_idx ON bracket_flag_names (flag);
