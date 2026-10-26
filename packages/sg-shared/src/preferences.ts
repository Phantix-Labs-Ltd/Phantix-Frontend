/**
 * Per-person preferences: which notifications reach you on which channel, and
 * how your overview is laid out. Both live on the server
 * (`/org-users/preferences/*`) so they follow the person across the four
 * applications and devices. The overview layout is also kept in localStorage so
 * the dashboard paints in the right order before the request returns.
 */

import { api, ApiError, delay, isDemoMode } from "./api";

export type NotificationChannel = "in_app" | "push" | "email" | "whatsapp";

export interface ChannelInfo {
  key: NotificationChannel;
  label: string;
  available: boolean;
  /** Why the channel can't be used yet, and who can change that. */
  reason: string | null;
}

export interface NotificationCell { applicable: boolean; enabled: boolean }

export interface NotificationTypePref {
  key: string;
  label: string;
  description: string;
  critical_only_whatsapp: boolean;
  channels: Record<NotificationChannel, NotificationCell>;
}

export interface NotificationPreferences {
  channels: ChannelInfo[];
  categories: { key: string; label: string; types: NotificationTypePref[] }[];
  contact: { email: string | null; phone: string | null };
}

export type PreferenceChanges = Record<string, Partial<Record<NotificationChannel, boolean>>>;

const P = "/org-users/preferences";

export async function loadNotificationPreferences(): Promise<NotificationPreferences> {
  if (isDemoMode()) { await delay(250); return demoPrefs(); }
  return api.get<NotificationPreferences>(`${P}/notifications`);
}

export async function saveNotificationPreferences(changes: PreferenceChanges): Promise<NotificationPreferences> {
  if (isDemoMode()) {
    await delay(350);
    for (const [type, cells] of Object.entries(changes)) {
      for (const cat of demoState.categories) for (const t of cat.types) {
        if (t.key !== type) continue;
        for (const [ch, v] of Object.entries(cells)) if (t.channels[ch as NotificationChannel]?.applicable) t.channels[ch as NotificationChannel].enabled = !!v;
      }
    }
    return demoPrefs();
  }
  return api.put<NotificationPreferences>(`${P}/notifications`, { preferences: changes });
}

// ── Overview layout ──────────────────────────────────────────────────────────

export type RangePreset = "today" | "7d" | "30d" | "3m" | "6m" | "1y" | "custom";
export interface DateRangeValue { preset: RangePreset; start?: string; end?: string }
export interface DashboardLayout { cards?: string[]; range?: DateRangeValue }

const layoutKey = (app: string) => `phantix_overview_${app}`;

/** What this browser last saw, for a first paint in the right order. */
export function cachedDashboardLayout(app: string): DashboardLayout {
  try {
    const raw = JSON.parse(localStorage.getItem(layoutKey(app)) || "null");
    return raw && typeof raw === "object" ? (raw as DashboardLayout) : {};
  } catch {
    return {};
  }
}

function cacheLayout(app: string, layout: DashboardLayout) {
  try { localStorage.setItem(layoutKey(app), JSON.stringify(layout)); } catch { /* private mode */ }
}

/** The saved layout; the server copy wins over the browser cache when present. */
export async function loadDashboardLayout(app: string): Promise<DashboardLayout> {
  const cached = cachedDashboardLayout(app);
  if (isDemoMode()) return cached;
  try {
    const server = await api.get<DashboardLayout>(`${P}/dashboard`);
    const merged = { ...cached, ...(server ?? {}) };
    cacheLayout(app, merged);
    return merged;
  } catch (err) {
    // An older backend without the route keeps the browser copy.
    if (err instanceof ApiError && err.status === 404) return cached;
    return cached;
  }
}

export async function saveDashboardLayout(app: string, patch: DashboardLayout): Promise<DashboardLayout> {
  const next = { ...cachedDashboardLayout(app), ...patch };
  cacheLayout(app, next);
  if (isDemoMode()) return next;
  try {
    return { ...next, ...(await api.put<DashboardLayout>(`${P}/dashboard`, patch)) };
  } catch {
    return next; // kept in this browser; the next save retries the server
  }
}

// ── Demo tenant ──────────────────────────────────────────────────────────────

const cell = (enabled: boolean, applicable = true): NotificationCell => ({ applicable, enabled: applicable && enabled });
const row = (key: string, label: string, description: string, email: boolean, critical = false): NotificationTypePref => ({
  key, label, description, critical_only_whatsapp: critical,
  channels: { in_app: cell(true), push: cell(true), email: cell(email), whatsapp: cell(critical, critical) },
});

const demoState: NotificationPreferences = {
  contact: { email: "demo@acme.ng", phone: "+234 801 000 0001" },
  channels: [
    { key: "in_app", label: "In-app", available: true, reason: null },
    { key: "push", label: "Browser push", available: true, reason: null },
    { key: "email", label: "Email", available: true, reason: null },
    { key: "whatsapp", label: "WhatsApp", available: true, reason: null },
  ],
  categories: [
    { key: "testing", label: "Testing", types: [
      row("scan.completed", "Scan finished", "A scan finished and its findings are ready.", false),
      row("scan.failed", "Scan failed", "A scan stopped before it finished.", true),
      row("custom.vapt_campaign_completed", "VAPT campaign finished", "Every step of a VAPT campaign has run.", true),
      row("quick_scan", "Quick Scan results", "A Quick Scan finished or failed.", false),
    ] },
    { key: "risk", label: "Findings and risk", types: [
      row("risk.critical", "Critical risk found", "A finding was scored as a critical risk to the organization.", true, true),
      row("risk.created", "New risk", "A new risk was added to the risk register.", false),
      row("risk.treatment", "Risk treatment decisions", "A treatment plan was approved, rejected or completed.", true),
    ] },
    { key: "reports", label: "Reports and audits", types: [
      row("custom.report_generated", "Report ready", "A report you asked for is ready to view and download.", true),
      row("custom.report_archived", "Report archived", "A report was moved to the archive.", false),
      row("custom.audit_evidence_requested", "Audit evidence requested", "An audit asked for evidence on a control.", true),
      row("audit_outcome", "Audit completed or published", "An audit finished, or its report was published.", true),
    ] },
    { key: "monitoring", label: "Monitoring", types: [
      row("soc", "Security monitoring detections", "Your SOC raised a detection on your systems.", true, true),
      row("other", "Other updates", "Everything else SecureGraph tells your organization about.", false),
    ] },
  ],
};

const demoPrefs = (): NotificationPreferences => JSON.parse(JSON.stringify(demoState));
