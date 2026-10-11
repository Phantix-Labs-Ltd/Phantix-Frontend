import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

/**
 * Keeps a crash on one page from blanking the application.
 *
 * Inside the shell it wraps the page outlet, so the sidebar and header stay
 * usable and the user can move on; `resetKey` (the route) clears the error
 * when they navigate. At the root it catches anything outside the shell
 * (sign-in, docs) with a full-screen card. Nothing technical is shown to the
 * user: the error and its component stack go to the console for triage.
 */
export default class PageErrorBoundary extends React.Component<
  { children: React.ReactNode; resetKey?: string; fullScreen?: boolean },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[SecureGraph] page crashed:", error, info.componentStack);
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    // A lazy page that fails to load after a deploy: the old chunk is gone.
    const stale = /Loading chunk|dynamically imported module|Importing a module script failed/i.test(error.message || "");
    const card = (
      <div role="alert" className="card w-full max-w-lg p-7 text-left">
        <div className="flex items-start gap-3">
          <span className="rounded-md bg-severity-medium/15 p-2.5">
            <AlertTriangle size={20} className="text-severity-medium" />
          </span>
          <div className="min-w-0">
            <h1 className="font-display text-lg font-semibold text-white">
              {stale ? "A new version is available" : "This page could not load"}
            </h1>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-400">
              {stale
                ? "SecureGraph was updated while this tab was open. Reload to continue."
                : "Something on this page failed. Your data is safe. Try again, or open another page from the menu."}
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {!stale && (
            <button type="button" className="btn-primary" onClick={() => this.setState({ error: null })}>
              Try again
            </button>
          )}
          <button type="button" className={stale ? "btn-primary" : "btn-secondary"} onClick={() => window.location.reload()}>
            <RefreshCw size={14} /> Reload
          </button>
        </div>
      </div>
    );
    return this.props.fullScreen ? (
      <div className="flex min-h-screen items-center justify-center bg-phantix-950 px-4">{card}</div>
    ) : (
      <div className="flex flex-1 items-start justify-center py-10">{card}</div>
    );
  }
}
