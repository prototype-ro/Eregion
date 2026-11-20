-- Uploaded art can live in an S3-compatible bucket instead of the database, which keeps the database (and every
-- backup of it) small. stored_in says where each image's bytes are; data is empty for one in the bucket.
ALTER TABLE custom_printings ALTER COLUMN data DROP NOT NULL;
ALTER TABLE custom_printings ADD COLUMN stored_in TEXT NOT NULL DEFAULT 'database' CHECK (stored_in IN ('database', 's3'));

-- Art in the bucket outlives its row when the row goes by cascade (a deleted account, deck card or admin removal),
-- so the trigger notes it here and a job removes the objects.
CREATE TABLE art_garbage (
    id         UUID PRIMARY KEY,
    deleted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE FUNCTION note_bucket_art_deleted() RETURNS trigger AS $$
BEGIN
    IF OLD.stored_in = 's3' THEN
        INSERT INTO art_garbage (id) VALUES (OLD.id) ON CONFLICT DO NOTHING;
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER custom_printings_bucket_garbage AFTER DELETE ON custom_printings
    FOR EACH ROW EXECUTE FUNCTION note_bucket_art_deleted();
