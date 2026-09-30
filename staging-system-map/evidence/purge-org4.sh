#!/usr/bin/env bash
# Org-4 clean slate.  Usage:
#   bash purge-org4.sh plan     # print every count, change nothing
#   bash purge-org4.sh apply    # delete, one transaction per database
#   bash purge-org4.sh verify   # show what is left for org 4
set -u
MODE="${1:-plan}"
DB=$(docker ps --filter name=db- --format '{{.Names}}' | head -1)
SEC=$(docker ps --filter name=bench-security-db --format '{{.Names}}' | head -1)
REDIS=$(docker ps --filter name=redis- --format '{{.Names}}' | head -1)

# Platform tables carrying Org-4 tenant data. Everything not listed is kept:
# organisations, users, devices, roles, dual-control roles, api keys,
# customer_db_connections (needed to reach the security DB), subscriptions,
# payments, AI credits/usage/settings, tool entitlements, compliance KB,
# alert settings/targets, vapt procedures, SOC builtin rules, staff, legal.
PLATFORM_TABLES="
assets asset_tags asset_tag_assignments asset_history asset_relationships asset_candidates discovery_jobs
scans scan_jobs scan_work_items scan_results
findings report_finding_tracker report_tracker_history assessment_findings assessments
code_review_findings vapt_correlated_findings verification_evidence remediation_tasks compliance_evidence
reports
risks risk_treatments risk_history risk_assessments
vapt_campaigns vapt_campaign_steps vapt_approval_requests vapt_mining_patterns vapt_schedules vapt_org_settings
agi_engagements agi_decisions agi_engine_invocations agi_capability_confirmations agi_engine_capabilities
agi_knowledge_docs agi_knowledge_summaries agi_opencode_jobs agi_skill_outcomes agi_skills
agi_tool_install_requests agi_org_agreement_acceptances agi_org_settings agi_org_context_packs
agi_org_test_accounts agi_usage_policies
ai_agent_runs ai_agent_repo_jobs ai_agent_skills ai_agent_approvals
soc_detections soc_cases soc_case_notes
alert_events alert_deliveries
notifications org_application_logs application_logs platform_events audit_events
audit_pending_actions ai_audit_logs server_logs
product_projects product_components product_flows product_documents product_confirmations
product_clarifications threat_clarifications
target_intel_snapshots deployed_agents
integration_installations integration_oauth_states organization_integrations
github_installations github_repositories github_repository_review_settings
scm_credential_targets branch_review_usage_events
compliance_assessments compliance_questionnaire_answers compliance_answerer_sessions
external_pentest_scopes data_subject_requests service_feedback
support_tickets support_ticket_messages funnel_requests access_coupon_redemptions
otp_challenges device_confirm_challenges organization_password_resets organization_user_login_links
app_sessions organization_user_sessions
launch_sandbox_members launch_sandbox_ratings launch_sandbox_update_receipts
cloud_connectors
"

DEL="${DELETE:-no}"
# children first: these hang off engagement_id / session_id, not organization_id
CHILD_SQL="
DO \$\$
DECLARE n bigint; total bigint := 0;
BEGIN
  EXECUTE 'SELECT count(*) FROM agi_transcripts t JOIN agi_sessions s ON s.id=t.session_id
           JOIN agi_engagements e ON e.id=s.engagement_id WHERE e.organization_id=4' INTO n;
  RAISE NOTICE '  [platform] agi_transcripts (via session)       %', n; total := total + n;
  $([ "$MODE" = "apply" ] && cat <<'X'
  IF n > 0 THEN
    DELETE FROM agi_transcripts WHERE session_id IN (
      SELECT s.id FROM agi_sessions s JOIN agi_engagements e ON e.id = s.engagement_id
      WHERE e.organization_id = 4);
  END IF;
X
)
  EXECUTE 'SELECT count(*) FROM agi_actions a JOIN agi_sessions s ON s.id=a.session_id
           JOIN agi_engagements e ON e.id=s.engagement_id WHERE e.organization_id=4' INTO n;
  RAISE NOTICE '  [platform] agi_actions (via session)           %', n; total := total + n;
  $([ "$MODE" = "apply" ] && cat <<'X'
  IF n > 0 THEN
    DELETE FROM agi_actions WHERE session_id IN (
      SELECT s.id FROM agi_sessions s JOIN agi_engagements e ON e.id = s.engagement_id
      WHERE e.organization_id = 4);
  END IF;
X
)
  EXECUTE 'SELECT count(*) FROM agi_sessions s JOIN agi_engagements e ON e.id=s.engagement_id
           WHERE e.organization_id=4' INTO n;
  RAISE NOTICE '  [platform] agi_sessions (via engagement)       %', n; total := total + n;
  $([ "$MODE" = "apply" ] && cat <<'X'
  IF n > 0 THEN
    DELETE FROM agi_sessions WHERE engagement_id IN (
      SELECT id FROM agi_engagements WHERE organization_id = 4);
  END IF;
X
)
  RAISE NOTICE '  [platform] child tables subtotal               %', total;
END \$\$;
"

GENERIC_SQL="
DO \$\$
DECLARE t text; n bigint; total bigint := 0; tbls text[] := string_to_array('$PLATFORM_TABLES', ' ');
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    CONTINUE WHEN t = '' OR t IN ('agi_transcripts','agi_actions','agi_sessions');
    IF to_regclass('public.'||quote_ident(t)) IS NULL THEN CONTINUE; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name=t AND column_name='organization_id') THEN
      RAISE NOTICE '  [platform] % (no organization_id — skipped)', rpad(t,38); CONTINUE;
    END IF;
    EXECUTE format('SELECT count(*) FROM public.%I WHERE organization_id = 4', t) INTO n;
    total := total + n;
    IF n > 0 THEN
      RAISE NOTICE '  [platform] % %', rpad(t,38), n;
      $([ "$MODE" = "apply" ] && echo "EXECUTE format('DELETE FROM public.%I WHERE organization_id = 4', t);")
    END IF;
  END LOOP;
  RAISE NOTICE '  [platform] other tables subtotal               %', total;
END \$\$;
"

if [ "$MODE" != "verify" ]; then
  echo "════════ PLATFORM db (org 4) — mode=$MODE ════════"
  docker exec -i "$DB" psql -U phantix -d phantix -q -v ON_ERROR_STOP=1 <<SQL
BEGIN;
$CHILD_SQL
$GENERIC_SQL
$([ "$MODE" = "apply" ] && echo "COMMIT;" || echo "ROLLBACK;")
SQL

  echo
  echo "════════ SECURITY db (schema phantix, org 4) — mode=$MODE ════════"
  docker exec -i "$SEC" psql -U phantix -d phantix_security -q -v ON_ERROR_STOP=1 <<SQL
BEGIN;
DO \$\$
DECLARE t text; n bigint; total bigint := 0; tbls text;
BEGIN
  SELECT string_agg(quote_ident(tablename), ', ') INTO tbls FROM pg_tables
   WHERE schemaname='phantix' AND tablename NOT IN ('schema_migrations','soc_detection_rules');
  IF tbls IS NULL THEN RAISE NOTICE '  [security] schema is empty'; RETURN; END IF;
  FOR t IN SELECT tablename FROM pg_tables
            WHERE schemaname='phantix' AND tablename NOT IN ('schema_migrations','soc_detection_rules') LOOP
    EXECUTE format('SELECT count(*) FROM phantix.%I', t) INTO n;
    total := total + n;
    IF n > 0 THEN RAISE NOTICE '  [security] % %', rpad(t,38), n; END IF;
  END LOOP;
  RAISE NOTICE '  [security] TOTAL % rows in % tables', total,
    (SELECT count(*) FROM pg_tables WHERE schemaname='phantix'
      AND tablename NOT IN ('schema_migrations','soc_detection_rules'));
  $([ "$MODE" = "apply" ] && echo "EXECUTE 'TRUNCATE ' || tbls || ' RESTART IDENTITY CASCADE';")
END \$\$;
$([ "$MODE" = "apply" ] && echo "COMMIT;" || echo "ROLLBACK;")
SQL

  echo
  echo "════════ REDIS (org-4 transient keys only) ════════"
  if [ "$MODE" = "apply" ]; then
    for pat in "scan_spool:*" "tool_lock:org:4*" "tool_lock:global_scan_slots" "secdb:creds:4*"; do
      n=$(docker exec "$REDIS" redis-cli --scan --pattern "$pat" 2>/dev/null | wc -l)
      if [ "$n" -gt 0 ]; then
        docker exec "$REDIS" redis-cli --scan --pattern "$pat" 2>/dev/null | xargs -r docker exec -i "$REDIS" redis-cli DEL >/dev/null
      fi
      echo "  $pat → $n key(s) removed"
    done
  else
    for pat in "scan_spool:*" "tool_lock:org:4*" "tool_lock:global_scan_slots" "secdb:creds:4*"; do
      echo "  $pat → $(docker exec "$REDIS" redis-cli --scan --pattern "$pat" 2>/dev/null | wc -l) key(s)"
    done
  fi
fi

echo
echo "════════ REMAINING org-4 rows ════════"
docker exec -i "$DB" psql -U phantix -d phantix -tA <<'SQL'
SELECT format('SELECT %L AS tbl, count(*) AS n FROM public.%I WHERE organization_id = 4;', c.relname, c.relname)
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r'
  AND EXISTS (SELECT 1 FROM information_schema.columns col
              WHERE col.table_schema='public' AND col.table_name=c.relname AND col.column_name='organization_id')
ORDER BY 1;
\gexec
SQL
echo "--- security schema ---"
docker exec -i "$SEC" psql -U phantix -d phantix_security -tA <<'SQL'
SELECT format('SELECT %L AS tbl, count(*) AS n FROM phantix.%I;', tablename, tablename)
FROM pg_tables WHERE schemaname='phantix' ORDER BY tablename;
\gexec
SQL
