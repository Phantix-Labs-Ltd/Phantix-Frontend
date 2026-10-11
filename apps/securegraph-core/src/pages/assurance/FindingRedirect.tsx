import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { ErrorState, PageSkeleton } from "@sg/ui";
import { getFinding } from "@sg/assurance";

/** `/assurance/findings/AUDIT-123` (from the findings tracker) → the finding inside its audit. */
export default function FindingRedirect() {
  const key = useParams().key ?? "";
  const findingId = Number(key.replace(/^AUDIT-/i, ""));
  const [target, setTarget] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!Number.isInteger(findingId) || findingId <= 0) { setFailed(true); return; }
    getFinding(findingId)
      .then((f) => setTarget(`/assurance/${f.engagement_id}?tab=findings&finding=${f.id}`))
      .catch(() => setFailed(true));
  }, [findingId]);

  if (failed) return <ErrorState title="Audit finding not found" body="It may have been removed, or it belongs to another organization." />;
  if (target) return <Navigate to={target} replace />;
  return <PageSkeleton />;
}
