-- A deck can hold tokens (the creature and artifact tokens it makes) on a board of their own. Like the maybeboard they do not count
-- toward the 100 cards.
ALTER TABLE deck_version_cards DROP CONSTRAINT dvc_board_chk;
ALTER TABLE deck_version_cards ADD CONSTRAINT dvc_board_chk CHECK (board IN ('commander','main','maybe','considering','tokens'));
