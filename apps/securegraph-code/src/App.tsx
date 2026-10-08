import React, { Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { ApplicationShell } from "@sg/shell/ApplicationShell";
import type { ApplicationKey } from "@sg/shell/types";
// Docs load when visited, not with the first paint.
const Docs = React.lazy(() => import("@sg/pages/Docs"));
const DocPage = React.lazy(() => import("@sg/pages/DocPage"));
const DocsChrome = React.lazy(() => import("@sg/pages/DocsChrome"));
import { StoreProvider, ToastViewport } from "@sg/store";
import DualControlOverlay from "@sg/components/DualControlOverlay";
import AiBudgetOverlay from "@sg/components/AiBudgetOverlay";
import { BrandLoader } from "@sg/components/BrandLoader";
import { HOSTS } from "./hosts";
import { NAV } from "./nav";
import { useSeo } from "./lib/useSeo";

const Agent = React.lazy(() => import("@sg/pages/Agent"));
const NotFound = React.lazy(() => import("@sg/pages/NotFound"));
const Overview = React.lazy(() => import("./pages/Overview"));
const Code = React.lazy(() => import("./pages/Code"));
const ProviderConnect = React.lazy(() => import("./pages/ProviderConnect"));
const ThreatModels = React.lazy(() => import("./pages/ThreatModels"));
const ContextProjects = React.lazy(() => import("./pages/ContextProjects"));
const CiCd = React.lazy(() => import("./pages/CiCd"));
const ScanHistory = React.lazy(() => import("./pages/ScanHistory"));
const ScanDetail = React.lazy(() => import("./pages/ScanDetail"));

export default function App() {
  // Per-route SEO: /docs stays indexable, every operator route is noindex.
  useSeo();
  return (
    <StoreProvider>
      <Suspense fallback={<BrandLoader label="Code" message="Loading" />}>
        <Routes>        <Route
          element={
            <ApplicationShell
              application={"code" as ApplicationKey}
              subtitle="Code"
              nav={NAV}
              hosts={HOSTS}
            />
          }
        >
          <Route path="/" element={<Overview application={"code" as ApplicationKey} nav={NAV} />} />
          <Route path="/code-review" element={<Code />} />
          {/* Before /code-review/:section, or the tab router would swallow them. */}
          <Route path="/code-review/scans" element={<ScanHistory />} />
          <Route path="/code-review/scans/:jobId" element={<ScanDetail />} />
          <Route path="/code-review/providers/:provider" element={<ProviderConnect />} />
          <Route path="/code-review/:section" element={<Code />} />
          <Route path="/cicd" element={<CiCd />} />
          <Route path="/threat-models" element={<ThreatModels />} />
          <Route path="/context" element={<ContextProjects />} />
          <Route path="/assistant" element={<Agent />} />
          <Route path="*" element={<NotFound homePath="/" />} />
        </Route>
        {/* Documentation renders outside the sidebar with its own top bar. */}
        <Route element={<DocsChrome />}>
          <Route path="/docs" element={<Docs application="code" />} />
          <Route path="/docs/:docId" element={<DocPage />} />
        </Route>

        </Routes>
      </Suspense>
      <ToastViewport />
      <DualControlOverlay />
      <AiBudgetOverlay />
    </StoreProvider>
  );
}
