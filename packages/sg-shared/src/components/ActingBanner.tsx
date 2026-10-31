import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Building2, LogOut, ShieldAlert } from "lucide-react";
import { ACTING_EVENT, getActingSession, type ActingSession } from "../acting";
import { consumeActForParam, leaveClient } from "../actingSession";

/**
 * The strip shown while an MSSP analyst works inside a client's account.
 *
 * It also opens the session: the launcher sends `?act_for=<client>`, and once the
 * shell has verified the analyst's own sign-in this asks the backend for an
 * acting token for this application. Everything the analyst does is recorded as
 * them, in the client's account; the client can see it in its access log and
 * revoke the grant at any time — the next call then ends the session here.
 */
export default function ActingBanner({ ready }: { ready: boolean }) {
  const location = useLocation();
  const [session, setSession] = useState<ActingSession | null>(() => getActingSession());
  const [ended, setEnded] = useState<{ reason: string; clientName: string } | null>(null);
  const [entering, setEntering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const onChange = (e: Event) => {
      const d = (e as CustomEvent).detail as { session: ActingSession | null; reason?: string; clientName?: string };
      setSession(d.session);
      setNow(Date.now());
      if (!d.session && d.reason && d.reason !== "exit") {
        setEnded({ reason: d.reason, clientName: d.clientName ?? "the client" });
      }
    };
    window.addEventListener(ACTING_EVENT, onChange);
    return () => window.removeEventListener(ACTING_EVENT, onChange);
  }, []);

  // Open the session the launcher asked for (also on in-app navigation in Core).
  useEffect(() => {
    if (!ready || !location.search.includes("act_for=")) return;
    let alive = true;
    setEntering(true);
    setError(null);
    consumeActForParam()
      .then((s) => {
        if (!alive || !s) return;
        setEnded(null);
        // Pages already on screen loaded the analyst's own data; reload them
        // against the client's account.
        window.location.reload();
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Could not open the client's account."))
      .finally(() => alive && setEntering(false));
    return () => {
      alive = false;
    };
  }, [ready, location.search]);

  // Countdown, and end the session on time even with no API call in flight.
  useEffect(() => {
    if (!session) return;
    const t = window.setInterval(() => {
      setNow(Date.now());
      getActingSession();
    }, 15_000);
    return () => window.clearInterval(t);
  }, [session]);

  const leave = () => {
    leaveClient();
    window.location.reload();
  };

  if (entering) {
    return (
      <div className="mb-4 rounded-2xl border border-gold-400/30 bg-gold-400/5 px-4 py-3 text-sm text-slate-300">
        Opening the client's account…
      </div>
    );
  }

  if (error || ended) {
    return (
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-severity-high/40 bg-severity-high/10 px-4 py-3">
        <ShieldAlert size={16} className="text-severity-high" />
        <p className="min-w-0 flex-1 text-sm text-slate-200">
          {error ??
            (ended?.reason === "revoked"
              ? `Your access to ${ended.clientName} was withdrawn, so you have left its account.`
              : `Your session in ${ended?.clientName ?? "the client"}'s account has ended.`)}{" "}
          <span className="text-slate-400">What is on screen may still be the client's data.</span>
        </p>
        <button className="btn-secondary !py-1.5 !text-sm" onClick={() => window.location.reload()}>
          Back to your account
        </button>
      </div>
    );
  }

  if (!session) return null;
  const minutes = Math.max(0, Math.ceil((session.expiresAt - now) / 60_000));

  return (
    <div
      role="status"
      className="sticky top-2 z-20 mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-gold-400/50 bg-phantix-950/95 backdrop-blur px-4 py-3 shadow-card"
    >
      <Building2 size={16} className="shrink-0 text-gold-300" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-100">
          Working in {session.clientName}'s account
        </p>
        <p className="text-xs text-slate-400">
          Recorded as you · second approval by{" "}
          {session.approvalMode === "mssp" ? "your senior analyst" : "the client's own authorizer"} · ends in {minutes} min
        </p>
      </div>
      <button className="btn-secondary !py-1.5 !text-sm" onClick={leave}>
        <LogOut size={13} /> Leave client
      </button>
    </div>
  );
}
