import React, { Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { ApplicationShell } from "@sg/shell/ApplicationShell";
import type { ApplicationKey } from "@sg/shell/types";
// Docs load when visited, not with the first paint.
const Docs = React.lazy(() => import("@sg/pages/Docs"));
const DocPage = React.lazy(() => import("@sg/pages/DocPage"));
const DocsChrome = React.lazy(() => import("@sg/pages/DocsChrome"));
import { StoreProvider, ToastViewport } from "@sg/store";
import DualControlOverlay from "@sg/components/DualControlOverlay";
import AiBudgetOverlay from "@sg/components/AiBudgetOverlay";
import ApprovalSentOverlay from "@sg/components/ApprovalSentOverlay";
import { BrandLoader } from "@sg/components/BrandLoader";
import { APP_URL } from "@sg/config";
import { HOSTS } from "./hosts";
import { NAV } from "./nav";
import AgiDrawer from "@sg/components/AgiDrawer";
import SectionGate from "@sg/components/SectionGate";
import { useSeo } from "./lib/useSeo";

const Agent = React.lazy(() => import("@sg/pages/Agent"));
const NotFound = React.lazy(() => import("@sg/pages/NotFound"));
const Overview = React.lazy(() => import("./pages/Overview"));
const Targets = React.lazy(() => import("./pages/Targets"));
const Scans = React.lazy(() => import("./pages/Scans"));
const PentestScope = React.lazy(() => import("./pages/PentestScope"));
const Vapt = React.lazy(() => import("./pages/Vapt"));
const VaptSchedules = React.lazy(() => import("./pages/VaptSchedules"));
const VaptProcedures = React.lazy(() => import("./pages/VaptProcedures"));
const VaptSettings = React.lazy(() => import("./pages/VaptSettings"));
const Mobile = React.lazy(() => import("./pages/Mobile"));
// The remediation queue is the finding tracker now, with fix guidance embedded.
// One shared page keeps the board identical here and in Core.
const Tracker = React.lazy(() => import("@sg/pages/Tracker"));
const PriorReports = React.lazy(() => import("./pages/PriorReports"));

export default function App() {
  // Per-route SEO: /docs stays indexable, every operator route is noindex.
  useSeo();
  return (
    <StoreProvider>
      <Suspense fallback={<BrandLoader label="Attack" message="Loading" />}>
      <Routes>        <Route
          element={
            <ApplicationShell
              application={"attack" as ApplicationKey}
              subtitle="Attack"
              nav={NAV}
              hosts={HOSTS}
            />
          }
        >
          <Route path="/" element={<Overview application={"attack" as ApplicationKey} nav={NAV} />} />
          <Route path="/targets" element={<Targets title="Targets" />} />
          <Route path="/pentest-scope" element={<PentestScope />} />
          <Route
            path="/prior-reports"
            element={
              <SectionGate section="attack.pentest_agent">
                <PriorReports />
              </SectionGate>
            }
          />
          <Route
            path="/pentest-agent"
            element={
              <SectionGate section="attack.pentest_agent">
                <Agent initialMode="agi" allowAgi />
              </SectionGate>
            }
          />
          <Route
            path="/mobile"
            element={
              <SectionGate section="attack.mobile">
                <Mobile />
              </SectionGate>
            }
          />
          <Route path="/vapt" element={<Vapt />} />
          <Route path="/vapt/schedules" element={<VaptSchedules />} />
          <Route path="/vapt/procedures" element={<VaptProcedures />} />
          <Route path="/vapt/settings" element={<VaptSettings />} />
          <Route path="/scans" element={<Scans />} />
          <Route
            path="/tracker"
            element={<Tracker reportHref={`${APP_URL}/reports`} assetBase={`${APP_URL}/assets`} />}
          />
          {/* The old remediation URL is kept as a redirect so bookmarks still work. */}
          <Route path="/remediation" element={<Navigate to="/tracker" replace />} />
          <Route path="/assistant" element={<Agent allowAgi />} />
          <Route path="*" element={<NotFound homePath="/" />} />
        </Route>
        {/* Documentation renders outside the sidebar with its own top bar. */}
        <Route element={<DocsChrome />}>
          <Route path="/docs" element={<Docs application="attack" />} />
          <Route path="/docs/:docId" element={<DocPage />} />
        </Route>

      </Routes>
      </Suspense>
      <ToastViewport />
      <DualControlOverlay />
      <AiBudgetOverlay />
      <ApprovalSentOverlay />
      <AgiDrawer />
    </StoreProvider>
  );
}
