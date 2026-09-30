#!/usr/bin/env bash
DB=$(docker ps --filter name=db- --format '{{.Names}}' | head -1)
SEC=$(docker ps --filter name=bench-security-db --format '{{.Names}}' | head -1)
echo "── platform: org-4 rows still present ──"
docker exec -i "$DB" psql -U phantix -d phantix -tA <<'SQL'
SELECT format('SELECT %L AS tbl, count(*) AS n FROM public.%I WHERE organization_id = 4;', c.relname, c.relname)
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r'
  AND EXISTS (SELECT 1 FROM information_schema.columns col
              WHERE col.table_schema='public' AND col.table_name=c.relname AND col.column_name='organization_id')
ORDER BY 1;
\gexec
SQL
echo "── security: phantix.* rows still present ──"
docker exec -i "$SEC" psql -U phantix -d phantix_security -tA <<'SQL'
SELECT format('SELECT %L AS tbl, count(*) AS n FROM phantix.%I;', tablename, tablename)
FROM pg_tables WHERE schemaname='phantix' ORDER BY tablename;
\gexec
SQL
