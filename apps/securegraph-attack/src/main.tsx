import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { MotionConfig } from "framer-motion";
import { bootstrapTheme } from "@sg/theme";
import { initAnalytics } from "@sg/analytics";
import { loadBrandTokens } from "@sg/branding";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import PageErrorBoundary from "@sg/components/PageErrorBoundary";
import App from "./App";
import "./index.css";

bootstrapTheme();
initAnalytics();
loadBrandTokens();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        {/* Last line of defence: nothing renders a blank screen. */}
        <PageErrorBoundary fullScreen>
          <App />
        </PageErrorBoundary>
      </BrowserRouter>
    </MotionConfig>
  </React.StrictMode>,
);
