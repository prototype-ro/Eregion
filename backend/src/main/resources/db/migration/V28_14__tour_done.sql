-- Whether the player finished or skipped the deck page tour. Until then the deck page offers it once.
ALTER TABLE users ADD COLUMN tour_done boolean NOT NULL DEFAULT false;
