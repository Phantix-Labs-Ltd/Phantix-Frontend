import { useState } from "react";
import { getConsent, getMarketingConsent, setConsent, setMarketingConsent } from "../lib/consent";
import { onConsentAccepted } from "../lib/analytics";
import { loadPageSense } from "../lib/pagesense";

/**
 * Minimal, on-brand consent strip with cookie settings. Analytics and the
 * marketing tools are gated on acceptance; nothing is beaconed or loaded until
 * the reader says yes. Readers who answered before the marketing category
 * existed are asked again. The choice is shared with phantixlabs.com, whose
 * /cookies page is where it can be changed later.
 */
export function ConsentBanner() {
  const [visible, setVisible] = useState(() => getConsent() === null || getMarketingConsent() === null);
  const [settings, setSettings] = useState(false);
  const [analytics, setAnalytics] = useState(() => getConsent() === "accepted");
  const [marketing, setMarketing] = useState(() => getMarketingConsent() === "accepted");

  if (!visible) return null;

  const choose = (choice: "accepted" | "declined") => {
    setConsent(choice);
    setMarketingConsent(choice);
    if (choice === "accepted") onConsentAccepted();
    setVisible(false);
  };
  const save = () => {
    setConsent(analytics ? "accepted" : "declined");
    setMarketingConsent(marketing ? "accepted" : "declined");
    if (analytics) onConsentAccepted();
    else loadPageSense();
    setVisible(false);
  };

  return (
    <div className={`consent-banner${settings ? " consent-banner-settings" : ""}`} role="region" aria-label="Cookie consent">
      {settings ? (
        <div className="consent-settings">
          <p className="consent-copy">Choose what to allow. Strictly necessary cookies are always on.</p>
          <label className="consent-option">
            <input type="checkbox" checked={analytics} onChange={(e) => setAnalytics(e.target.checked)} />
            <span><strong>Analytics</strong> Counts page reads so we know which essays to write next.</span>
          </label>
          <label className="consent-option">
            <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} />
            <span><strong>Marketing and experience</strong> Tools that show how readers use the site, such as heatmaps and session recordings. These set cookies.</span>
          </label>
          <div className="consent-actions">
            <button type="button" className="consent-accept" onClick={save}>
              Save preferences
            </button>
            <button type="button" className="consent-decline" onClick={() => setSettings(false)}>
              Back
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="consent-copy">
            We use cookies and analytics to understand how the site is used and to improve your
            experience. Accept, decline, or choose what to allow.{" "}
            <a href="https://phantixlabs.com/cookies">Cookie policy</a>
          </p>
          <div className="consent-actions">
            <button type="button" className="consent-decline" onClick={() => setSettings(true)}>
              Settings
            </button>
            <button type="button" className="consent-decline" onClick={() => choose("declined")}>
              Decline
            </button>
            <button type="button" className="consent-accept" onClick={() => choose("accepted")}>
              Accept
            </button>
          </div>
        </>
      )}
    </div>
  );
}
