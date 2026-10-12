-- Small facts the functional tag job keeps for itself. For now one: a hash of the rule files its stored roles were worked out with,
-- so a restart only recomputes them when those files have changed.
CREATE TABLE functional_tag_state (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
