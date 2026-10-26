-- ADS Business Opportunities isolated catalogue / v1.
-- Apply only to the designated catalogue database with a migration owner.
-- Does not touch identity, Commerce, the landing-page registry or any sector DB.
BEGIN;
CREATE SCHEMA IF NOT EXISTS opportunities;
CREATE TABLE IF NOT EXISTS opportunities.sectors (
  id text PRIMARY KEY,
  name_en text NOT NULL,
  business_examples jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_repos jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence text,
  published boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS opportunities.capabilities (
  id text PRIMARY KEY,
  name_en text NOT NULL,
  description_en text NOT NULL,
  evidence_status text NOT NULL DEFAULT 'catalogue_candidate',
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS opportunities.sector_opportunities (
  id text PRIMARY KEY,
  sector_id text NOT NULL REFERENCES opportunities.sectors(id),
  capability_id text NOT NULL REFERENCES opportunities.capabilities(id),
  title_en text NOT NULL,
  summary_en text NOT NULL,
  summary_fr text,
  model_en text NOT NULL,
  model_fr text,
  business_examples jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_repos jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_evidence text,
  readiness text NOT NULL DEFAULT 'discovery_only'
    CHECK (readiness IN ('discovery_only','in_development','verified_demo')),
  published boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sector_id, capability_id)
);
CREATE TABLE IF NOT EXISTS opportunities.business_types (
  id text PRIMARY KEY,
  display_name text NOT NULL,
  sector_id text REFERENCES opportunities.sectors(id),
  sector_name text NOT NULL,
  recommended_tools jsonb NOT NULL DEFAULT '[]'::jsonb,
  visitor_pathway text,
  readiness text NOT NULL DEFAULT 'discovery_only',
  published boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sector_opportunities_sector_idx
  ON opportunities.sector_opportunities(sector_id)
  WHERE published;
CREATE INDEX IF NOT EXISTS sector_opportunities_search_idx
  ON opportunities.sector_opportunities
  USING gin (to_tsvector('simple', title_en || ' ' || summary_en));
CREATE INDEX IF NOT EXISTS business_types_name_idx
  ON opportunities.business_types(lower(display_name));
COMMIT;
