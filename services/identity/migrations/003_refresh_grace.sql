-- Idempotent refresh-token rotation. Additive only.

-- Idempotent rotation: for a short grace window after a refresh token is rotated, presenting it
-- again returns the SAME successor instead of revoking the family (a reload that cut off the first
-- response). The successor is stored sealed with a key derived from the predecessor token itself,
-- so only someone who holds the old token can open it; a database read alone reveals nothing.
-- The sealed value is wiped once the grace window has passed (purgeExpired).
ALTER TABLE platform.refresh_tokens ADD COLUMN IF NOT EXISTS successor_id uuid;
ALTER TABLE platform.refresh_tokens ADD COLUMN IF NOT EXISTS successor_sealed text;
