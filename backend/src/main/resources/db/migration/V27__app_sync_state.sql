-- When each background job last ran, so a restart does not immediately repeat work that is still fresh.
CREATE TABLE app_sync_state (
    job       TEXT PRIMARY KEY,
    synced_at TIMESTAMPTZ NOT NULL
);
