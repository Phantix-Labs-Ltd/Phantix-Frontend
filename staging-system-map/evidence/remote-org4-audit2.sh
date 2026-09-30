set -u
API=$(docker ps --filter name=api- --format '{{.Names}}' | head -1)
DB=$(docker ps --filter name=db- --format '{{.Names}}' | head -1)
SEC=$(docker ps --filter name=bench-security-db --format '{{.Names}}' | head -1)
TOK=$(docker inspect phantix-agi-runner --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n 's/^PHANTIX_AGI_SERVICE_TOKEN=//p')

echo "=== org 4 rows in the PLATFORM db (every table with organization_id) ==="
docker exec -i "$DB" psql -U phantix -d phantix -tA <<'SQL'
SELECT format('SELECT %L AS tbl, count(*) AS n FROM public.%I WHERE organization_id = 4;', c.relname, c.relname)
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
  AND EXISTS (SELECT 1 FROM information_schema.columns col
              WHERE col.table_schema='public' AND col.table_name=c.relname
                AND col.column_name='organization_id')
ORDER BY 1;
\gexec
SQL

echo
echo "=== security schema: tables that actually hold rows ==="
docker exec -i "$SEC" psql -U phantix -d phantix_security -tA <<'SQL'
SELECT format('SELECT %L AS tbl, count(*) AS n FROM phantix.%I;', tablename, tablename)
FROM pg_tables WHERE schemaname='phantix' ORDER BY tablename;
\gexec
SQL

echo
echo "=== runner: sandbox pool (authed) ==="
curl -s -m 8 -H "Authorization: Bearer $TOK" http://127.0.0.1:8095/v1/sandbox/pool | head -c 900
echo
echo "=== runner: tools monitor (authed) ==="
curl -s -m 8 -H "Authorization: Bearer $TOK" http://127.0.0.1:8095/v1/tools/monitor | head -c 900
echo
echo "=== runner: sandbox containers ==="
docker ps -a --filter name=phantix-agi- --format '{{.Names}}|{{.Status}}'
echo
echo "=== agi tables in the platform db ==="
docker exec -i "$DB" psql -U phantix -d phantix -tAc "select tablename from pg_tables where schemaname='public' and tablename like 'agi%' order by 1"
