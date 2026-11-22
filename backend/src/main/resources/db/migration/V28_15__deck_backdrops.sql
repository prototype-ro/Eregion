-- The art behind a deck's header, when the owner chose an Art Series card. No row: the commander's art is shown.
CREATE TABLE deck_backdrops (
    deck_id     uuid PRIMARY KEY REFERENCES decks (id) ON DELETE CASCADE,
    scryfall_id uuid NOT NULL,
    name        text NOT NULL,
    artist      text,
    set_name    text,
    art_url     text NOT NULL,
    chosen_at   timestamptz NOT NULL DEFAULT now()
);
