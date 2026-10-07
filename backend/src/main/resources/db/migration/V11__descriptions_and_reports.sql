-- A deck can carry a description, such as a primer, shown on its public page.
ALTER TABLE decks ADD COLUMN description TEXT NOT NULL DEFAULT '';

-- Players can report a public deck. One report per player per deck. Someone with database access reviews them.
CREATE TABLE deck_reports (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deck_id     UUID        NOT NULL REFERENCES decks (id) ON DELETE CASCADE,
    reporter_id UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    reason      TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT deck_reports_once UNIQUE (deck_id, reporter_id)
);
CREATE INDEX deck_reports_deck_idx ON deck_reports (deck_id, created_at);
