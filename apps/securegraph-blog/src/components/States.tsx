import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";

export function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="desk desk-full">
      <div className="state-sheet">{children}</div>
    </main>
  );
}

export function LoadingState() {
  return (
    <p className="state-note" role="status">
      The issue for this week is loading.
    </p>
  );
}

/** Any URL the Weekly does not have — a real 404 rather than the front page. */
export function NotFoundPage() {
  useEffect(() => {
    document.title = "Page not found · The SecureGraph Weekly";
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);
  return (
    <Shell>
      <div className="state-note" role="alert">
        <h1 className="state-title">There is nothing at this address.</h1>
        <p className="state-hint">
          The link may be old or mistyped.{" "}
          <Link className="md-a" to="/">Read the issue for this week</Link>
        </p>
      </div>
    </Shell>
  );
}

export function ErrorState({ message, notFound }: { message: string | null; notFound?: boolean }) {
  if (notFound) {
    return (
      <div className="state-note" role="alert">
        <p className="state-title">This essay is not in the Weekly.</p>
        <p className="state-hint">
          The editors may have moved it, or removed it.{" "}
          <Link className="md-a" to="/">Back to the issue for this week</Link>
        </p>
      </div>
    );
  }
  return (
    <div className="state-note" role="alert">
      <p className="state-title">The issue for this week did not arrive.</p>
      {message ? <p className="state-detail">{message}</p> : null}
      <p className="state-hint">
        Refresh the page in a moment. If it still does not load, try again shortly.
      </p>
    </div>
  );
}
