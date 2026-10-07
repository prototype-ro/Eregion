-- Matching card names the way people type them: ignoring case, accents, ligatures and curly quotes.
CREATE EXTENSION IF NOT EXISTS unaccent;

-- unaccent itself is not marked immutable, so an index needs this wrapper. It must stay in step with
-- NameNormalizer in the API, which prepares the names that are looked up.
CREATE OR REPLACE FUNCTION eregion_norm(name text) RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    AS $$ SELECT lower(public.unaccent('public.unaccent', name)) $$;

CREATE INDEX cards_name_norm_idx ON cards (eregion_norm(name));
CREATE INDEX cards_front_face_norm_idx ON cards (eregion_norm(split_part(name, ' // ', 1)));

-- Whether the card may be played in a Commander deck: legal, not_legal or banned, from Scryfall.
-- unknown until the card has been read again, which the price refresh does.
ALTER TABLE cards ADD COLUMN commander_legality TEXT NOT NULL DEFAULT 'unknown';
