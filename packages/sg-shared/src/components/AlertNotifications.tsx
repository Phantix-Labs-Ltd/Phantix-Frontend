import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle, ArrowUpRight, Bell, BellOff, BellRing, CheckCircle2, CloudOff, Info, Monitor, ShieldAlert, ShieldCheck,
  ShieldQuestion, WifiOff, X,
} from "lucide-react";
import { loadAlertsBundle } from "../data";
import { api, API_BASE, ApiError, isDemoMode } from "../api";
import { PLATFORM_URL } from "../config";
import { timeAgo, cx } from "../utils";
import { CrossAppLink } from "./CrossAppLink";
import type { ApplicationKey } from "../shell/types";
import type { AlertEvent } from "../types";

type Severity = "critical" | "high" | "medium" | "low" | "info";

/** Where a notification leads: a page in one of the apps, or the Platform. */
export type NoticeLink = { app: ApplicationKey; path: string } | { href: string };

export interface AlertNotice {
  id: number;
  severity: Severity;
  title: string;
  eventType: string;
  createdAt: string;
  body?: string;
  link?: NoticeLink;
  /** "alert": an org alert event whose read state lives on the server. */
  source?: "alert";
  /** Read state from the server feed (alert events only). */
  read?: boolean;
}

interface InboxNotice extends AlertNotice {
  read: boolean;
}

const SEV_META: Record<Severity, { label: string; chip: string; bar: string; icon: React.ReactNode }> = {
  critical: { label: "Critical", chip: "border-severity-critical/40 bg-severity-critical/15 text-red-200", bar: "bg-severity-critical", icon: <ShieldAlert size={14} /> },
  high: { label: "High", chip: "border-severity-high/40 bg-severity-high/15 text-amber-200", bar: "bg-severity-high", icon: <ShieldCheck size={14} /> },
  medium: { label: "Medium", chip: "border-severity-medium/40 bg-severity-medium/15 text-amber-300", bar: "bg-severity-medium", icon: <AlertTriangle size={14} /> },
  low: { label: "Low", chip: "border-severity-low/40 bg-severity-low/15 text-slate-300", bar: "bg-severity-low", icon: <ShieldQuestion size={14} /> },
  info: { label: "Info", chip: "border-phantix-500/40 bg-phantix-500/15 text-slate-300", bar: "bg-phantix-500", icon: <Info size={14} /> },
};

const TOAST_MS = 6000;
const POLL_MS = 30_000;

// ── What each event is called and where it leads ─────────────────────────────

type Payload = Record<string, unknown>;
const num = (v: unknown) => (typeof v === "number" || (typeof v === "string" && v !== "") ? Number(v) : NaN);

const EVENT_META: Record<string, { label: string; link?: (p: Payload) => NoticeLink }> = {
  "scan.completed": { label: "Scan finished", link: () => ({ app: "attack", path: "/scans" }) },
  "scan.failed": { label: "Scan failed", link: () => ({ app: "attack", path: "/scans" }) },
  "risk.created": { label: "New risk", link: () => ({ app: "core", path: "/tracker" }) },
  "risk.critical": { label: "Critical risk found", link: () => ({ app: "core", path: "/tracker" }) },
  "custom.vapt_campaign_completed": { label: "VAPT campaign finished", link: () => ({ app: "attack", path: "/vapt" }) },
  "custom.report_generated": { label: "Report ready", link: () => ({ app: "core", path: "/reports" }) },
  "custom.report_archived": { label: "Report archived", link: () => ({ app: "core", path: "/reports" }) },
  "custom.quick_scan_completed": { label: "Quick Scan finished", link: () => ({ href: `${PLATFORM_URL}/get-started` }) },
  "custom.quick_scan_failed": { label: "Quick Scan failed", link: () => ({ href: `${PLATFORM_URL}/get-started` }) },
  "custom.audit_engagement_completed": { label: "Audit completed", link: (p) => ({ app: "core", path: Number.isFinite(num(p.engagement_id)) ? `/assurance/${num(p.engagement_id)}` : "/assurance" }) },
  "custom.audit_report_published": { label: "Audit report published", link: (p) => ({ app: "core", path: Number.isFinite(num(p.engagement_id)) ? `/assurance/${num(p.engagement_id)}?tab=reports` : "/assurance/reports" }) },
  "custom.audit_evidence_requested": { label: "Evidence requested", link: (p) => ({ app: "core", path: Number.isFinite(num(p.engagement_id)) ? `/assurance/${num(p.engagement_id)}?tab=evidence` : "/assurance" }) },
  "system.connection": { label: "Connection" },
};

export function eventLabel(eventType: string): string {
  if (EVENT_META[eventType]) return EVENT_META[eventType].label;
  if (eventType.startsWith("soc.") || eventType.startsWith("custom.soc")) return "Security monitoring";
  return eventType.replace(/^custom\./, "").replace(/[._]/g, " ");
}

function linkFor(eventType: string, payload: Payload): NoticeLink | undefined {
  const meta = EVENT_META[eventType];
  if (meta?.link) return meta.link(payload);
  if (eventType.startsWith("soc.") || eventType.startsWith("custom.soc")) return { app: "defend", path: "/soc" };
  return undefined;
}

// ── Persisted notice state ────────────────────────────────────────────────────
// The backend keeps no per-user read/dismissed state for alert events, and
// every sign-in is a fresh page load, so it lives in localStorage (per origin,
// so each application remembers its own). Keys pair the event type with the id
// because alert events and agent notifications are separate tables.
const NOTICE_STATE_KEY = "phantix_notice_state";
const NOTICE_STATE_CAP = 500;

type NoticeBucket = "seen" | "read" | "dismissed";
let noticeState: Record<NoticeBucket, Set<string>> | null = null;

function noticeKey(n: { id: number; eventType: string }): string {
  return `${n.eventType}:${n.id}`;
}

function loadNoticeState(): Record<NoticeBucket, Set<string>> {
  if (noticeState) return noticeState;
  let raw: Partial<Record<NoticeBucket, string[]>> = {};
  try {
    raw = JSON.parse(localStorage.getItem(NOTICE_STATE_KEY) || "{}") ?? {};
  } catch {
    /* unreadable or blocked storage — start empty */
  }
  const set = (v: unknown) => new Set(Array.isArray(v) ? v.map(String) : []);
  noticeState = { seen: set(raw.seen), read: set(raw.read), dismissed: set(raw.dismissed) };
  return noticeState;
}

function hasNotice(bucket: NoticeBucket, key: string): boolean {
  return loadNoticeState()[bucket].has(key);
}

function rememberNotices(bucket: NoticeBucket, keys: string[]): void {
  const state = loadNoticeState();
  let changed = false;
  for (const k of keys) {
    if (state[bucket].has(k)) continue;
    state[bucket].add(k);
    changed = true;
  }
  if (!changed) return;
  const trim = (s: Set<string>) => Array.from(s).slice(-NOTICE_STATE_CAP);
  try {
    localStorage.setItem(
      NOTICE_STATE_KEY,
      JSON.stringify({ seen: trim(state.seen), read: trim(state.read), dismissed: trim(state.dismissed) }),
    );
  } catch {
    /* quota / private mode — the in-memory state still holds for this load */
  }
}

// ── Desktop notifications ────────────────────────────────────────────────────
// Shown by the browser while this tab is in the background (another tab or
// app in front). Opt-in from the bell; the same tag never shows twice.

type DesktopPermission = "unsupported" | "default" | "granted" | "denied";

function desktopPermission(): DesktopPermission {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission as DesktopPermission;
}

function desktopNotify(n: AlertNotice) {
  if (desktopPermission() !== "granted" || document.visibilityState === "visible") return;
  try {
    const note = new Notification(`${eventLabel(n.eventType)}: ${n.title}`, {
      body: n.body?.slice(0, 180) || undefined,
      tag: noticeKey(n),
      requireInteraction: n.severity === "critical",
    });
    note.onclick = () => { window.focus(); note.close(); };
  } catch {
    /* some browsers only allow notifications from a service worker */
  }
}

// ── Server feed (per-user read state) ────────────────────────────────────────
// GET /org-users/notifications returns the org's events with this person's
// read state, so the bell matches across apps and devices. A backend without
// it answers 404, and the bell falls back to the alert list + local state.

type FeedItem = {
  id: number;
  event_type: string;
  severity: string;
  title: string;
  body?: string;
  payload?: Record<string, unknown> | null;
  created_at: string;
  url?: string | null;
  read: boolean;
};

let serverFeed: boolean | null = null;

async function loadFeed(): Promise<AlertNotice[]> {
  if (!isDemoMode() && serverFeed !== false) {
    try {
      const res = await api.get<{ items?: FeedItem[] }>("/org-users/notifications?limit=50");
      serverFeed = true;
      return (res?.items ?? []).map((e) => ({
        ...toNotice({ ...e, status: "sent", channels: [] } as unknown as AlertEvent),
        read: e.read,
        link: linkFor(e.event_type, (e.payload ?? {}) as Payload) ?? (e.url ? { href: e.url } : undefined),
      }));
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 404)) throw err;
      serverFeed = false;
    }
  }
  const bundle = await loadAlertsBundle();
  return (bundle?.events ?? []).map(toNotice);
}

const postQuietly = (path: string, body: unknown) => { void api.post(path, body).catch(() => undefined); };

// ── Web Push ─────────────────────────────────────────────────────────────────

const PUSH_SW = "/sg-push-sw.js";

type PushState = { available: boolean; subscribed: boolean; busy: boolean; error: string | null };

function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function keyBytes(b64url: string): ArrayBuffer {
  const pad = "=".repeat((4 - (b64url.length % 4)) % 4);
  const raw = atob((b64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const buf = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return buf;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration(PUSH_SW);
  return reg ? reg.pushManager.getSubscription() : null;
}

// ── Context ──────────────────────────────────────────────────────────────────

type NotifyCtx = {
  inbox: InboxNotice[];
  unread: number;
  panelOpen: boolean;
  setPanelOpen: (v: boolean | ((p: boolean) => boolean)) => void;
  push: (n: AlertNotice) => void;
  markAllRead: () => void;
  dismissInbox: (notice: AlertNotice) => void;
  desktop: DesktopPermission;
  enableDesktop: () => Promise<void>;
  push_: PushState;
  enablePush: () => Promise<void>;
  disablePush: () => Promise<void>;
};

const Ctx = createContext<NotifyCtx | null>(null);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [inbox, setInbox] = useState<InboxNotice[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [desktop, setDesktop] = useState<DesktopPermission>(desktopPermission);

  const push = useCallback((n: AlertNotice) => {
    const key = noticeKey(n);
    // Cleared by the user in an earlier session: never comes back.
    if (hasNotice("dismissed", key)) return;
    setInbox((prev) =>
      prev.some((x) => noticeKey(x) === key)
        ? prev.map((x) => (noticeKey(x) === key && n.read && !x.read ? { ...x, read: true } : x))
        : [{ ...n, read: n.source === "alert" && serverFeed ? Boolean(n.read) : hasNotice("read", key) }, ...prev]
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, 80),
    );
  }, []);

  const markAllRead = useCallback(() => {
    setInbox((prev) => {
      rememberNotices("read", prev.map(noticeKey));
      const ids = prev.filter((x) => x.source === "alert" && !x.read).map((x) => x.id);
      if (serverFeed && ids.length) postQuietly("/org-users/notifications/read", { ids });
      return prev.map((x) => ({ ...x, read: true }));
    });
  }, []);

  const dismissInbox = useCallback((notice: AlertNotice) => {
    const key = noticeKey(notice);
    rememberNotices("dismissed", [key]);
    if (notice.source === "alert" && serverFeed) postQuietly(`/org-users/notifications/${notice.id}/dismiss`, {});
    setInbox((prev) => prev.filter((x) => noticeKey(x) !== key));
  }, []);

  const [push_, setPush] = useState<PushState>({ available: false, subscribed: false, busy: false, error: null });
  const pushKey = useRef<string | null>(null);

  // Is push set up on the server, and is this browser already subscribed?
  useEffect(() => {
    if (isDemoMode() || !pushSupported()) return;
    let alive = true;
    (async () => {
      try {
        const cfg = await api.get<{ enabled?: boolean; public_key?: string | null }>("/org-users/push/config");
        if (!alive || !cfg?.enabled || !cfg.public_key) return;
        pushKey.current = cfg.public_key;
        const sub = await currentSubscription();
        if (alive) setPush((p) => ({ ...p, available: true, subscribed: Boolean(sub) }));
      } catch { /* older backend: no push */ }
    })();
    return () => { alive = false; };
  }, []);

  const enablePush = useCallback(async () => {
    if (!pushKey.current) return;
    setPush((p) => ({ ...p, busy: true, error: null }));
    try {
      const permission = await Notification.requestPermission();
      setDesktop(permission as DesktopPermission);
      if (permission !== "granted") throw new Error("Notifications are blocked for this site in your browser settings.");
      const reg = await navigator.serviceWorker.register(PUSH_SW);
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription())
        ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(pushKey.current) }));
      const json = sub.toJSON() as { endpoint?: string; keys?: Record<string, string> };
      await api.post("/org-users/push/subscribe", { endpoint: json.endpoint, keys: json.keys, origin: window.location.origin });
      setPush((p) => ({ ...p, subscribed: true, busy: false }));
    } catch (err) {
      setPush((p) => ({ ...p, busy: false, error: err instanceof Error ? err.message : "Couldn't turn on push notifications" }));
    }
  }, []);

  const disablePush = useCallback(async () => {
    setPush((p) => ({ ...p, busy: true, error: null }));
    try {
      const sub = await currentSubscription();
      if (sub) {
        await api.post("/org-users/push/unsubscribe", { endpoint: sub.endpoint }).catch(() => undefined);
        await sub.unsubscribe();
      }
      setPush((p) => ({ ...p, subscribed: false, busy: false }));
    } catch (err) {
      setPush((p) => ({ ...p, busy: false, error: err instanceof Error ? err.message : "Couldn't turn off push notifications" }));
    }
  }, []);

  const enableDesktop = useCallback(async () => {
    if (desktopPermission() === "unsupported") return;
    try {
      setDesktop((await Notification.requestPermission()) as DesktopPermission);
    } catch {
      setDesktop(desktopPermission());
    }
  }, []);

  const unread = useMemo(() => inbox.filter((x) => !x.read).length, [inbox]);

  const value = useMemo(
    () => ({ inbox, unread, panelOpen, setPanelOpen, push, markAllRead, dismissInbox, desktop, enableDesktop, push_, enablePush, disablePush }),
    [inbox, unread, panelOpen, push, markAllRead, dismissInbox, desktop, enableDesktop, push_, enablePush, disablePush],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNotifications(): NotifyCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useNotifications requires NotificationProvider");
  return ctx;
}

/** Opens a notification's page: same app in place, another app or the Platform via its link. */
function NoticeLinkWrap({ link, onGo, className, children }: { link?: NoticeLink; onGo?: () => void; className?: string; children: React.ReactNode }) {
  if (!link) return <div className={className}>{children}</div>;
  if ("href" in link) {
    return <a href={link.href} target="_blank" rel="noopener noreferrer" className={className} onClick={onGo}>{children}</a>;
  }
  return (
    <span onClick={onGo} className="contents">
      <CrossAppLink app={link.app} to={link.path} className={className}>{children}</CrossAppLink>
    </span>
  );
}

// ── Bell + inbox ─────────────────────────────────────────────────────────────

export function NotificationBell() {
  const { inbox, unread, panelOpen, setPanelOpen, markAllRead, dismissInbox, desktop, enableDesktop, push_, enablePush, disablePush } = useNotifications();

  useEffect(() => {
    if (panelOpen) markAllRead();
  }, [panelOpen, markAllRead]);

  return (
    <div className="relative">
      <button
        onClick={() => setPanelOpen((v) => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-phantix-700/50 bg-phantix-900 text-slate-300 transition-colors hover:border-phantix-500/50 hover:text-white"
        title="Notifications"
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={panelOpen}
      >
        <Bell size={16} />
        {unread > 0 && (
          <span
            className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-severity-critical px-1 text-[12px] font-bold"
            style={{ color: "#fff" }}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      <AnimatePresence>
        {panelOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[80]" onClick={() => setPanelOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              className="absolute right-0 top-full z-[85] mt-2 w-[22rem] max-w-[calc(100vw-24px)] overflow-hidden rounded-xl border border-phantix-700/50 bg-phantix-900 shadow-card"
              role="dialog"
              aria-label="Notifications"
            >
              <div className="flex items-center justify-between border-b border-phantix-700/40 px-3.5 py-2.5">
                <p className="text-[13px] font-semibold uppercase tracking-wider text-slate-400">Notifications</p>
                <span className="text-[12px] text-slate-500">{inbox.length} total</span>
              </div>
              {push_.available ? (
                <div className="border-b border-phantix-700/40 px-3.5 py-2 text-[12px]">
                  {push_.subscribed ? (
                    <div className="flex items-center justify-between gap-2 text-slate-400">
                      <span className="flex items-center gap-1.5"><BellRing size={13} className="text-emerald-400" /> Push notifications on for this browser</span>
                      <button type="button" disabled={push_.busy} onClick={() => void disablePush()} className="text-slate-500 hover:text-slate-200">Turn off</button>
                    </div>
                  ) : (
                    <button type="button" disabled={push_.busy || desktop === "denied"} onClick={() => void enablePush()}
                      className="flex w-full items-center gap-2 text-left text-gold-300 hover:text-gold-200 disabled:text-slate-500">
                      {desktop === "denied" ? <BellOff size={13} /> : <Monitor size={13} />}
                      {desktop === "denied"
                        ? "Notifications are blocked for this site in your browser settings"
                        : "Turn on push notifications, even when SecureGraph is closed"}
                    </button>
                  )}
                  {push_.error && <p className="mt-1 text-severity-critical">{push_.error}</p>}
                </div>
              ) : desktop === "default" && (
                <button
                  type="button"
                  onClick={() => void enableDesktop()}
                  className="flex w-full items-center gap-2 border-b border-phantix-700/40 bg-gold-400/5 px-3.5 py-2 text-left text-[12px] text-gold-300 hover:bg-gold-400/10"
                >
                  <Monitor size={13} /> Get desktop notifications when this tab is in the background
                </button>
              )}
              <div className="max-h-96 overflow-y-auto">
                {inbox.length === 0 && <p className="px-4 py-8 text-center text-xs text-slate-500">Nothing yet. Finished scans, campaigns, audits and reports show up here.</p>}
                {inbox.map((n) => {
                  const meta = SEV_META[n.severity] ?? SEV_META.info;
                  return (
                    <div key={noticeKey(n)} className="flex items-start gap-2.5 border-b border-phantix-700/30 px-3.5 py-2.5 last:border-0">
                      <span className={cx("mt-1.5 h-2 w-2 shrink-0 rounded-full", meta.bar)} />
                      <NoticeLinkWrap link={n.link} onGo={() => setPanelOpen(false)} className={cx("block min-w-0 flex-1", n.link && "group")}>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[12px] font-medium text-slate-400">{eventLabel(n.eventType)}</span>
                          <span className="text-[12px] text-slate-600">· {timeAgo(n.createdAt)}</span>
                        </div>
                        <p className="mt-0.5 text-[13px] leading-5 text-slate-200 group-hover:text-white">
                          {n.title}
                          {n.link && <ArrowUpRight size={12} className="ml-1 inline text-gold-400" />}
                        </p>
                      </NoticeLinkWrap>
                      <button onClick={() => dismissInbox(n)} className="rounded p-1 text-slate-500 hover:text-slate-200" aria-label="Remove notification">
                        <X size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Live alerts: toasts, pinned criticals, desktop ──────────────────────────

function toNotice(e: AlertEvent): AlertNotice {
  const sev = (["critical", "high", "medium", "low", "info"].includes(e.severity) ? e.severity : "info") as Severity;
  const payload = (e.payload && typeof e.payload === "object" ? e.payload : {}) as Payload;
  return {
    id: e.id,
    severity: sev,
    title: e.title,
    eventType: e.event_type,
    createdAt: e.created_at,
    body: e.body || undefined,
    link: linkFor(e.event_type, payload),
    source: "alert",
  };
}

/**
 * Polls the organization's alert feed (every org user sees the same events)
 * and surfaces new ones without getting in the way: a toast for most, a pinned
 * card for criticals that stays until dismissed. Everything also lands in the
 * bell. Nothing here blocks the page.
 */
export default function AlertNotifications() {
  const { push, push_ } = useNotifications();
  const [toasts, setToasts] = useState<AlertNotice[]>([]);
  const pushOn = useRef(false);
  pushOn.current = push_.subscribed;
  const [pinned, setPinned] = useState<AlertNotice[]>([]);
  // Phones show one notice at a time (the newest; a pinned critical first) so a
  // burst never buries the screen. Everything still lands in the bell's inbox.
  const [phone, setPhone] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const on = () => setPhone(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const seenRef = useRef<Set<string>>(new Set());

  const dismissToast = (n: AlertNotice) => setToasts((s) => s.filter((x) => noticeKey(x) !== noticeKey(n)));
  const dismissPinned = (n: AlertNotice) => setPinned((s) => s.filter((x) => noticeKey(x) !== noticeKey(n)));

  const surface = useCallback((notice: AlertNotice) => {
    push(notice);
    // With push on, the service worker shows the system notification.
    if (!pushOn.current) desktopNotify(notice);
    if (notice.severity === "critical") {
      setPinned((s) => (s.some((x) => noticeKey(x) === noticeKey(notice)) ? s : [notice, ...s].slice(0, 3)));
      return;
    }
    setToasts((s) => (s.some((x) => noticeKey(x) === noticeKey(notice)) ? s : [notice, ...s].slice(0, 4)));
    window.setTimeout(() => setToasts((s) => s.filter((x) => noticeKey(x) !== noticeKey(notice))), TOAST_MS);
  }, [push]);

  const check = useCallback(async () => {
    try {
      // Every recorded event is an in-app notification, whatever happened to
      // its email/chat delivery (skipped, failed or sent).
      const notices = await loadFeed();
      const sorted = [...notices].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      for (const notice of sorted) {
        const key = noticeKey(notice);
        if (seenRef.current.has(key)) {
          push(notice); // picks up a read made in another app or device
          continue;
        }
        seenRef.current.add(key);
        // Already surfaced in an earlier session, or read elsewhere: back into the bell quietly.
        if (hasNotice("seen", key) || notice.read) {
          push(notice);
          continue;
        }
        rememberNotices("seen", [key]);
        surface(notice);
      }
    } catch { /* transient; the connection watch reports outages */ }
  }, [push, surface]);

  useEffect(() => {
    void check();
    const t = setInterval(check, POLL_MS);
    // Catch up straight away when the user comes back to the tab.
    const onVisible = () => { if (document.visibilityState === "visible") void check(); };
    document.addEventListener("visibilitychange", onVisible);
    // A push arrived: fetch now rather than at the next poll.
    const onSwMessage = (e: MessageEvent) => { if ((e.data as { type?: string })?.type === "phantix:push") void check(); };
    if (pushSupported()) navigator.serviceWorker.addEventListener("message", onSwMessage);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
      if (pushSupported()) navigator.serviceWorker.removeEventListener("message", onSwMessage);
    };
  }, [check]);

  const demoSeeded = useRef(false);
  useEffect(() => {
    if (!isDemoMode() || demoSeeded.current) return;
    demoSeeded.current = true;
    const now = Date.now();
    surface({ id: 9992, severity: "high", title: "JWT algorithm confusion on api.acme.ng", eventType: "risk.created", createdAt: new Date(now - 15_000).toISOString(), link: { app: "core", path: "/tracker" } });
    window.setTimeout(() => {
      surface({ id: 9993, severity: "info", title: "Scan #87 completed with 23 findings", eventType: "scan.completed", createdAt: new Date(now - 25_000).toISOString(), link: { app: "attack", path: "/scans" } });
    }, 400);
  }, [surface]);

  return (
    <div className="pointer-events-none fixed inset-x-3 top-[calc(64px+env(safe-area-inset-top))] z-[90] flex flex-col gap-2 md:inset-x-auto md:right-4 md:top-16 md:w-[22rem] md:max-w-[calc(100vw-32px)]" aria-live="polite">
      <AnimatePresence>
        {(phone ? pinned.slice(0, 1) : pinned).map((n) => (
          <motion.div
            key={`p-${noticeKey(n)}`}
            initial={{ opacity: 0, x: 60 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 60 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            role="alert"
            className="pointer-events-auto relative overflow-hidden rounded-xl border border-severity-critical/50 bg-phantix-900 shadow-card"
          >
            <span className="absolute inset-y-0 left-0 w-1.5 bg-severity-critical" />
            <div className="p-3.5 pl-5">
              <div className="flex items-start gap-2">
                <span className="relative mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-severity-critical/20 text-severity-critical">
                  <span className="absolute inset-0 animate-ping rounded-full bg-severity-critical/30" />
                  <BellRing size={13} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-semibold uppercase tracking-wider text-red-300">{eventLabel(n.eventType)}</p>
                  <p className="mt-0.5 text-sm font-medium leading-5 text-white">{n.title}</p>
                </div>
                <button onClick={() => dismissPinned(n)} className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-phantix-800/70 hover:text-white" aria-label="Dismiss; it stays in notifications">
                  <X size={14} />
                </button>
              </div>
              <div className="mt-2.5 flex items-center gap-3 pl-8">
                {n.link && (
                  <NoticeLinkWrap link={n.link} onGo={() => dismissPinned(n)} className="btn-primary !px-3 !py-1 !text-xs">
                    Review now
                  </NoticeLinkWrap>
                )}
                <button onClick={() => dismissPinned(n)} className="text-xs text-slate-400 hover:text-slate-200">Later</button>
              </div>
            </div>
          </motion.div>
        ))}
        {(phone ? (pinned.length ? [] : toasts.slice(0, 1)) : toasts).map((n) => {
          const meta = SEV_META[n.severity] ?? SEV_META.info;
          const done = /completed|finished|generated|published|ready/i.test(n.eventType) && n.severity !== "high";
          return (
            <motion.div
              key={`t-${noticeKey(n)}`}
              initial={{ opacity: 0, x: 60 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 60 }}
              transition={{ type: "spring", stiffness: 320, damping: 30 }}
              className="pointer-events-auto relative overflow-hidden rounded-xl border border-phantix-700/50 bg-phantix-900 shadow-card"
            >
              <span className={cx("absolute inset-y-0 left-0 w-1", done ? "bg-emerald-400" : meta.bar)} />
              <div className="flex items-start gap-3 p-3 pl-4">
                {done ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-400" /> : <span className={cx("chip shrink-0 !text-[12px]", meta.chip)}>{meta.icon} {meta.label}</span>}
                <NoticeLinkWrap link={n.link} onGo={() => dismissToast(n)} className="block min-w-0 flex-1">
                  <p className="text-[12px] text-slate-400">{eventLabel(n.eventType)}</p>
                  <p className="text-[13px] font-medium leading-5 text-slate-100">{n.title}</p>
                </NoticeLinkWrap>
                <button onClick={() => dismissToast(n)} className="shrink-0 rounded-md p-1 text-slate-500 hover:bg-phantix-800/70 hover:text-slate-200" aria-label="Dismiss notification">
                  <X size={14} />
                </button>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

// ── Connection watch ─────────────────────────────────────────────────────────

type ConnState = "online" | "offline" | "server_down";

async function serverAlive(): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = window.setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(`${API_BASE}/health`, { cache: "no-store", signal: ctrl.signal });
    window.clearTimeout(t);
    // 404 = a backend without the route: it answered, so it's up.
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
}

/**
 * Tells the user when they're offline or SecureGraph can't be reached, in a
 * card that doesn't block the page. Dismissing it keeps it in the bell; when
 * the connection comes back, that's noted there too.
 */
export function ConnectionWatch() {
  const { push } = useNotifications();
  const [state, setState] = useState<ConnState>(() => (typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "online"));
  const [hidden, setHidden] = useState(false);
  const downSince = useRef<number | null>(null);
  const failures = useRef(0);
  const stateRef = useRef(state);
  stateRef.current = state;

  const goDown = useCallback((next: Exclude<ConnState, "online">) => {
    if (stateRef.current === next) return;
    if (stateRef.current === "online") downSince.current = Date.now();
    setHidden(false);
    setState(next);
  }, []);

  const goUp = useCallback(() => {
    if (stateRef.current === "online") return;
    const since = downSince.current;
    downSince.current = null;
    failures.current = 0;
    setState("online");
    if (since) {
      const mins = Math.max(1, Math.round((Date.now() - since) / 60000));
      push({
        id: since,
        severity: "info",
        title: `Connection restored after about ${mins} minute${mins === 1 ? "" : "s"}`,
        eventType: "system.connection",
        createdAt: new Date().toISOString(),
      });
    }
  }, [push]);

  const probe = useCallback(async () => {
    if (navigator.onLine === false) { goDown("offline"); return; }
    if (await serverAlive()) { goUp(); return; }
    // Two misses in a row before saying anything: one slow request isn't an outage.
    failures.current += 1;
    if (failures.current >= 2) goDown("server_down");
  }, [goDown, goUp]);

  useEffect(() => {
    if (isDemoMode()) return;
    const onOffline = () => goDown("offline");
    const onOnline = () => void probe();
    const onNetworkError = () => void probe();
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    window.addEventListener("phantix:network-error", onNetworkError);
    // Faster checks while down, so recovery shows quickly.
    const t = window.setInterval(() => void probe(), state === "online" ? 60_000 : 10_000);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("phantix:network-error", onNetworkError);
      window.clearInterval(t);
    };
  }, [goDown, probe, state]);

  const dismiss = () => {
    setHidden(true);
    if (downSince.current) {
      push({
        id: downSince.current,
        severity: "high",
        title: state === "offline" ? "You went offline" : "SecureGraph couldn't be reached",
        eventType: "system.connection",
        createdAt: new Date(downSince.current).toISOString(),
      });
    }
  };

  const show = state !== "online" && !hidden;
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          role="status"
          className="fixed bottom-4 left-1/2 z-[90] w-[min(28rem,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-xl border border-severity-medium/40 bg-phantix-900 shadow-card"
        >
          <div className="flex items-start gap-3 p-3.5">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-severity-medium/15 text-severity-medium">
              {state === "offline" ? <WifiOff size={16} /> : <CloudOff size={16} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white">{state === "offline" ? "You're offline" : "Can't reach SecureGraph right now"}</p>
              <p className="mt-0.5 text-[13px] text-slate-400">
                {state === "offline"
                  ? "Check your internet connection. We'll reconnect on our own."
                  : "Your work on this page is kept. We're retrying every few seconds."}
              </p>
              <button type="button" onClick={() => void probe()} className="mt-2 text-[13px] text-gold-400 hover:text-gold-300">Try now</button>
            </div>
            <button onClick={dismiss} className="shrink-0 rounded-md p-1 text-slate-500 hover:bg-phantix-800/70 hover:text-slate-200" aria-label="Dismiss; it stays in notifications">
              <X size={14} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
