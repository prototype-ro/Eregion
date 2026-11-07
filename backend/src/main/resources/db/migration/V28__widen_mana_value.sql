-- Joke/un-set cards go as high as a million mana value (e.g. Gleemax), which overflowed the original NUMERIC(5,1)
-- once the bulk catalog sync started loading the whole card pool instead of only the cards people actually added.
ALTER TABLE cards ALTER COLUMN mana_value TYPE NUMERIC(8,1);
