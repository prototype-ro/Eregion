-- What the site's owner needs to moderate without hand-written SQL.
-- A disabled account cannot sign in; its sessions end and its public decks go private when it is disabled.
ALTER TABLE users ADD COLUMN disabled_at TIMESTAMPTZ;

-- A report outlives its reporter: deleting the account that reported a deck no longer erases the report.
ALTER TABLE deck_reports ALTER COLUMN reporter_id DROP NOT NULL;
ALTER TABLE deck_reports DROP CONSTRAINT deck_reports_reporter_id_fkey;
ALTER TABLE deck_reports ADD CONSTRAINT deck_reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES users (id) ON DELETE SET NULL;

-- What was done about a report, and when.
ALTER TABLE deck_reports ADD COLUMN resolved_at TIMESTAMPTZ, ADD COLUMN resolution TEXT;
