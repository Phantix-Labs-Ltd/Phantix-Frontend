import React, { useMemo } from "react";
import { useResource } from "../useResource";
import { loadApplications, type ApplicationsSnapshot } from "../applications";
import type { ApplicationKey, NavLeaf, NavSection } from "./types";

// ── Backend-driven navigation ────────────────────────────────────────────────
// The launcher snapshot already carries each application's pages: `group` is
// the section heading, `path` the SPA route, `label` the item, and `locked`
// whether the current plan has unlocked it. Building the sidebar from that is
// what stops the four `nav.tsx` files drifting from the backend.
//
// The static per-app `nav.tsx` is kept only as (a) the offline/demo fallback and
// (b) the icon registry, matched by path. If the snapshot has no surfaces we
// return the fallback unchanged.

// Routes the frontend has retired, mapped to the page that replaced them. The
// backend catalog can lag behind a rename; without this the sidebar shows the
// old label, links to a redirect, and loses its icon (icons match by path).
const RETIRED_PATHS: Record<string, string> = {
  "/remediation": "/tracker",
};
export function useApplicationNav(
  application: ApplicationKey,
  fallback: NavSection[],
): NavSection[] {
  const { data } = useResource<ApplicationsSnapshot | null>(
    loadApplications,
    null,
    "applications",
  );

  return useMemo(() => {
    const card = (data?.applications ?? []).find((a) => a.key === application);
    const surfaces = card?.surfaces ?? [];
    if (surfaces.length === 0) return fallback;

    const iconByPath = new Map<string, React.ReactNode>();
    const labelByPath = new Map<string, string>();
    for (const section of fallback) {
      for (const item of section.items) {
        iconByPath.set(item.to, item.icon);
        labelByPath.set(item.to, item.label);
      }
    }
    const seen = new Set<string>();

    const groups: NavSection[] = [];
    const groupIndex = new Map<string, number>();
    for (const surface of surfaces) {
      const replacement = RETIRED_PATHS[surface.path];
      const path = replacement ?? surface.path;
      // A retired path and its replacement can both be listed: keep one.
      if (seen.has(path)) continue;
      seen.add(path);
      const group = surface.group || "More";
      let idx = groupIndex.get(group);
      if (idx === undefined) {
        idx = groups.length;
        groupIndex.set(group, idx);
        groups.push({ label: group, items: [] });
      }
      const leaf: NavLeaf = {
        to: path,
        label: (replacement && labelByPath.get(path)) || surface.label,
        icon: iconByPath.get(path),
        locked: Boolean(surface.locked),
        lockReason: surface.lock_reason ?? null,
      };
      groups[idx].items.push(leaf);
    }
    return groups;
  }, [data, application, fallback]);
}

export default useApplicationNav;
