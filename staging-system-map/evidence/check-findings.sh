SEC=$(docker ps --filter name=bench-security-db --format '{{.Names}}' | head -1)
DB=$(docker ps --filter name=db- --format '{{.Names}}' | head -1)
echo "── security schema: findings-bearing tables ──"
docker exec -i "$SEC" psql -U phantix -d phantix_security -tA <<'SQL'
SELECT format('SELECT %L||'' = ''||count(*) FROM phantix.%I;', tablename, tablename)
FROM pg_tables WHERE schemaname='phantix'
  AND tablename IN ('findings','scan_results','scan_jobs','scan_work_items','risks','report_finding_tracker',
                    'assessment_findings','soc_detections','vapt_correlated_findings','code_review_findings',
                    'remediation_tasks','asset_history','assets','application_logs','server_logs')
ORDER BY tablename;
\gexec
SQL
echo "── platform: vapt + tracker ──"
docker exec -i "$DB" psql -U phantix -d phantix -tA <<'SQL'
SELECT format('SELECT %L||'' = ''||count(*) FROM public.%I WHERE organization_id = 4;', tablename, tablename)
FROM pg_tables WHERE schemaname='public'
  AND tablename IN ('vapt_campaigns','vapt_campaign_steps','vapt_correlated_findings','report_finding_tracker',
                    'report_tracker_history','assessments','assessment_findings','risks','reports','ai_analyses',
                    'ai_audit_logs','platform_events','alert_events','notifications')
ORDER BY tablename;
\gexec
SQL
