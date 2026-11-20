-- Signing out only cleared the cookie, so a copy of the token (from another tab's devtools, a proxy log, a shared
-- machine) stayed valid for the rest of its 12 hours. Each token now carries an id, and signing out records that id
-- here until the token would have expired anyway.
CREATE TABLE revoked_sessions (
    jti        UUID PRIMARY KEY,
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX revoked_sessions_expires_idx ON revoked_sessions (expires_at);
