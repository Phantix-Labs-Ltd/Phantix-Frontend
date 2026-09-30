#!/usr/bin/env bash
# Streams the AGI runner's own telemetry as JSON lines, one per interval.
#   sampler-runner.sh <iterations> <interval_seconds>
N="${1:-200}"; IV="${2:-8}"
TOK=$(docker inspect phantix-agi-runner --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n 's/^PHANTIX_AGI_SERVICE_TOKEN=//p')
for i in $(seq 1 "$N"); do
  ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  health=$(curl -s -m 5 http://127.0.0.1:8095/health)
  pool=$(curl -s -m 5 -H "Authorization: Bearer $TOK" http://127.0.0.1:8095/v1/sandbox/pool)
  mon=$(curl -s -m 5 -H "Authorization: Bearer $TOK" http://127.0.0.1:8095/v1/tools/monitor)
  containers=$(docker ps --filter name=phantix-agi- --format '{{.Names}}' | tr '\n' ' ')
  stats=$(docker stats --no-stream --format '{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}' $(docker ps --filter name=phantix-agi- --format '{{.Names}}') 2>/dev/null | tr '\n' ';')
  [ -z "$health" ] && health='null'
  [ -z "$pool" ] && pool='null'
  [ -z "$mon" ] && mon='null'
  printf '{"ts":"%s","health":%s,"pool":%s,"monitor":%s,"containers":"%s","stats":"%s"}\n' \
    "$ts" "$health" "$pool" "$mon" "$containers" "$stats"
  sleep "$IV"
done
