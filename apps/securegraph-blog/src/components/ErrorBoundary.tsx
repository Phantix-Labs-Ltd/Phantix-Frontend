import { Component, type ErrorInfo, type ReactNode } from "react";

/** A render crash shows a note in the Weekly's style instead of a blank page. */
export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[Weekly] page crashed:", error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="desk desk-full">
        <div className="state-sheet">
          <div className="state-note" role="alert">
            <h1 className="state-title">This page could not be shown.</h1>
            <p className="state-hint">
              Reload the page in a moment, or <a className="md-a" href="/">read the issue for this week</a>.
            </p>
          </div>
        </div>
      </main>
    );
  }
}
