-- The card render feature was removed from the code, but its two tables still pointed at decks with no ON DELETE
-- rule, so deleting a deck (or an account) that ever had renders failed with a foreign key error. Their rows now go
-- with the deck, like every other table that belongs to one.

ALTER TABLE card_renders DROP CONSTRAINT card_renders_deck_id_fkey;
ALTER TABLE card_renders ADD CONSTRAINT card_renders_deck_id_fkey FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE CASCADE;

ALTER TABLE card_renders DROP CONSTRAINT card_renders_card_id_fkey;
ALTER TABLE card_renders ADD CONSTRAINT card_renders_card_id_fkey FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE;

ALTER TABLE deck_frame_settings DROP CONSTRAINT deck_frame_settings_deck_id_fkey;
ALTER TABLE deck_frame_settings ADD CONSTRAINT deck_frame_settings_deck_id_fkey FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE CASCADE;
