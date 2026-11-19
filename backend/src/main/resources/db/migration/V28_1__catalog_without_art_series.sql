-- Scryfall's Art Series cards ("Mana Drain // Mana Drain", type line "Card // Card") are collectible art cards, not
-- game pieces. The bulk catalog load stored them, and since a double-faced card is also found by its front face, a
-- pasted "Mana Drain" could resolve to one: not legal, mana value 0, no colour identity. The code no longer stores or
-- matches them. This moves whatever already points at one onto the real card of the same name, then removes every
-- Art Series row nothing needs any more.

CREATE TEMP TABLE art_series_swap ON COMMIT DROP AS
SELECT a.id AS art_id, r.id AS real_id
  FROM cards a
  JOIN cards r ON lower(r.name) = lower(split_part(a.name, ' // ', 1))
 WHERE a.type_line = 'Card // Card'
   AND r.type_line <> 'Card // Card'
   AND r.type_line NOT LIKE 'Token%';

-- Deck lines. Where the same version already holds the real card on the same board, the copies join that line.
UPDATE deck_version_cards kept
   SET quantity = kept.quantity + art.quantity
  FROM deck_version_cards art
  JOIN art_series_swap s ON s.art_id = art.card_id
 WHERE kept.version_id = art.version_id AND kept.board = art.board AND kept.card_id = s.real_id;

DELETE FROM deck_version_cards art
 USING art_series_swap s, deck_version_cards kept
 WHERE art.card_id = s.art_id
   AND kept.version_id = art.version_id AND kept.board = art.board AND kept.card_id = s.real_id;

-- The pinned printing belonged to the Art Series card, so the line falls back to the real card's default printing.
UPDATE deck_version_cards d
   SET card_id = s.real_id, printing_id = NULL
  FROM art_series_swap s
 WHERE d.card_id = s.art_id;

-- Collections, the same way.
UPDATE collection_entries kept
   SET quantity = kept.quantity + art.quantity
  FROM collection_entries art
  JOIN art_series_swap s ON s.art_id = art.card_id
 WHERE kept.user_id = art.user_id AND kept.card_id = s.real_id;

DELETE FROM collection_entries art
 USING art_series_swap s, collection_entries kept
 WHERE art.card_id = s.art_id AND kept.user_id = art.user_id AND kept.card_id = s.real_id;

UPDATE collection_entries c SET card_id = s.real_id FROM art_series_swap s WHERE c.card_id = s.art_id;

-- A player's own art and proxy notes follow the card.
UPDATE custom_printings c SET card_id = s.real_id FROM art_series_swap s WHERE c.card_id = s.art_id;

DELETE FROM proxy_treatments art
 USING art_series_swap s, proxy_treatments kept
 WHERE art.card_id = s.art_id AND kept.deck_id = art.deck_id AND kept.card_id = s.real_id;

UPDATE proxy_treatments p SET card_id = s.real_id FROM art_series_swap s WHERE p.card_id = s.art_id;

-- Every Art Series row nothing points at any more goes. Printings and tags go with them (ON DELETE CASCADE).
DELETE FROM cards a
 WHERE a.type_line = 'Card // Card'
   AND NOT EXISTS (SELECT 1 FROM deck_version_cards d WHERE d.card_id = a.id)
   AND NOT EXISTS (SELECT 1 FROM collection_entries c WHERE c.card_id = a.id)
   AND NOT EXISTS (SELECT 1 FROM custom_printings c WHERE c.card_id = a.id)
   AND NOT EXISTS (SELECT 1 FROM proxy_treatments p WHERE p.card_id = a.id)
   AND NOT EXISTS (SELECT 1 FROM card_renders r WHERE r.card_id = a.id);

-- A token stored before the real card of the same name kept that card out of the catalog ("Llanowar Elves").
-- The bulk load now lets a real card take a token's row, so the next run should not wait out its usual week.
DELETE FROM app_sync_state WHERE job = 'bulk-catalog';
