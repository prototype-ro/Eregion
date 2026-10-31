-- Bring eregion_norm in line with NameNormalizer in the API.
--
-- Resolvers pass NameNormalizer.normalize(name) into queries that compare it against
-- eregion_norm(cards.name), so both sides have to produce the same string. Until now the SQL
-- function only dropped accents: it left curly quotes, dashes and ligatures alone and did not
-- collapse spaces, so names such as "Æther Vial" or "Atraxa, Praetors’ Voice" could miss.
--
-- The order mirrors the Java method: fold quotes and dashes, spell out ligatures, drop combining
-- marks (unaccent), collapse whitespace, lower-case.
CREATE OR REPLACE FUNCTION eregion_norm(name text) RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    AS $$
        SELECT lower(public.unaccent('public.unaccent',
            btrim(regexp_replace(
                translate(
                    replace(replace(replace(replace(replace(
                        name,
                        $q$Æ$q$, $q$AE$q$),
                        $q$æ$q$, $q$ae$q$),
                        $q$Œ$q$, $q$OE$q$),
                        $q$œ$q$, $q$oe$q$),
                        $q$ß$q$, $q$ss$q$),
                    $q$‘’ʼ´`“”‐‑‒–—$q$,
                    $q$'''''""-----$q$),
                '\s+', ' ', 'g')
            ))
        )
    $$;

-- Index expressions were computed with the old function. Replacing the function does not rewrite
-- them, so both indexes have to be rebuilt or lookups will not see the new form.
DROP INDEX IF EXISTS cards_name_norm_idx;
DROP INDEX IF EXISTS cards_front_face_norm_idx;
CREATE INDEX cards_name_norm_idx ON cards (eregion_norm(name));
CREATE INDEX cards_front_face_norm_idx ON cards (eregion_norm(split_part(name, ' // ', 1)));
