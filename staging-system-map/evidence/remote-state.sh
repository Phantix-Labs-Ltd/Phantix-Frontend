set -u
API=$(docker ps --filter name=api- --format '{{.Names}}' | head -1)
DB=$(docker ps --filter name=db- --format '{{.Names}}' | head -1)
echo "captured_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "runner_health=$(curl -s -m 8 http://127.0.0.1:8095/health)"
echo "sandboxes=$(docker ps -a --filter name=phantix-agi- --format '{{.Names}}|{{.Status}}' | tr '\n' ' ')"
echo "celery_active=$(docker exec "$API" celery -A app.workers.celery_app.celery inspect active -t 15 2>/dev/null | grep -c 'empty')"
echo "celery_ping=$(docker exec "$API" celery -A app.workers.celery_app.celery inspect ping -t 15 2>/dev/null | grep -c OK)"
echo "agi_sessions=$(docker exec "$DB" psql -U phantix -d phantix -tAc "select id || ':' || status from agi_sessions where organization_id=4 order by id desc limit 5" 2>/dev/null | tr '\n' ' ')"
echo "agi_transcripts_134=$(docker exec "$DB" psql -U phantix -d phantix -tAc "select count(1) from agi_transcripts where session_id=134" 2>/dev/null)"
echo "ai_audit=$(docker exec "$DB" psql -U phantix -d phantix -tAc "select agent || '/' || model || '/' || status from ai_audit_logs order by id desc limit 6" 2>/dev/null | tr '\n' ' ')"
echo "ai_agent_runs=$(docker exec "$DB" psql -U phantix -d phantix -tAc "select id || ':' || status from ai_agent_runs order by created_at desc limit 4" 2>/dev/null | tr '\n' ' ')"
echo "load=$(cat /proc/loadavg)"
