-- When a card's price was last read from Scryfall. Null means never, which is true of every
-- card imported before prices existed, so the refresh job picks those up first.
ALTER TABLE cards ADD COLUMN price_updated_at TIMESTAMPTZ;
CREATE INDEX cards_price_updated_idx ON cards (price_updated_at NULLS FIRST);
