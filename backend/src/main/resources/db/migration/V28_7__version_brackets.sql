-- The bracket of a saved version, worked out in the background, so the decks list and Explore can show it on every
-- deck without analysing each one on the spot (an analysis plays hundreds of simulated games). A version whose cards
-- change in place loses its row and is worked out again.
CREATE TABLE version_brackets (
    version_id  UUID PRIMARY KEY REFERENCES deck_versions(id) ON DELETE CASCADE,
    bracket     INT  NOT NULL,
    name        TEXT NOT NULL,
    computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
