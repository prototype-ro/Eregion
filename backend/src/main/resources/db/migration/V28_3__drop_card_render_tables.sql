-- The card render feature is gone from the code, and nothing reads these tables any more. card_renders held the
-- rendered card images (well over a gigabyte on a well-used database), which only made every backup heavier.
DROP TABLE IF EXISTS card_renders;
DROP TABLE IF EXISTS deck_frame_settings;
