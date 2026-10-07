-- Email verification and revocable sessions.
-- Accounts that exist already are treated as verified, so nobody is locked out of publishing by this change.
ALTER TABLE users
    ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN token_version  INT     NOT NULL DEFAULT 0;
UPDATE users SET email_verified = TRUE;

-- One use links for verifying an email address and resetting a password. Only a hash of the link's
-- secret is kept, so a leaked database does not leak working links.
CREATE TABLE auth_tokens (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    purpose    TEXT        NOT NULL,
    token_hash TEXT        NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT auth_tokens_purpose_chk CHECK (purpose IN ('verify', 'reset'))
);
CREATE INDEX auth_tokens_user_idx ON auth_tokens (user_id, purpose);
