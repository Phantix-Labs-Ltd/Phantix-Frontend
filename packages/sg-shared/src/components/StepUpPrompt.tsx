import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ExternalLink, Globe, Loader2, ShieldCheck, X } from "lucide-react";
import { useStore } from "../store";
import { api, setStepUpToken } from "../api";
import { PlatformSetupLink, suggestDomain } from "../platformSetup";
import { PLATFORM_URL } from "../config";

function Dialog({ open, onClose, labelledBy, children }: { open: boolean; onClose: () => void; labelledBy: string; children: React.ReactNode }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[96] flex items-center justify-center bg-phantix-950/90 p-4 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelledBy}
        >
          <motion.div
            initial={{ opacity: 0, y: 28, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className="relative w-full max-w-md overflow-hidden rounded-2xl border border-phantix-600/50 bg-phantix-900/95 px-6 py-5 shadow-card"
          >
            <button
              type="button"
              onClick={onClose}
              className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-500 hover:bg-phantix-800/80 hover:text-slate-200"
              aria-label="Cancel"
            >
              <X size={16} />
            </button>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Solo mode (dual control off): a sensitive action asks the signed-in person
 * for a one-time code instead of a second approver. The token lasts about 15
 * minutes, so a run of related actions only asks once.
 */
/**
 * The backend's step-up reason is written for developers ("request a code with
 * POST /org-users/auth/step-up/send ... X-Step-Up-Token header"). Show it only
 * when it reads as plain language.
 */
function friendlyReason(reason?: string | null): string {
  const r = (reason || "").trim();
  if (!r || /\b(GET|POST|PUT|PATCH|DELETE)\b|\/[a-z0-9-]+\/|\bX-[A-Za-z-]+|header|token/i.test(r)) {
    return "This is a sensitive change, so we need to confirm it is you.";
  }
  return r;
}

export default function StepUpPrompt() {
  const { stepUpPrompt, closeStepUpPrompt, session } = useStore();
  const [sent, setSent] = useState<{ masked: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ destination_masked?: string }>("/org-users/auth/step-up/send", {});
      setSent({ masked: res?.destination_masked || session?.userEmail || "your email" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the code");
    } finally {
      setBusy(false);
    }
  };

  // Each prompt starts fresh and sends the code straight away.
  useEffect(() => {
    if (!stepUpPrompt.open) return;
    setSent(null);
    setCode("");
    setError(null);
    void send();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepUpPrompt.open]);

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ step_up_token: string; expires_in?: number }>("/org-users/auth/step-up/verify", { code });
      setStepUpToken(res.step_up_token, res.expires_in ?? 900);
      closeStepUpPrompt(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That code didn't work");
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={stepUpPrompt.open} onClose={() => closeStepUpPrompt(false)} labelledBy="stepup-title">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gold-400/15 text-gold-400">
          <ShieldCheck size={20} />
        </span>
        <div>
          <p id="stepup-title" className="font-display text-lg font-bold text-white">Confirm it's you</p>
          <p className="text-xs text-slate-400">Needed for sensitive actions. Lasts 15 minutes.</p>
        </div>
      </div>
      <p className="mt-3 text-[13px] leading-5 text-slate-400">{friendlyReason(stepUpPrompt.reason)}</p>
      <form onSubmit={verify} className="mt-4 space-y-3">
        <p className="text-sm text-slate-300">
          {sent ? <>We sent a code to <span className="text-white">{sent.masked}</span>.</> : busy ? "Sending a code..." : "We'll email you a code."}
        </p>
        <input
          className="input text-center font-mono !text-2xl !tracking-[0.5em]"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
          placeholder="••••••"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          aria-label="One-time code"
        />
        {error && <p className="text-sm text-severity-critical">{error}</p>}
        <button className="btn-primary w-full !py-3" disabled={busy || code.length < 4}>
          {busy && sent ? <Loader2 size={15} className="animate-spin" /> : null} Confirm
        </button>
        <button type="button" onClick={() => void send()} disabled={busy} className="w-full text-center text-xs text-slate-500 hover:text-slate-300 disabled:opacity-50">
          Send a new code
        </button>
      </form>
    </Dialog>
  );
}

/**
 * Active testing (VAPT, active scans) on a target the org hasn't proven it
 * owns. Proving the company domain covers that domain and its subdomains, so
 * this only opens for targets outside it (other domains, bare IPs) or when no
 * domain is verified yet. The backend decides; this explains the answer.
 */
export function TargetUnverifiedNotice() {
  const [notice, setNotice] = useState<{ target: string; verifiedDomain: string | null } | null>(null);
  useEffect(() => {
    const onUnverified = (e: Event) => {
      const d = (e as CustomEvent).detail as
        | { target?: string; verified_domain?: string | null; verified_domains?: string[] }
        | undefined;
      const list = Array.isArray(d?.verified_domains) ? d!.verified_domains.filter(Boolean) : [];
      setNotice({
        target: d?.target || "this target",
        verifiedDomain: list.length ? list.join(", ") : d?.verified_domain || null,
      });
    };
    window.addEventListener("phantix:target-unverified", onUnverified);
    return () => window.removeEventListener("phantix:target-unverified", onUnverified);
  }, []);

  const close = () => setNotice(null);
  return (
    <Dialog open={notice !== null} onClose={close} labelledBy="target-unverified-title">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gold-400/15 text-gold-400">
          <Globe size={20} />
        </span>
        <p id="target-unverified-title" className="font-display text-lg font-bold text-white">
          {notice?.verifiedDomain ? "This target needs its own check" : "Verify the domain first"}
        </p>
      </div>
      {notice && (
        <p className="mt-3 text-sm leading-6 text-slate-300">
          Active testing sends real attack traffic, so we need proof that you control{" "}
          <span className="break-all font-mono text-white">{notice.target}</span>.{" "}
          {notice.verifiedDomain ? (
            <>
              It isn't under your verified {notice.verifiedDomain.includes(",") ? "domains" : "domain"}{" "}
              <span className="font-mono text-white">{notice.verifiedDomain}</span>. Verify{" "}
              <span className="font-mono text-white">{suggestDomain(notice.target)}</span> too; it takes a few minutes and
              covers all its subdomains.
            </>
          ) : (
            <>
              Verify <span className="font-mono text-white">{suggestDomain(notice.target)}</span> once and it covers that
              domain and all its subdomains. It takes a few minutes.
            </>
          )}
        </p>
      )}
      <p className="mt-2 text-[13px] text-slate-500">Passive Quick Scans don't need this.</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <PlatformSetupLink task={{ kind: "verify_domain", domain: notice ? suggestDomain(notice.target) : undefined }} variant="primary">
          Verify {notice ? suggestDomain(notice.target) : "the domain"}
        </PlatformSetupLink>
        <button type="button" onClick={close} className="btn-ghost">Not now</button>
      </div>
    </Dialog>
  );
}

/**
 * C11: IP addresses can't be verified by a DNS or file check, so the customer
 * confirms the current AUP instead — they own each IP or are authorized in
 * writing to test it, and they're responsible for it. Opens on the API's
 * `aup_acceptance_required` answer or from an asset's ownership panel.
 */
/** First AUP version with the IP attestation (backend IP_COVERAGE_MIN_VERSION). */
const AUP_IP_MIN_VERSION = "2026-10-03";

export function AupAcceptPrompt() {
  const { aupPrompt, closeAupPrompt } = useStore();
  const [version, setVersion] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!aupPrompt.open) return;
    setAgreed(false);
    setError(null);
    setVersion(aupPrompt.version);
    if (!aupPrompt.version) {
      api.get<{ current_version?: string }>("/org-users/aup")
        .then((r) => setVersion(r?.current_version || ""))
        .catch(() => setError("Couldn't load the current policy. Try again."));
    }
  }, [aupPrompt.open, aupPrompt.version]);

  const accept = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post("/org-users/aup/accept", { version });
      closeAupPrompt(true);
    } catch (err) {
      const status = (err as { status?: number })?.status;
      const code = ((err as { detail?: { code?: string } })?.detail || {}).code;
      if (code === "aup_version_mismatch") {
        const r = await api.get<{ current_version?: string }>("/org-users/aup").catch(() => null);
        if (r?.current_version) setVersion(r.current_version);
        setError("The policy was just updated. Read it again, then confirm.");
      } else if (status === 403) {
        setError("Only an organization admin can confirm this. Ask your admin to open this target and confirm.");
      } else {
        setError(err instanceof Error ? err.message : "Couldn't record your confirmation");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={aupPrompt.open} onClose={() => closeAupPrompt(false)} labelledBy="aup-title">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gold-400/15 text-gold-400">
          <ShieldCheck size={20} />
        </span>
        <p id="aup-title" className="font-display text-lg font-bold text-white">Confirm you're authorized</p>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-300">
        IP addresses can't be checked with a DNS record, so we rely on your confirmation
        {aupPrompt.target ? <> for <span className="break-all font-mono text-white">{aupPrompt.target}</span></> : null}.
        Our Acceptable Use Policy covers this from version {AUP_IP_MIN_VERSION}.
      </p>
      {version && version < AUP_IP_MIN_VERSION ? (
        <p className="mt-4 rounded-md border border-severity-medium/30 bg-severity-medium/5 px-3.5 py-2.5 text-sm text-slate-300">
          The updated policy that covers IP addresses hasn't been published yet, so this can't be confirmed today.
          Ask your SecureGraph contact, or verify a domain for web targets in the meantime.
        </p>
      ) : (
      <form onSubmit={accept} className="mt-4 space-y-3">
        <label className="flex items-start gap-2.5 text-[13px] leading-5 text-slate-300">
          <input type="checkbox" className="mt-0.5" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
          <span>
            I own every IP address and range I add, or hold written authorization from its owner to test it. I accept
            responsibility for testing it, as set out in the{" "}
            <a href={`${PLATFORM_URL}/aup`} target="_blank" rel="noopener noreferrer" className="text-gold-400 hover:text-gold-300">
              Acceptable Use Policy <ExternalLink size={11} className="inline" />
            </a>
            , on behalf of my organization.
          </span>
        </label>
        {error && <p className="text-sm text-severity-critical">{error}</p>}
        <button className="btn-primary w-full !py-3" disabled={busy || !agreed || !version}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : null} Confirm and continue
        </button>
      </form>
      )}
    </Dialog>
  );
}
