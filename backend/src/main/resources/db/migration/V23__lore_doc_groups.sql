-- Generalizes the lore document from a corruption-spectrum shape to races/tribes/factions, tales and cosmology,
-- so it fits a canon-based commander (Marvel, Lord of the Rings, ...) as well as an invented one. Rewrites the
-- one deck that already has a lore_doc under the old shape so it keeps working under the new one.
UPDATE decks
SET lore_doc = jsonb_build_object(
    'cosmology', jsonb_build_object(
        'overview', trim(concat_ws(' ',
            CASE WHEN coalesce(lore_doc -> 'cosmology' ->> 'maker', '') <> ''
                 THEN (lore_doc -> 'cosmology' ->> 'maker') || ' shaped this world.' END,
            CASE WHEN coalesce(lore_doc -> 'cosmology' ->> 'corruptor', '') <> ''
                 THEN (lore_doc -> 'cosmology' ->> 'corruptor') || ' stands as its central corrupting force.' END
        )),
        'forces', coalesce(lore_doc -> 'cosmology' -> 'spirits', '[]'::jsonb)
    ),
    'groups', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
            'id', t ->> 'id',
            'name', t ->> 'name',
            'description', t ->> 'definition',
            'traits', t ->> 'vocabulary'
        )), '[]'::jsonb)
        FROM jsonb_array_elements(coalesce(lore_doc -> 'tiers', '[]'::jsonb)) AS t
    ),
    'tales', '[]'::jsonb,
    'colors', coalesce(lore_doc -> 'colors', '[]'::jsonb),
    'characters', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
            'id', c ->> 'id',
            'name', c ->> 'name',
            'group', c ->> 'tier',
            'race', c ->> 'race',
            'role', c ->> 'role',
            'signature', c ->> 'signature'
        )), '[]'::jsonb)
        FROM jsonb_array_elements(coalesce(lore_doc -> 'characters', '[]'::jsonb)) AS c
    ),
    'naming', coalesce(lore_doc -> 'naming', '""'::jsonb),
    'gaps', coalesce(lore_doc -> 'gaps', '[]'::jsonb),
    'canonSource', 'null'::jsonb
)
WHERE lore_doc IS NOT NULL;
