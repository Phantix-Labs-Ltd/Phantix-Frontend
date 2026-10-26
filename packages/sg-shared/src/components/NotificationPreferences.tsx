import React, { useMemo, useState } from "react";
import { Bell, BellOff, BellRing, ExternalLink, Mail, MessageCircle, MonitorSmartphone, Save } from "lucide-react";
import { ErrorState, PageHeader, PageSkeleton } from "../ui";
import { useResource } from "../useResource";
import { useStore } from "../store";
import { cx } from "../utils";
import { PLATFORM_URL } from "../config";
import { useNotifications } from "./AlertNotifications";
import {
  loadNotificationPreferences, saveNotificationPreferences,
  type NotificationChannel, type NotificationPreferences as Prefs, type PreferenceChanges,
} from "../preferences";

const CHANNEL_ICON: Record<NotificationChannel, React.ReactNode> = {
  in_app: <Bell size={14} />,
  push: <MonitorSmartphone size={14} />,
  email: <Mail size={14} />,
  whatsapp: <MessageCircle size={14} />,
};

/** An on/off switch; `aria-checked` carries the state for screen readers. */
export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400/60 disabled:cursor-not-allowed disabled:opacity-40",
        checked ? "border-gold-400 bg-gold-400" : "border-phantix-600 bg-phantix-800",
      )}
    >
      <span
        className={cx(
          "inline-block h-[18px] w-[18px] rounded-full shadow transition-transform",
          checked ? "translate-x-[22px] bg-phantix-950" : "translate-x-[3px] bg-slate-400",
        )}
      />
    </button>
  );
}

const empty: Prefs = { channels: [], categories: [], contact: { email: null, phone: null } };

/**
 * Settings → Notifications: for each notification type, which channels reach
 * this person. Only channels the organization has set up are columns; the rest
 * are listed underneath with who can turn them on.
 */
export default function NotificationPreferences() {
  const { data, loading, error, reload, setData } = useResource(loadNotificationPreferences, empty, "notification-preferences");
  const { toast } = useStore();
  const { push_, enablePush, desktop } = useNotifications();
  const [tab, setTab] = useState<string | null>(null);
  const [draft, setDraft] = useState<PreferenceChanges>({});
  const [saving, setSaving] = useState(false);

  const columns = useMemo(() => data.channels.filter((c) => c.available), [data.channels]);
  const missing = useMemo(() => data.channels.filter((c) => !c.available && c.reason), [data.channels]);
  const activeTab = tab ?? data.categories[0]?.key ?? null;
  const category = data.categories.find((c) => c.key === activeTab) ?? data.categories[0];

  const value = (type: string, ch: NotificationChannel, saved: boolean) => draft[type]?.[ch] ?? saved;
  const changed = Object.entries(draft).reduce((n, [type, cells]) => {
    const t = data.categories.flatMap((c) => c.types).find((x) => x.key === type);
    return n + Object.entries(cells).filter(([ch, v]) => t && t.channels[ch as NotificationChannel]?.enabled !== v).length;
  }, 0);

  const set = (type: string, ch: NotificationChannel, v: boolean) =>
    setDraft((cur) => ({ ...cur, [type]: { ...cur[type], [ch]: v } }));

  const save = async () => {
    setSaving(true);
    try {
      setData(await saveNotificationPreferences(draft));
      setDraft({});
      toast("success", "Preferences saved", "New notifications follow your choices.");
    } catch (err) {
      toast("error", "Couldn't save your preferences", err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  if (loading && !data.categories.length) return <PageSkeleton variant="detail" />;
  if (error && !data.categories.length) return <ErrorState onRetry={reload} body="We couldn't load your notification preferences. Try again." />;

  const pushColumn = columns.some((c) => c.key === "push");

  return (
    <div className="max-w-5xl">
      <PageHeader title="Notifications" description="Choose how you receive updates for each notification type." />

      {/* Category tabs: underline style, one per group of notification types. */}
      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-phantix-700/60" role="tablist" aria-label="Notification groups">
        {data.categories.map((c) => (
          <button
            key={c.key}
            type="button"
            role="tab"
            aria-selected={c.key === activeTab}
            onClick={() => setTab(c.key)}
            className={cx(
              "-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
              c.key === activeTab ? "border-gold-400 text-gold-300" : "border-transparent text-slate-400 hover:text-slate-200",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      {pushColumn && push_.available && !push_.subscribed && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-phantix-700 bg-phantix-900 px-4 py-3 text-sm">
          {desktop === "denied" ? <BellOff size={16} className="text-slate-500" /> : <BellRing size={16} className="text-gold-400" />}
          <p className="min-w-[14rem] flex-1 text-slate-300">
            {desktop === "denied"
              ? "Browser push is blocked for this site in your browser settings."
              : "Browser push is off in this browser. Turn it on to get these notifications even when SecureGraph is closed."}
          </p>
          {desktop !== "denied" && (
            <button type="button" className="btn-secondary !py-1.5 text-xs" disabled={push_.busy} onClick={() => void enablePush()}>
              {push_.busy ? "Turning on..." : "Turn on in this browser"}
            </button>
          )}
          {push_.error && <p className="w-full text-xs text-severity-critical">{push_.error}</p>}
        </div>
      )}

      {category && (
        <div className="overflow-hidden rounded-xl border border-phantix-700 bg-phantix-900">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-phantix-700/60 text-left text-[13px] text-slate-400">
                  <th className="px-5 py-3 font-medium">Notification</th>
                  {columns.map((c) => (
                    <th key={c.key} className="w-32 whitespace-nowrap px-3 py-3 text-center font-medium">
                      <span className="inline-flex items-center gap-1.5">{CHANNEL_ICON[c.key]} {c.label}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-phantix-700/40">
                {category.types.map((t) => (
                  <tr key={t.key}>
                    <td className="px-5 py-4">
                      <p className="font-medium text-white">{t.label}</p>
                      <p className="mt-0.5 text-[13px] text-slate-400">{t.description}</p>
                    </td>
                    {columns.map((c) => {
                      const cell = t.channels[c.key];
                      return (
                        <td key={c.key} className="px-3 py-4 text-center">
                          {cell?.applicable ? (
                            <span className="inline-flex justify-center">
                              <Toggle
                                checked={value(t.key, c.key, cell.enabled)}
                                onChange={(v) => set(t.key, c.key, v)}
                                label={`${t.label}: ${c.label}`}
                              />
                            </span>
                          ) : (
                            <span className="text-[13px] text-slate-500" title={c.key === "whatsapp" ? "WhatsApp carries critical alerts only." : undefined}>N/A</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-[16rem] flex-1 space-y-1.5 text-[13px] text-slate-500">
          {columns.some((c) => c.key === "email") && data.contact.email && (
            <p>Email goes to <span className="text-slate-300">{data.contact.email}</span>.</p>
          )}
          {columns.some((c) => c.key === "whatsapp") && <p>WhatsApp carries critical alerts only, to {data.contact.phone || "your number"}.</p>}
          {missing.map((c) => (
            <p key={c.key}>{CHANNEL_ICON[c.key]} <span className="text-slate-400">{c.label}:</span> {c.reason}</p>
          ))}
          <p>
            Team channels such as Slack, Teams and Telegram are set up for the whole organization in{" "}
            <a href={`${PLATFORM_URL}/alerts`} className="inline-flex items-center gap-1 text-gold-400 hover:text-gold-300">
              Platform alerts <ExternalLink size={11} />
            </a>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {changed > 0 && (
            <button type="button" className="btn-ghost" onClick={() => setDraft({})} disabled={saving}>Discard</button>
          )}
          <button type="button" className="btn-primary" disabled={changed === 0 || saving} onClick={() => void save()}>
            <Save size={15} /> {saving ? "Saving..." : "Save preferences"}
          </button>
        </div>
      </div>
    </div>
  );
}
