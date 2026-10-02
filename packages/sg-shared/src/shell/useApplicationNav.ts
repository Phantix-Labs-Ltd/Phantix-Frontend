import { useMemo } from "react";
import { useResource } from "../useResource";
import { loadApplications, type ApplicationsSnapshot } from "../applications";
import type { ApplicationKey, NavLeaf, NavSection } from "./types";

// ── Backend-driven navigation ────────────────────────────────────────────────
// The launcher snapshot already carries each application's pages: `group` is
// the section heading, `path` the SPA route, `label` the item, and `locked`
// whether the current plan has unlocked it. Building the sidebar from that is
// what stops the four `nav.tsx` files drifting from the backend.
//
// The backend decides which pages exist, their labels and lock state. The
// static per-app `nav.tsx` decides the grouping: a page it knows sits in its
// group (with that group's icon, in that order), so the sidebar's dropdowns
// stay curated. A page it does not know falls back to the backend's `group`.
// It is also the offline/demo fallback and the icon registry, matched by path.
// If the snapshot has no surfaces we return the fallback unchanged.

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

    const leafByPath = new Map<string, NavLeaf>();
    const backendGroup = new Map<string, string>();
    for (const surface of surfaces) {
      const replacement = RETIRED_PATHS[surface.path];
      const path = replacement ?? surface.path;
      // A retired path and its replacement can both be listed: keep one.
      if (leafByPath.has(path)) continue;
      leafByPath.set(path, {
        to: path,
        label: surface.label,
        locked: Boolean(surface.locked),
        lockReason: surface.lock_reason ?? null,
      });
      backendGroup.set(path, surface.group || "More");
    }

    const groups: NavSection[] = [];
    const placed = new Set<string>();
    for (const section of fallback) {
      const items: NavLeaf[] = [];
      for (const item of section.items) {
        const leaf = leafByPath.get(item.to);
        if (!leaf || placed.has(item.to)) continue;
        placed.add(item.to);
        // A renamed route keeps the frontend's label; the backend's is stale.
        const renamed = Object.values(RETIRED_PATHS).includes(item.to);
        items.push({ ...leaf, label: renamed ? item.label : leaf.label, icon: item.icon });
      }
      if (items.length) groups.push({ label: section.label, icon: section.icon, items });
    }

    // Pages the frontend has not grouped yet: keep the backend's heading.
    for (const [path, leaf] of leafByPath) {
      if (placed.has(path)) continue;
      const label = backendGroup.get(path) ?? "More";
      let group = groups.find((g) => g.label === label);
      if (!group) {
        group = { label, items: [] };
        groups.push(group);
      }
      group.items.push(leaf);
    }
    return groups;
  }, [data, application, fallback]);
}

export default useApplicationNav;
