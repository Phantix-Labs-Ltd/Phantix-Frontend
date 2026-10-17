// ── Social sign-in (Google / GitHub) via Firebase ────────────────────────────
// The Firebase JS SDK runs the provider popup in the browser and returns an ID
// token; the API verifies it (no secret lives here). Config comes from Vite env
// so a Google API key is never committed to the repo:
//   VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID
//
// The SDK is loaded on demand, never in the entry chunk: imported statically it
// put ~90 KB on every first paint (the login page is in the entry bundle) and
// broke the 600 KB entry budget. Login preloads it once the page has painted, so
// a click still opens the popup immediately (a popup must open close to the
// click, or the browser blocks it).
import type { Auth } from "firebase/auth";

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
};

/** True when the Firebase web config is present; buttons hide when it is not. */
export const firebaseConfigured = Boolean(config.apiKey && config.projectId);

export type SocialProvider = "google" | "github";

type FirebaseAuthModule = typeof import("firebase/auth");

let _sdk: Promise<{ auth: Auth; mod: FirebaseAuthModule }> | null = null;

/** Load and initialize the Firebase SDK once (also used to preload it). */
function loadSdk(): Promise<{ auth: Auth; mod: FirebaseAuthModule }> {
  if (!firebaseConfigured) return Promise.reject(new Error("Social sign-in is not configured on this deployment."));
  if (!_sdk) {
    _sdk = Promise.all([import("firebase/app"), import("firebase/auth")])
      .then(([appMod, mod]) => {
        const app = appMod.getApps().length
          ? appMod.getApps()[0]
          : appMod.initializeApp(config as { apiKey: string; authDomain?: string; projectId: string });
        return { auth: mod.getAuth(app), mod };
      })
      .catch((err) => {
        _sdk = null; // a failed download can be retried
        throw err;
      });
  }
  return _sdk;
}

/** Fetch the SDK in the background so the first click opens the popup at once. */
export function preloadSocialAuth(): void {
  if (firebaseConfigured) void loadSdk().catch(() => {});
}

/**
 * What to tell the user when the provider popup fails, or null when they simply
 * closed it (cancelling is not an error worth a red message).
 */
export function socialAuthErrorMessage(err: unknown): string | null {
  const code = (err as { code?: string } | null)?.code ?? "";
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return null;
  if (code === "auth/popup-blocked") return "Your browser blocked the sign-in window. Allow pop-ups for this site and try again.";
  if (code === "auth/account-exists-with-different-credential")
    return "This email already signs in with another provider. Use that one, or sign in with email.";
  if (code === "auth/network-request-failed") return "Could not reach the sign-in service. Check your connection and try again.";
  if (code === "auth/unauthorized-domain") return "Sign-in with this provider is not enabled for this site yet.";
  return "Sign-in was not completed. Try again.";
}

/** Open the provider popup and return the Firebase ID token to POST to the API. */
export async function socialIdToken(provider: SocialProvider): Promise<string> {
  const { auth, mod } = await loadSdk();
  const providerObj = provider === "github" ? new mod.GithubAuthProvider() : new mod.GoogleAuthProvider();
  const credential = await mod.signInWithPopup(auth, providerObj);
  return credential.user.getIdToken();
}
