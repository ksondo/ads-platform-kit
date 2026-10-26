-- Add standalone, public discovery families and coherent business solution bundles.
-- Does not change the 333 tool mappings, Commerce or ADS Identity.
BEGIN;
CREATE TABLE IF NOT EXISTS opportunities.discovery_categories (
  id text PRIMARY KEY,
  family text NOT NULL CHECK (family IN ('business','institutional')),
  name_en text NOT NULL,
  published boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS opportunities.discovery_solutions (
  id text PRIMARY KEY,
  family text NOT NULL CHECK (family IN ('business','institutional')),
  category_id text NOT NULL REFERENCES opportunities.discovery_categories(id),
  sector_id text REFERENCES opportunities.sectors(id),
  title_en text NOT NULL,
  summary_en text NOT NULL CHECK (length(summary_en) BETWEEN 60 AND 1200),
  tools jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(tools)='array'),
  examples jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(examples)='array'),
  readiness text NOT NULL CHECK (readiness IN ('concept','proposal','verified_demo')),
  source_kind text NOT NULL,
  required_permission_summary text,
  verified_demo_url text,
  published boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT verified_demo_requires_url CHECK (readiness <> 'verified_demo' OR verified_demo_url ~ '^https://')
);
CREATE INDEX IF NOT EXISTS discovery_solutions_family_category_idx ON
 opportunities.discovery_solutions(family,category_id) WHERE published;
CREATE INDEX IF NOT EXISTS discovery_solutions_search_idx ON
 opportunities.discovery_solutions USING gin
 (to_tsvector('simple',title_en || ' ' || summary_en));
COMMIT;
