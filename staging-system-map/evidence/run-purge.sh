#!/usr/bin/env bash
set -u
MODE="${1:-plan}"
case "$MODE" in
  plan)  APPLY=false ;;
  apply) APPLY=true  ;;
  *) echo "usage: run-purge.sh plan|apply"; exit 2 ;;
esac
DB=$(docker ps --filter name=db- --format '{{.Names}}' | head -1)
SEC=$(docker ps --filter name=bench-security-db --format '{{.Names}}' | head -1)
REDIS=$(docker ps --filter name=redis- --format '{{.Names}}' | head -1)
echo "mode=$MODE  db=$DB  sec=$SEC"
echo "──────── platform ────────"
sed "s/__APPLY__/$APPLY/g" /root/purge-platform.sql \
  | docker exec -i "$DB" psql -U phantix -d phantix -v apply="$APPLY"
echo "──────── security ────────"
sed "s/__APPLY__/$APPLY/g" /root/purge-security.sql \
  | docker exec -i "$SEC" psql -U phantix -d phantix_security -v apply="$APPLY"
if [ "$APPLY" = true ]; then
  echo "──────── redis ────────"
  for pat in "scan_spool:*" "tool_lock:org:4*" "tool_lock:global_scan_slots" "secdb:creds:4*"; do
    n=$(docker exec "$REDIS" redis-cli --scan --pattern "$pat" 2>/dev/null | wc -l)
    if [ "$n" -gt 0 ]; then
      docker exec "$REDIS" redis-cli --scan --pattern "$pat" 2>/dev/null | xargs -r docker exec -i "$REDIS" redis-cli DEL >/dev/null
    fi
    echo "  $pat → $n key(s)"
  done
fi
