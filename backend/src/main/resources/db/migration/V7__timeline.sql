-- Version numbers only ever go up, so deleting versions or branches never lets a number be reused
-- (old links and the published version label stay unambiguous).
ALTER TABLE decks ADD COLUMN next_version_number INT NOT NULL DEFAULT 1;
UPDATE decks d SET next_version_number =
    COALESCE((SELECT MAX(v.version_number) FROM deck_versions v WHERE v.deck_id = d.id), 0) + 1;

-- Each deck has exactly one main branch, the one other branches merge into. It is no longer
-- recognised by having no fork point, which stops being true once versions can be deleted.
ALTER TABLE deck_branches ADD COLUMN is_main BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE deck_branches b SET is_main = TRUE WHERE b.id = (
    SELECT x.id FROM deck_branches x WHERE x.deck_id = b.deck_id
     ORDER BY (x.forked_from_version_id IS NOT NULL), x.created_at, x.id LIMIT 1);
CREATE UNIQUE INDEX deck_branches_one_main_idx ON deck_branches (deck_id) WHERE is_main;

-- A merge version has a second parent: the newest version of the branch that was merged in. Later
-- merges of that branch then only bring what changed since.
ALTER TABLE deck_versions
    ADD COLUMN merge_parent_version_id UUID REFERENCES deck_versions (id) ON DELETE SET NULL;

-- A version has at most one child on its own branch, so two tabs saving at once cannot fork a line silently.
CREATE UNIQUE INDEX deck_versions_one_child_idx ON deck_versions (branch_id, parent_version_id)
    WHERE parent_version_id IS NOT NULL;
