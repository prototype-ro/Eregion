-- The Lore Creator. A structured document for the deck's invented setting, edited by the interface and
-- rendered into the free-text `lore` column (which the proxy prompt still reads) on every save.
ALTER TABLE decks
    ADD COLUMN lore_doc JSONB;
