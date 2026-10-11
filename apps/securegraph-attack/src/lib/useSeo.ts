import { useSeo as useSeoForRoute } from "@sg/pageTitle";

/**
 * Public, indexable routes on attack.phantixlabs.com.
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
    origin: "https://attack.phantixlabs.com",
    title: "SecureGraph Attack: Penetration Testing and VAPT Scans",
    description:
      "Scope VAPT campaigns, run web, API and mobile scans, and let the autonomous pentest agent test your defenses the way an attacker would. Fix what matters.",
    publicPaths: PUBLIC_PATHS,
  });
}
