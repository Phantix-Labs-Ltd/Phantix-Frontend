import { useSeo as useSeoForRoute } from "@sg/pageTitle";

/**
 * Public, indexable routes on app.phantixlabs.com.
 *
 * Kept in step with the `allow` list in vite.config.ts. "/$" matches the root
 * exactly; "/docs" is a prefix, so it also covers every "/docs/:docId" guide.
 * `/login` is deliberately absent: it stays crawlable so a crawler can read its
 * noindex tag, but the form itself has no content to rank.
 */
export const PUBLIC_PATHS = ["/$", "/docs", "/privacy", "/cookies", "/sandbox-apply"];

/**
 * Keep the document head on the page actually shown. Called once in App(), so
 * it runs on every route: public pages get the title, description, canonical
 * and `index, follow`; everything else is claimed as `noindex, nofollow`.
 */
export function useSeo(): void {
  useSeoForRoute({
    origin: "https://app.phantixlabs.com",
    title: "SecureGraph Core: Security Graph, Findings and Reporting",
    description:
      "One security graph for every finding, asset and risk. Track remediation, run board-ready reports and get real-time alerts from every SecureGraph application.",
    publicPaths: PUBLIC_PATHS,
  });
}
