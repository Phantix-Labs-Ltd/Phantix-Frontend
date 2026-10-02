import { useSeo as useSeoForRoute } from "@sg/pageTitle";

/**
 * Public, indexable routes on defend.phantixlabs.com.
 *
 * The documentation is the only public surface: every other route renders
 * inside the operator shell, which sends a signed-out visitor to Core's sign-in
 * page (`/` included). Kept in step with the `allow` list in vite.config.ts.
 */
export const PUBLIC_PATHS = ["/docs"];

/**
 * Keep the document head on the page actually shown. Called once in App(), so
 * it runs on every route: /docs gets the title, description, canonical and
 * `index, follow`; the operator routes are claimed as `noindex, nofollow`.
 */
export function useSeo(): void {
  useSeoForRoute({
    origin: "https://defend.phantixlabs.com",
    title: "SecureGraph Defend: Continuous Exposure and SOC Monitoring",
    description:
      "Continuously monitor assets, cloud exposure, compliance and risk. Triage alerts, run SOC playbooks and apply threat intelligence from a single console.",
    publicPaths: PUBLIC_PATHS,
  });
}
