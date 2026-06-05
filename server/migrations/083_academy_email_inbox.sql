-- Migration 083: Academy pipeline email inbox
-- Stores inbound emails CC'd to testdrive@ftwmotorsport.com that could not be
-- automatically matched to a prospect, pending manual linking.

CREATE TABLE IF NOT EXISTS academy_email_inbox (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id           TEXT         UNIQUE NOT NULL,          -- RFC 2822 Message-ID, dedup guard
  from_email           TEXT         NOT NULL,
  from_name            TEXT,
  subject              TEXT,
  snippet              TEXT,                                   -- plain-text preview, max 400 chars
  all_addresses        JSONB        NOT NULL DEFAULT '[]',    -- every from/to/cc address in the email
  received_at          TIMESTAMPTZ  NOT NULL,
  linked_prospect_id   UUID         REFERENCES academy_prospects(id) ON DELETE SET NULL,
  linked_at            TIMESTAMPTZ,
  dismissed            BOOLEAN      NOT NULL DEFAULT false,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aei_unmatched
  ON academy_email_inbox (dismissed, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_aei_linked_prospect
  ON academy_email_inbox (linked_prospect_id)
  WHERE linked_prospect_id IS NOT NULL;
