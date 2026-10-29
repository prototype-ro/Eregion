-- Proxy creator. The lore belongs to the deck. A treatment is one card's proxy in one deck, and survives every version.
-- Each generation is kept, and the treatment points at the one the player picked.
ALTER TABLE decks
    ADD COLUMN lore      TEXT,
    ADD COLUMN mj_params TEXT;

CREATE TABLE proxy_treatments (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deck_id               UUID        NOT NULL REFERENCES decks (id) ON DELETE CASCADE,
    card_id               UUID        NOT NULL REFERENCES cards (id),
    mode                  TEXT        NOT NULL,
    current_generation_id UUID,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT proxy_treatments_mode_chk CHECK (mode IN ('NICKNAME', 'RESKIN')),
    CONSTRAINT proxy_treatments_one_per_card UNIQUE (deck_id, card_id)
);

CREATE TABLE proxy_generations (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    treatment_id   UUID        NOT NULL REFERENCES proxy_treatments (id) ON DELETE CASCADE,
    instruction    TEXT,
    nickname       TEXT,
    character_json TEXT        NOT NULL,
    prompt         TEXT        NOT NULL,
    model          TEXT        NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX proxy_generations_treatment_idx ON proxy_generations (treatment_id, created_at DESC);

ALTER TABLE proxy_treatments
    ADD CONSTRAINT proxy_treatments_current_fk FOREIGN KEY (current_generation_id) REFERENCES proxy_generations (id) ON DELETE SET NULL;
