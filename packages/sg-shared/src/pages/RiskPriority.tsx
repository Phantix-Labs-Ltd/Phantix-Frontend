import React, { useEffect, useState } from "react";
import { PageHeader, Card, EmptyState, SkeletonCard } from "../ui";
import { loadRiskPriority } from "../data";
import { AssetPriorityList, FindingAxesRow, KriPanel } from "../components/RiskPriority";

/**
 * Risk prioritisation — the page that answers "what do we work on first, and why".
 *
 * Three panels, deliberately not merged: the KRI (exposure in one number, with what it
 * excludes), assets ranked by attention, and findings with **severity and
 * exploitability shown separately** plus the handoffs the work passed through.
 */
export default function RiskPriorityPage() {
  const [data, setData] = useState<{
    kri: any;
    assets: any[];
    findings: any[];
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadRiskPriority({ limit: 2000, assets: 10 }).then((out) => {
      setData(out);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div>
        <PageHeader title="Risk prioritisation" description="What to fix first, and why." />
        <SkeletonCard />
        <SkeletonCard className="mt-3" />
      </div>
    );
  }

  if (!data) {
    return (
      <div>
        <PageHeader title="Risk prioritisation" description="What to fix first, and why." />
        <EmptyState
          icon={<span className="text-lg">◎</span>}
          title="No prioritisation data yet"
          body="Run an assessment. Prioritisation uses verified findings and the asset context around them."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Risk prioritisation"
        description="Severity is the consequence; exploitability is how reachable it is. They are judged separately, and combined only in the priority."
      />
      <div className="grid gap-3 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <KriPanel kri={data.kri} />
        <AssetPriorityList assets={data.assets} />
      </div>

      <h2 className="mb-2 mt-6 font-display text-sm font-semibold text-slate-200">
        Findings — two axes, one explained priority
      </h2>
      {data.findings.length === 0 ? (
        <Card><p className="text-sm text-slate-400">No findings recorded yet.</p></Card>
      ) : (
        <div className="space-y-2">
          {data.findings.slice(0, 25).map((f: any) => (
            <FindingAxesRow key={f.id} finding={f} />
          ))}
        </div>
      )}
    </div>
  );
}
