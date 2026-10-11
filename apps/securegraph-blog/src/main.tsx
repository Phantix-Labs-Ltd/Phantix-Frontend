import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import { primeContent, type ContentSnapshot } from "./lib/content";
import "./index.css";

// A prerendered page carries the content it was built from (prerender.mjs), so
// the first render matches its HTML instead of flashing a loading state.
const embedded = document.getElementById("weekly-content");
if (embedded?.textContent) {
  try {
    primeContent(JSON.parse(embedded.textContent) as ContentSnapshot);
  } catch {
    /* malformed: load from the API as usual */
  }
}

// createRoot (not hydrateRoot) replaces the prerendered markup, so the page can
// never hit a hydration mismatch when the API has moved on since the build.
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </BrowserRouter>
  </React.StrictMode>
);
