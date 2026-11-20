-- Rate limit counters kept in the database instead of each server's memory: they survive a restart (which used to
-- clear every sign-in lockout) and are shared when more than one API server runs. One row per key and window.
CREATE TABLE rate_hits (
    key          TEXT   NOT NULL,
    window_start BIGINT NOT NULL,
    hits         INT    NOT NULL,
    PRIMARY KEY (key, window_start)
);

CREATE INDEX rate_hits_window_idx ON rate_hits (window_start);
