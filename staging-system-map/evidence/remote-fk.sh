DB=$(docker ps --filter name=db- --format '{{.Names}}' | head -1)
docker exec -i "$DB" psql -U phantix -d phantix -tA <<'SQL'
SELECT t.tbl || '  →  ' || string_agg(c.column_name, ', ' ORDER BY c.column_name)
FROM unnest(ARRAY['agi_engagements','agi_sessions','agi_transcripts','agi_actions','agi_decisions',
                  'agi_engine_invocations','agi_capability_confirmations','agi_engine_capabilities',
                  'agi_knowledge_docs','agi_knowledge_summaries','agi_opencode_jobs','agi_skill_outcomes',
                  'agi_skills','agi_tool_install_requests','agi_usage_policies','agi_org_context_packs',
                  'ai_agent_runs','ai_agent_repo_jobs','ai_agent_skills','ai_agent_approvals',
                  'vapt_campaigns','vapt_campaign_steps','vapt_approval_requests','vapt_schedules',
                  'reports','scan_jobs','findings','risks','assets','soc_cases']) AS t(tbl)
JOIN information_schema.columns c ON c.table_schema='public' AND c.table_name=t.tbl
WHERE c.column_name IN ('organization_id','engagement_id','session_id','campaign_id','job_id','run_id','report_id','asset_id','scan_job_id')
GROUP BY t.tbl ORDER BY t.tbl;
SQL
echo
echo "=== row counts for the engagement-keyed AGI tables ==="
docker exec -i "$DB" psql -U phantix -d phantix -tA <<'SQL'
SELECT 'agi_engagements='||count(*) FROM agi_engagements WHERE organization_id=4;
SELECT 'agi_sessions='||count(*) FROM agi_sessions s JOIN agi_engagements e ON e.id=s.engagement_id WHERE e.organization_id=4;
SELECT 'agi_transcripts='||count(*) FROM agi_transcripts t JOIN agi_sessions s ON s.id=t.session_id JOIN agi_engagements e ON e.id=s.engagement_id WHERE e.organization_id=4;
SELECT 'agi_actions='||count(*) FROM agi_actions a JOIN agi_sessions s ON s.id=a.session_id JOIN agi_engagements e ON e.id=s.engagement_id WHERE e.organization_id=4;
SQL
