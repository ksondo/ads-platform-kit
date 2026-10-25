-- P1: forward-only, scoped removal of previously published, withheld content.
-- Operator-only migration; DO NOT run as the SELECT-only public API account.
-- No broad truncate/reset. A clean fresh database is a no-op.
BEGIN;
DO $migration$
DECLARE
  withheld_id text;
  withheld_count integer;
  former_caps text[];
BEGIN
  SELECT id INTO withheld_id FROM opportunities.sectors
   WHERE evidence = 'Controlled staging only; not public-launch ready';
  IF withheld_id IS NULL THEN RETURN; END IF;
  SELECT count(*) INTO withheld_count FROM opportunities.sectors
   WHERE evidence = 'Controlled staging only; not public-launch ready';
  IF withheld_count <> 1 THEN
    RAISE EXCEPTION 'Unexpected number of withheld sector records (%)', withheld_count;
  END IF;
  SELECT count(*), array_agg(capability_id) INTO withheld_count, former_caps
    FROM opportunities.sector_opportunities WHERE sector_id=withheld_id;
  IF withheld_count <> 5 THEN
    RAISE EXCEPTION 'Unexpected withheld tool count (%); refusing deletion', withheld_count;
  END IF;
  SELECT count(*) INTO withheld_count FROM opportunities.discovery_solutions
    WHERE sector_id=withheld_id;
  IF withheld_count <> 1 THEN
    RAISE EXCEPTION 'Unexpected withheld bundle count (%); refusing deletion', withheld_count;
  END IF;
  DELETE FROM opportunities.discovery_solutions WHERE sector_id=withheld_id;
  DELETE FROM opportunities.business_types WHERE sector_id=withheld_id;
  DELETE FROM opportunities.sector_opportunities WHERE sector_id=withheld_id;
  DELETE FROM opportunities.sectors WHERE id=withheld_id;
  DELETE FROM opportunities.capabilities c
    WHERE c.id=ANY(former_caps)
      AND NOT EXISTS(SELECT 1 FROM opportunities.sector_opportunities o WHERE o.capability_id=c.id);
END
$migration$;
COMMIT;
