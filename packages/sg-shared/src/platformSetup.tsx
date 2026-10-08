/**
 * Platform setup from inside the applications.
 *
 * Some setup only exists on the Platform (verified domains, the security
 * database, the GitHub App, dual control). The applications offer it where the
 * need shows up and open the exact Platform page in a new tab; Platform sign-in
 * returns to that page, and the application refreshes when the user comes back.
 */
import React, { useCallback, useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { api, isDemoMode } from "./api";
import { PLATFORM_URL } from "./config";
import { cx } from "./utils";

export type PlatformTask =
  | { kind: "verify_domain"; domain?: string }
  | { kind: "connect_database" }
  | { kind: "install_github" }
  | { kind: "dual_control" }
  | { kind: "invite_teammate" };

export function platformTaskUrl(task: PlatformTask): string {
  switch (task.kind) {
    case "verify_domain":
      return `${PLATFORM_URL}/identity${task.domain ? `?verify=${encodeURIComponent(task.domain)}` : ""}#domains`;
    case "connect_database":
      return `${PLATFORM_URL}/connections`;
    case "install_github":
      return `${PLATFORM_URL}/github`;
    case "dual_control":
      return `${PLATFORM_URL}/identity#dual-control`;
    case "invite_teammate":
      return `${PLATFORM_URL}/users`;
  }
}

/** A Platform setup step that opens in a new tab. */
export function PlatformSetupLink({
  task, children, className, variant = "link",
}: {
  task: PlatformTask;
  children: React.ReactNode;
  className?: string;
  variant?: "link" | "primary" | "secondary";
}) {
  return (
    <a
      href={platformTaskUrl(task)}
      target="_blank"
      rel="noopener noreferrer"
      className={cx(
        variant === "primary" ? "btn-primary" : variant === "secondary" ? "btn-secondary" : "inline-flex items-center gap-1 text-gold-400 hover:text-gold-300",
        className,
      )}
    >
      {children}
      <ExternalLink size={12} aria-hidden="true" />
      <span className="sr-only">(opens the Platform in a new tab)</span>
    </a>
  );
}

/** Run `fn` when the user returns to this tab (e.g. after finishing a Platform step). */
export function useOnReturn(fn: () => void) {
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") fn(); };
    window.addEventListener("focus", fn);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", fn);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [fn]);
}

// ── Verified domains ────────────────────────────────────────────────────────

export type VerifiedDomain = { id: number; domain: string; status: "pending" | "verified"; is_primary?: boolean };

/** Lowercase host from a domain, URL or host:port; "" when there is none. */
export function hostOf(value: string): string {
  const v = String(value || "").trim().toLowerCase();
  if (!v) return "";
  const noScheme = v.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  const host = noScheme.split(/[/?#]/)[0].replace(/^[^@]*@/, "");
  return host.replace(/:\d+$/, "").replace(/\.$/, "").replace(/^\*\./, "");
}

export function isIpLike(value: string): boolean {
  const h = hostOf(value);
  return /^\d{1,3}(\.\d{1,3}){3}(\/\d+)?$/.test(h) || h.includes(":") || /^\[.*\]$/.test(h);
}

/** Label-suffix match: api.acme.com is under acme.com; notacme.com is not. */
export function hostUnder(host: string, domain: string): boolean {
  const h = hostOf(host);
  const d = hostOf(domain);
  return Boolean(h && d) && (h === d || h.endsWith(`.${d}`));
}

/** Second-level registries where the registrable name has three labels. */
const SECOND_LEVEL = new Set(["co", "com", "net", "org", "gov", "edu", "ac", "ltd", "plc", "sch", "mil"]);

/** The domain to suggest verifying for a host: its registrable name (acme.com, acme.com.ng). */
export function suggestDomain(value: string): string {
  const labels = hostOf(value).split(".").filter(Boolean);
  if (labels.length <= 2) return labels.join(".");
  const tld = labels[labels.length - 1];
  const sld = labels[labels.length - 2];
  return labels.slice(tld.length === 2 && SECOND_LEVEL.has(sld) ? -3 : -2).join(".");
}

/** Asset types whose ownership a verified domain can cover. */
const WEB_TYPES = new Set(["domain", "subdomain", "url", "web_app", "webapp", "api", "api_endpoint", "website", "host", "hostname", "web_path"]);
export const isWebAssetType = (type: string) => WEB_TYPES.has(String(type || "").toLowerCase());

/**
 * The org's verified domains (Platform → Identity), refreshed when the user
 * comes back to the tab. Empty on a backend without the endpoint.
 */
export function useVerifiedDomains() {
  const [domains, setDomains] = useState<VerifiedDomain[]>([]);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(() => {
    if (isDemoMode()) {
      setDomains([{ id: 1, domain: "acme.ng", status: "verified", is_primary: true }]);
      setLoaded(true);
      return;
    }
    api.get<{ items?: VerifiedDomain[] }>("/org-users/domains")
      .then((res) => setDomains(Array.isArray(res?.items) ? res.items : []))
      .catch(() => setDomains([]))
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => { reload(); }, [reload]);
  useOnReturn(reload);

  const verified = domains.filter((d) => d.status === "verified");
  const coveredBy = useCallback(
    (value: string) => verified.find((d) => hostUnder(value, d.domain))?.domain ?? null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [domains],
  );
  return { domains, verified, loaded, reload, coveredBy };
}

// ── Prerequisites ───────────────────────────────────────────────────────────

type Milestones = { milestones?: { key: string; done_at: string | null }[] };

/**
 * What the organization has set up on the Platform, as far as the applications
 * can tell: the security database (from onboarding milestones) and verified
 * domains. `null` means unknown (older backend) — callers then stay quiet.
 */
export function useSetupStatus() {
  const { verified, loaded: domainsLoaded, reload: reloadDomains } = useVerifiedDomains();
  const [databaseReady, setDatabaseReady] = useState<boolean | null>(null);

  const reload = useCallback(() => {
    if (isDemoMode()) { setDatabaseReady(true); return; }
    api.get<Milestones>("/org-users/onboarding")
      .then((res) => {
        const m = res?.milestones?.find((x) => x.key === "security_db_connected");
        setDatabaseReady(m ? Boolean(m.done_at) : null);
      })
      .catch(() => setDatabaseReady(null));
  }, []);

  useEffect(() => { reload(); }, [reload]);
  useOnReturn(reload);

  return {
    databaseReady,
    hasVerifiedDomain: domainsLoaded ? verified.length > 0 : null,
    reload: () => { reload(); reloadDomains(); },
  };
}

export type Prerequisite = "database" | "verified_domain";

const PREREQ: Record<Prerequisite, { label: string; detail: string; task: PlatformTask; cta: string }> = {
  database: {
    label: "Connect your security database",
    detail: "Findings and scan results are stored in a database you own. A free Neon or Supabase project takes about two minutes.",
    task: { kind: "connect_database" },
    cta: "Connect database",
  },
  verified_domain: {
    label: "Verify a domain you own",
    detail: "Active tests send real attack traffic, so we need proof you own the target. One check covers a domain and all its subdomains.",
    task: { kind: "verify_domain" },
    cta: "Verify a domain",
  },
};

/**
 * "Before you can …" — lists what's missing for this page and links straight
 * to it on the Platform (new tab). Re-checks when the user comes back. Renders
 * nothing when everything is in place or the status is unknown.
 */
export function SetupRequired({ needs, action }: { needs: Prerequisite[]; action: string }) {
  const status = useSetupStatus();
  const missing = needs.filter((n) =>
    n === "database" ? status.databaseReady === false : status.hasVerifiedDomain === false,
  );
  if (!missing.length) return null;
  return (
    <section aria-labelledby="setup-required-title" className="mb-5 rounded-md border border-gold-400/30 bg-gold-400/5 p-4">
      <h2 id="setup-required-title" className="text-sm font-semibold text-white">Before you can {action}</h2>
      <ol className="mt-3 space-y-3">
        {missing.map((n, i) => (
          <li key={n} className="flex flex-wrap items-start gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-gold-400/40 text-xs text-gold-300">{i + 1}</span>
            <div className="min-w-[12rem] flex-1">
              <p className="text-sm text-slate-200">{PREREQ[n].label}</p>
              <p className="mt-0.5 text-[13px] text-slate-400">{PREREQ[n].detail}</p>
            </div>
            <PlatformSetupLink task={PREREQ[n].task} variant="secondary" className="!py-1.5 text-xs">{PREREQ[n].cta}</PlatformSetupLink>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-[12px] text-slate-500">Each step opens the Platform in a new tab. This page updates when you come back.</p>
    </section>
  );
}

// ── AUP confirmation (IP targets, C11) ──────────────────────────────────────

export type AupStatus = { current_version: string; accepted_version: string | null; covers_ip_targets: boolean };

/**
 * Whether the org has confirmed the AUP version that covers IP targets.
 * `null` = unknown (older backend). Refreshes after a confirmation and on tab return.
 */
export function useAupStatus() {
  const [status, setStatus] = useState<AupStatus | null>(null);
  const reload = useCallback(() => {
    if (isDemoMode()) { setStatus({ current_version: "2026-10-03", accepted_version: "2026-10-03", covers_ip_targets: true }); return; }
    api.get<AupStatus>("/org-users/aup")
      .then((r) => setStatus(r && typeof r.covers_ip_targets === "boolean" ? r : null))
      .catch(() => setStatus(null));
  }, []);
  useEffect(() => { reload(); }, [reload]);
  useOnReturn(reload);
  useEffect(() => {
    window.addEventListener("phantix:aup-accepted", reload);
    return () => window.removeEventListener("phantix:aup-accepted", reload);
  }, [reload]);
  return { status, reload };
}
