set -u
API=$(docker ps --filter name=api- --format '{{.Names}}' | head -1)
DB=$(docker ps --filter name=db- --format '{{.Names}}' | head -1)
SEC=$(docker ps --filter name=bench-security-db --format '{{.Names}}' | head -1)
TOK=$(docker inspect phantix-agi-runner --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n 's/^PHANTIX_AGI_SERVICE_TOKEN=//p')

echo "=== sandbox pool after teardown ==="
curl -s -m 8 -H "Authorization: Bearer $TOK" http://127.0.0.1:8095/v1/sandbox/pool
echo
echo "=== runner sessions ==="
curl -s -m 8 -H "Authorization: Bearer $TOK" http://127.0.0.1:8095/health | sed -n 's/.*"sessions":\([0-9]*\).*/sessions=\1/p'
echo
echo "=== database sizes ==="
docker exec "$DB" psql -U phantix -d phantix -tAc "select 'platform='||pg_size_pretty(pg_database_size('phantix'))"
docker exec "$SEC" psql -U phantix -d phantix_security -tAc "select 'security='||pg_size_pretty(pg_database_size('phantix_security'))"
docker exec "$SEC" psql -U phantix -d phantix_security -tAc "select 'phantix_schema='||pg_size_pretty(sum(pg_total_relation_size(format('%I.%I',schemaname,tablename)::regclass))) from pg_tables where schemaname='phantix'"
echo
echo "=== host disk ==="
df -h / | tail -1
echo
echo "=== biggest platform tables ==="
docker exec "$DB" psql -U phantix -d phantix -tAc "
select relname||' '||pg_size_pretty(pg_total_relation_size(relid))
from pg_catalog.pg_statio_user_tables order by pg_total_relation_size(relid) desc limit 8"
