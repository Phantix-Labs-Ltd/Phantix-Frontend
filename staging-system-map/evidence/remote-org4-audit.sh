set -u
API=$(docker ps --filter name=api- --format '{{.Names}}' | head -1)
DB=$(docker ps --filter name=db- --format '{{.Names}}' | head -1)
SEC=$(docker ps --filter name=bench-security-db --format '{{.Names}}' | head -1)
echo "api=$API"
echo "platform_db=$DB"
echo "security_db=$SEC"
echo
echo "=== org 4 scoped rows in the PLATFORM db ==="
docker exec "$DB" psql -U phantix -d phantix -tAc "
WITH t AS (
  SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r'
    AND EXISTS (SELECT 1 FROM information_schema.columns col
                WHERE col.table_schema='public' AND col.table_name=c.relname
                  AND col.column_name='organization_id')
)
SELECT t.relname, (SELECT count(*) FROM public.\"\"||t.relname||\"\" x WHERE x.organization_id=4)
FROM t WHERE t.relname NOT LIKE 'pg_%' ORDER BY 2 DESC, 1;
" 2>/dev/null || docker exec "$DB" psql -U phantix -d phantix -tAc "select 'fallback'"
echo
echo "=== security DB schemas ==="
docker exec "$SEC" psql -U phantix -d phantix_security -tAc "select nspname from pg_namespace where nspname not like 'pg_%' and nspname<>'information_schema'"
echo
echo "=== security schema table row counts (phantix schema) ==="
docker exec "$SEC" psql -U phantix -d phantix_security -tAc "
SELECT tablename || '=' || (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from phantix.%I', tablename), false, true, '')))[1]::text
FROM pg_tables WHERE schemaname='phantix' ORDER BY tablename;
" 2>/dev/null | head -60
echo
echo "=== security schema table count ==="
docker exec "$SEC" psql -U phantix -d phantix_security -tAc "select count(*) from pg_tables where schemaname='phantix'"
echo
echo "=== live AGI sessions (runner) ==="
curl -s -m 8 http://127.0.0.1:8095/health | head -c 400
echo
echo "=== sandbox pool ==="
curl -s -m 8 http://127.0.0.1:8095/v1/sandbox/pool | head -c 600
echo
echo "=== runner tools monitor ==="
curl -s -m 8 http://127.0.0.1:8095/v1/tools/monitor | head -c 800
