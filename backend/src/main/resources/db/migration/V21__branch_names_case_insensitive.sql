-- Branch names were unique case-sensitively, so a deck could end up with "Side" and "side". Every
-- other name in Eregion (emails, cards, tags) is matched ignoring case, so branches were the odd one
-- out. Rename the later duplicates first, then replace the constraint with a lower(name) index.
--
-- The main branch is kept as-is even when another branch sorts earlier: the deck's main line is
-- identified by is_main, but its name should not change under the player.
DO $$
DECLARE
    duplicate RECORD;
    candidate TEXT;
    suffix INT;
BEGIN
    FOR duplicate IN
        SELECT b.id, b.deck_id, b.name,
               row_number() OVER (
                   PARTITION BY b.deck_id, lower(b.name)
                   ORDER BY b.is_main DESC, b.created_at, b.id
               ) AS place
          FROM deck_branches b
    LOOP
        IF duplicate.place > 1 THEN
            suffix := 2;
            LOOP
                candidate := duplicate.name || ' ' || suffix;
                EXIT WHEN NOT EXISTS (
                    SELECT 1 FROM deck_branches x
                     WHERE x.deck_id = duplicate.deck_id AND lower(x.name) = lower(candidate));
                suffix := suffix + 1;
            END LOOP;
            UPDATE deck_branches SET name = candidate WHERE id = duplicate.id;
        END IF;
    END LOOP;
END $$;

ALTER TABLE deck_branches DROP CONSTRAINT IF EXISTS deck_branches_name_unique;
CREATE UNIQUE INDEX deck_branches_name_lower_idx ON deck_branches (deck_id, lower(name));
