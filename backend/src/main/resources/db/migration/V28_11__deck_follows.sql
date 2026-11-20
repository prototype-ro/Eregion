-- Following a public deck, and a weekly email of the followed decks that published a new version. The email is the
-- one reason to come back that the product makes by itself; it is opt-in per deck, and one click turns it all off.
CREATE TABLE deck_follows (
    user_id                UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    deck_id                UUID NOT NULL REFERENCES decks (id) ON DELETE CASCADE,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- The published version number the follower was last told about (or saw when they followed).
    last_notified_version  INT,
    PRIMARY KEY (user_id, deck_id)
);
CREATE INDEX deck_follows_deck_idx ON deck_follows (deck_id);

-- Whether the weekly email goes out at all, and the secret in its one-click unsubscribe link.
ALTER TABLE users ADD COLUMN digest_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN digest_token UUID NOT NULL DEFAULT gen_random_uuid();
