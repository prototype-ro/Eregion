CREATE TABLE deck_frame_settings (
    deck_id UUID PRIMARY KEY REFERENCES decks(id),
    artist_name VARCHAR(255),
    collection_code VARCHAR(16),
    frame_family VARCHAR(64) NOT NULL DEFAULT 'm15'
);
