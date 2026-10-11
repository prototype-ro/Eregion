-- Each saved card line keeps the price it had when the version was saved, so a version's cost no longer
-- drifts with the market and comparing two versions measures edits, not price changes.
ALTER TABLE deck_version_cards ADD COLUMN price_usd NUMERIC(10,2);

-- Existing versions start from today's prices, the best that can be known now.
UPDATE deck_version_cards dc
   SET price_usd = (SELECT CASE WHEN p.scryfall_id IS NOT NULL THEN p.price_usd ELSE c.price_usd END
                      FROM cards c LEFT JOIN card_printings p ON p.scryfall_id = dc.printing_id
                     WHERE c.id = dc.card_id);
