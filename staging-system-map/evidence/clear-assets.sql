\set ON_ERROR_STOP on
SET client_min_messages TO notice;
BEGIN;
DO $$
DECLARE t text; n bigint := 0;
BEGIN
  SELECT count(*) INTO n FROM phantix.assets;
  RAISE NOTICE 'assets before: %', n;
  TRUNCATE phantix.asset_tag_assignments, phantix.asset_tags, phantix.asset_history,
           phantix.asset_relationships, phantix.asset_candidates, phantix.discovery_jobs,
           phantix.assets
    RESTART IDENTITY CASCADE;
  RAISE NOTICE 'assets after: %', (SELECT count(*) FROM phantix.assets);
END $$;
COMMIT;
